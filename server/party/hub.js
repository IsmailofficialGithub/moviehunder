// Watch-party room hub: in-memory live rooms, message handling, host handover.
// Persistence goes through an injected `store` (see store.js) so this file has no
// direct DB/Redis dependency and can be unit-tested with a fake store and clock.

import {
  ROLES,
  applyCommand,
  canControl,
  expectedPosition,
  initialState,
  pickNextHost,
  reconcileHostReport,
} from "./syncMath.js";

export const LIMITS = Object.freeze({
  CHAT_MAX_LEN: 500,
  CHAT_HISTORY: 50,
  CHAT_PER_5S: 5,
  REACT_PER_5S: 10,
  CMD_PER_S: 10,
  HOST_GRACE_MS: 30_000,
  EMPTY_ROOM_MS: 30 * 60_000, // an empty room survives 30 min so friends can still join later
  TICK_MS: 5_000,
});

export class PartyHub {
  /**
   * @param {{ store: any, now?: () => number, setTimer?: Function, clearTimer?: Function, log?: Function }} deps
   */
  constructor({ store, media = null, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, log = console }) {
    this.store = store;
    /** Optional voice SFU (party/media.js). Null → voice disabled. */
    this.media = media;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.log = log;
    /** @type {Map<string, any>} */
    this.rooms = new Map();
    /** @type {Map<string, Promise<any>>} */
    this.loading = new Map();
  }

  // ── Connection lifecycle ────────────────────────────────

  /**
   * Attach an authenticated socket to a room.
   * @param {{ send: (msg: object) => void, close: (code?: number, reason?: string) => void }} socket
   * @param {{ userId: string, roomId: string }} ticket
   */
  async join(socket, ticket) {
    const room = await this.getRoom(ticket.roomId);
    if (!room) return this.reject(socket, "ROOM_NOT_FOUND");
    const member = await this.store.loadMember(room.id, ticket.userId);
    if (!member || member.banned) return this.reject(socket, member?.banned ? "BANNED" : "NOT_A_MEMBER");

    let m = room.members.get(ticket.userId);
    const isOnline = m && m.sockets.size > 0;
    if (!isOnline && room.hostUserId !== ticket.userId && this.onlineCount(room) >= room.maxMembers) {
      return this.reject(socket, "ROOM_FULL");
    }
    if (!m) {
      const user = await this.store.loadUser(ticket.userId);
      m = {
        userId: ticket.userId,
        name: displayNameFor(user, ticket.userId),
        avatarUrl: user?.avatarUrl || null,
        role: room.hostUserId === ticket.userId ? ROLES.HOST : member.role || ROLES.VIEWER,
        joinedAt: this.now(),
        sockets: new Set(),
        status: { buffering: false, detached: false },
        buckets: {},
      };
      room.members.set(ticket.userId, m);
    }
    m.sockets.add(socket);
    socket.userId = ticket.userId;
    socket.roomId = room.id;

    if (room.hostUserId === ticket.userId && room.hostGrace) {
      this.clearTimer(room.hostGrace);
      room.hostGrace = null;
    }
    if (room.emptyTimer) {
      this.clearTimer(room.emptyTimer);
      room.emptyTimer = null;
    }

    socket.send({
      t: "joined",
      you: { userId: m.userId, role: m.role },
      room: this.roomSnapshot(room),
      members: this.memberList(room),
      state: room.state,
      serverTime: this.now(),
      chat: room.chat,
      voice: Boolean(this.media?.ready),
    });
    if (!isOnline) {
      this.broadcast(room, { t: "member_join", member: publicMember(m) }, socket);
      this.syncOnline(room);
    }
    return true;
  }

  async leave(socket) {
    this.media?.removePeer(socket.roomId, socket);
    const room = this.rooms.get(socket.roomId);
    if (!room) return;
    const m = room.members.get(socket.userId);
    if (!m) return;
    m.sockets.delete(socket);
    if (m.sockets.size > 0) return; // another tab still connected

    this.broadcast(room, { t: "member_leave", userId: m.userId });
    this.syncOnline(room);
    this.store.markLeft(room.id, m.userId).catch(() => {});

    if (m.userId === room.hostUserId && !room.hostGrace) {
      room.hostGrace = this.setTimer(() => {
        room.hostGrace = null;
        this.handoverHost(room).catch((e) => this.log.error?.("[party] handover", e));
      }, LIMITS.HOST_GRACE_MS);
    }
    if (this.onlineCount(room) === 0 && !room.emptyTimer) {
      room.emptyTimer = this.setTimer(() => {
        room.emptyTimer = null;
        if (this.onlineCount(room) === 0) this.unload(room, { end: true });
      }, LIMITS.EMPTY_ROOM_MS);
    }
  }

  reject(socket, code) {
    socket.send({ t: "error", code, fatal: true });
    socket.close(4000, code);
    return false;
  }

  // ── Messages ────────────────────────────────────────────

  async handle(socket, msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "ping") {
      socket.send({ t: "pong", id: msg.id, serverTime: this.now() });
      return;
    }
    const room = this.rooms.get(socket.roomId);
    const m = room?.members.get(socket.userId);
    if (!room || !m) return;
    const fail = (code) => socket.send({ t: "error", code, rid: msg.rid });

    if (typeof msg.t === "string" && msg.t.startsWith("rtc.")) {
      if (!this.media) return socket.send({ t: "rtc", rid: msg.rid, ok: false, error: "VOICE_UNAVAILABLE" });
      if (!this.allow(m, "rtc", 40, 1000)) return socket.send({ t: "rtc", rid: msg.rid, ok: false, error: "RATE_LIMITED" });
      return this.media.handle(socket, msg, {
        broadcast: (out) => this.broadcast(room, out),
        // Host can mute anyone; co-host can mute viewers.
        hostMute: (targetUserId) => {
          const target = room.members.get(targetUserId);
          if (!target || target.userId === m.userId) return false;
          return m.role === ROLES.HOST || (m.role === ROLES.COHOST && target.role === ROLES.VIEWER);
        },
      });
    }

    switch (msg.t) {
      case "cmd": {
        if (!this.allow(m, "cmd", LIMITS.CMD_PER_S, 1000)) return fail("RATE_LIMITED");
        const res = applyCommand(room.state, msg, m.role, this.now());
        if (!res.ok) return fail(res.error);
        this.setState(room, res.state, { by: m.userId, action: msg.action });
        return;
      }
      case "report": {
        if (m.userId !== room.hostUserId) return;
        const next = reconcileHostReport(room.state, msg, this.now());
        if (next) this.setState(room, next, { by: m.userId, action: "host_sync" });
        return;
      }
      case "status": {
        const buffering = Boolean(msg.buffering);
        const detached = Boolean(msg.detached);
        if (buffering === m.status.buffering && detached === m.status.detached) return;
        m.status = { buffering, detached };
        this.broadcast(room, { t: "member", member: publicMember(m) });
        return;
      }
      case "content": {
        // Changing title/episode ("next") is the room creator's call only.
        if (m.role !== ROLES.HOST) return fail("FORBIDDEN");
        const content = sanitizeContent(msg.content);
        if (!content) return fail("BAD_CONTENT");
        room.content = content;
        await this.store.updateContent(room.id, content, m.userId).catch(() => {});
        this.setState(room, initialState(this.now()), { by: m.userId, action: "content", silent: true });
        this.broadcast(room, { t: "content", content, state: room.state, by: m.userId, serverTime: this.now() });
        return;
      }
      case "chat": {
        const text = String(msg.text ?? "").trim().slice(0, LIMITS.CHAT_MAX_LEN);
        if (!text) return;
        if (!this.allow(m, "chat", LIMITS.CHAT_PER_5S, 5000)) return fail("RATE_LIMITED");
        const entry = { id: `${this.now()}-${Math.random().toString(36).slice(2, 8)}`, userId: m.userId, name: m.name, text, at: this.now() };
        room.chat.push(entry);
        if (room.chat.length > LIMITS.CHAT_HISTORY) room.chat.shift();
        this.broadcast(room, { t: "chat", msg: entry });
        return;
      }
      case "react": {
        const emoji = String(msg.emoji ?? "").slice(0, 16);
        if (!emoji || !this.allow(m, "react", LIMITS.REACT_PER_5S, 5000)) return;
        this.broadcast(room, { t: "react", userId: m.userId, emoji, at: this.now() });
        return;
      }
      case "role": {
        if (m.role !== ROLES.HOST) return fail("FORBIDDEN");
        const target = room.members.get(String(msg.userId));
        const role = msg.role === ROLES.COHOST ? ROLES.COHOST : ROLES.VIEWER;
        if (!target || target.userId === m.userId) return fail("BAD_TARGET");
        target.role = role;
        await this.store.setRole(room.id, target.userId, role).catch(() => {});
        this.broadcast(room, { t: "member", member: publicMember(target) });
        return;
      }
      case "transfer_host": {
        if (m.role !== ROLES.HOST) return fail("FORBIDDEN");
        const target = room.members.get(String(msg.userId));
        if (!target || target.sockets.size === 0 || target.userId === m.userId) return fail("BAD_TARGET");
        await this.setHost(room, target.userId, m.userId);
        return;
      }
      case "kick": {
        const target = room.members.get(String(msg.userId));
        if (!target || target.userId === m.userId) return fail("BAD_TARGET");
        const allowed = m.role === ROLES.HOST || (m.role === ROLES.COHOST && target.role === ROLES.VIEWER);
        if (!allowed) return fail("FORBIDDEN");
        await this.store.ban(room.id, target.userId).catch(() => {});
        for (const s of [...target.sockets]) this.reject(s, "KICKED");
        target.sockets.clear();
        room.members.delete(target.userId);
        this.broadcast(room, { t: "member_leave", userId: target.userId, kicked: true });
        this.syncOnline(room);
        return;
      }
      case "end": {
        if (m.role !== ROLES.HOST) return fail("FORBIDDEN");
        await this.unload(room, { end: true, by: m.userId });
        return;
      }
      default:
        return fail("BAD_TYPE");
    }
  }

  // ── Room state ──────────────────────────────────────────

  async getRoom(roomId) {
    if (this.rooms.has(roomId)) return this.rooms.get(roomId);
    if (this.loading.has(roomId)) return this.loading.get(roomId);
    const p = (async () => {
      const row = await this.store.loadRoom(roomId);
      if (!row || row.endedAt) return null;
      const saved = await this.store.loadState(roomId).catch(() => null);
      const room = {
        id: row.id,
        code: row.code,
        name: row.name || null,
        visibility: row.visibility,
        hostUserId: row.hostUserId,
        maxMembers: row.maxMembers,
        content: {
          subjectId: row.subjectId,
          detailPath: row.detailPath,
          se: row.se,
          ep: row.ep,
          title: row.title,
          poster: row.poster,
        },
        state: saved || initialState(this.now()),
        members: new Map(),
        chat: [],
        hostGrace: null,
        emptyTimer: null,
      };
      this.rooms.set(roomId, room);
      return room;
    })();
    this.loading.set(roomId, p);
    try {
      return await p;
    } finally {
      this.loading.delete(roomId);
    }
  }

  setState(room, state, { by, action, silent = false }) {
    room.state = state;
    this.store.saveState(room.id, state).catch(() => {});
    if (!silent) this.broadcast(room, { t: "state", state, by, action, serverTime: this.now() });
  }

  async handoverHost(room) {
    const host = room.members.get(room.hostUserId);
    if (host && host.sockets.size > 0) return;
    const online = [...room.members.values()].filter((x) => x.sockets.size > 0);
    const next = pickNextHost(online, room.hostUserId);
    if (next) await this.setHost(room, next, room.hostUserId);
  }

  async setHost(room, newHostId, oldHostId) {
    const prev = room.members.get(oldHostId);
    if (prev) prev.role = ROLES.COHOST;
    const next = room.members.get(newHostId);
    if (next) next.role = ROLES.HOST;
    room.hostUserId = newHostId;
    await this.store.setHost(room.id, newHostId, oldHostId).catch(() => {});
    this.broadcast(room, { t: "host", userId: newHostId, previous: oldHostId });
    if (prev) this.broadcast(room, { t: "member", member: publicMember(prev) });
    if (next) this.broadcast(room, { t: "member", member: publicMember(next) });
  }

  async unload(room, { end = false, by = null } = {}) {
    this.media?.closeRoom(room.id);
    if (room.hostGrace) this.clearTimer(room.hostGrace);
    if (room.emptyTimer) this.clearTimer(room.emptyTimer);
    if (end) {
      await this.store.endRoom(room.id, by).catch(() => {});
      for (const m of room.members.values()) {
        for (const s of m.sockets) {
          s.send({ t: "ended", by });
          s.close(4001, "ENDED");
        }
      }
    }
    this.rooms.delete(room.id);
    this.store.setOnline(room.id, 0).catch(() => {});
  }

  /** Called when the creator changed room settings via REST. */
  settingsChanged(roomId, settings) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const next = {};
    if (settings.name !== undefined) next.name = settings.name ?? null;
    if (settings.visibility === "PUBLIC" || settings.visibility === "PRIVATE") next.visibility = settings.visibility;
    if (Number.isFinite(Number(settings.maxMembers))) next.maxMembers = Number(settings.maxMembers);
    Object.assign(room, next);
    this.broadcast(room, { t: "room_settings", settings: next });
  }

  /** Called when a room was ended elsewhere (REST). */
  endedExternally(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const m of room.members.values()) {
      for (const s of m.sockets) {
        s.send({ t: "ended" });
        s.close(4001, "ENDED");
      }
    }
    this.unload(room, { end: false }).catch(() => {});
  }

  /** Periodic state broadcast so clients correct drift even without commands. */
  tick() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (this.onlineCount(room) === 0) continue;
      this.broadcast(room, { t: "state", state: room.state, action: "tick", serverTime: now });
    }
  }

  // ── Helpers ─────────────────────────────────────────────

  broadcast(room, msg, except) {
    for (const m of room.members.values()) {
      for (const s of m.sockets) if (s !== except) s.send(msg);
    }
  }

  onlineCount(room) {
    let n = 0;
    for (const m of room.members.values()) if (m.sockets.size > 0) n++;
    return n;
  }

  syncOnline(room) {
    this.store.setOnline(room.id, this.onlineCount(room)).catch(() => {});
  }

  memberList(room) {
    return [...room.members.values()].filter((m) => m.sockets.size > 0).map(publicMember);
  }

  roomSnapshot(room) {
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      visibility: room.visibility,
      hostUserId: room.hostUserId,
      maxMembers: room.maxMembers,
      content: room.content,
      livePosition: expectedPosition(room.state, this.now()),
    };
  }

  /** Token bucket-ish limiter: at most `max` events per `windowMs` per member+kind. */
  allow(m, kind, max, windowMs) {
    const now = this.now();
    const b = (m.buckets[kind] ||= []);
    while (b.length && now - b[0] > windowMs) b.shift();
    if (b.length >= max) return false;
    b.push(now);
    return true;
  }
}

/** Public name for a member. Never derived from the email (it is shown to everyone in the room). */
export function displayNameFor(user, userId) {
  const name = String(user?.displayName || "").trim().slice(0, 40);
  if (name) return name;
  let h = 0;
  for (const ch of String(userId || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `Guest ${h.toString(36).toUpperCase().slice(-4).padStart(4, "0")}`;
}

function publicMember(m) {
  return {
    userId: m.userId,
    name: m.name,
    avatarUrl: m.avatarUrl,
    role: m.role,
    online: m.sockets.size > 0,
    buffering: m.status.buffering,
    detached: m.status.detached,
  };
}

function sanitizeContent(c) {
  if (!c || typeof c !== "object") return null;
  const subjectId = String(c.subjectId ?? "").trim();
  const detailPath = String(c.detailPath ?? "").trim().slice(0, 300);
  if (!/^\d{1,40}$/.test(subjectId) || !detailPath) return null;
  const s = (v, n) => (v == null ? null : String(v).slice(0, n));
  return {
    subjectId,
    detailPath,
    se: s(c.se, 6) || "0",
    ep: s(c.ep, 6) || "0",
    title: s(c.title, 200),
    poster: s(c.poster, 500),
  };
}
