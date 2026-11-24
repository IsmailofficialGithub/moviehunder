"use client";

// Watch-party realtime client: WebSocket + reconnect + clock sync + tiny event emitter.
// Usage:
//   const pc = new PartyClient({ getTicket: async () => (await joinParty(...)).ticket });
//   pc.on("state", ...); pc.connect();
//   pc.serverNow() → current server time (ms) for sync math.

import { estimateClockOffset } from "./syncMath";
import { partyWsUrl } from "./api";

const PING_SAMPLES = 5;
const RESYNC_CLOCK_MS = 30_000;
const MAX_BACKOFF_MS = 15_000;
const FATAL = new Set(["ROOM_NOT_FOUND", "BANNED", "NOT_A_MEMBER", "ROOM_FULL", "KICKED"]);

export class PartyClient {
  /** @param {{ getTicket: () => Promise<string>, url?: string }} opts */
  constructor({ getTicket, url }) {
    this.getTicket = getTicket;
    this.url = url || partyWsUrl();
    this.ws = null;
    this.handlers = new Map();
    this.offset = 0;
    this.rtt = Infinity;
    this.samples = [];
    this.pings = new Map();
    this.pingSeq = 0;
    this.status = "idle"; // idle | connecting | open | reconnecting | closed
    this.closedByUser = false;
    this.attempt = 0;
    this.ticket = null;
    this.timers = new Set();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    for (const fn of this.handlers.get(type) || []) {
      try {
        fn(payload);
      } catch (err) {
        console.error("[party]", type, err);
      }
    }
  }

  setStatus(s) {
    this.status = s;
    this.emit("status", s);
  }

  serverNow() {
    return Date.now() + this.offset;
  }

  async connect() {
    this.closedByUser = false;
    this.setStatus(this.attempt ? "reconnecting" : "connecting");
    try {
      if (!this.ticket) this.ticket = await this.getTicket();
    } catch (err) {
      this.emit("fatal", { code: err?.status === 404 ? "ROOM_NOT_FOUND" : "JOIN_FAILED", message: err?.message });
      this.setStatus("closed");
      return;
    }
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.send({ t: "hello", ticket: this.ticket });
      this.samples = [];
      this.burstPing();
    };
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.onMessage(msg);
    };
    ws.onclose = (ev) => {
      this.clearTimers();
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closedByUser || ev.reason === "ENDED" || FATAL.has(ev.reason)) {
        this.setStatus("closed");
        return;
      }
      // Ticket may have expired (10 min) — fetch a fresh one on reconnect.
      if (ev.reason === "BAD_TICKET") this.ticket = null;
      this.scheduleReconnect();
    };
    ws.onerror = () => {};
  }

  onMessage(msg) {
    switch (msg.t) {
      case "pong": {
        const sent = this.pings.get(msg.id);
        this.pings.delete(msg.id);
        if (sent == null) return;
        this.samples.push({ sent, serverTime: msg.serverTime, received: Date.now() });
        if (this.samples.length > 12) this.samples.shift();
        const est = estimateClockOffset(this.samples);
        this.offset = est.offset;
        this.rtt = est.rtt;
        this.emit("clock", est);
        return;
      }
      case "joined":
        this.attempt = 0;
        this.setStatus("open");
        this.startClockResync();
        break;
      case "error":
        if (msg.fatal) {
          if (msg.code === "BAD_TICKET") this.ticket = null;
          else this.emit("fatal", msg);
        }
        break;
      case "ended":
        this.closedByUser = true;
        break;
      default:
        break;
    }
    this.emit(msg.t, msg);
    this.emit("message", msg);
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  ping() {
    const id = ++this.pingSeq;
    this.pings.set(id, Date.now());
    if (this.pings.size > 20) this.pings.delete(this.pings.keys().next().value);
    this.send({ t: "ping", id });
  }

  burstPing() {
    for (let i = 0; i < PING_SAMPLES; i++) this.later(() => this.ping(), i * 150);
  }

  startClockResync() {
    const iv = setInterval(() => this.burstPing(), RESYNC_CLOCK_MS);
    this.timers.add({ iv });
  }

  later(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(entry);
      fn();
    }, ms);
    const entry = { t };
    this.timers.add(entry);
  }

  clearTimers() {
    for (const e of this.timers) {
      if (e.t) clearTimeout(e.t);
      if (e.iv) clearInterval(e.iv);
    }
    this.timers.clear();
  }

  scheduleReconnect() {
    this.attempt += 1;
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** (this.attempt - 1)) * (0.75 + Math.random() * 0.5);
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  close() {
    this.closedByUser = true;
    clearTimeout(this.reconnectTimer);
    this.clearTimers();
    try {
      this.ws?.close(1000, "bye");
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.setStatus("closed");
  }

  // ── Convenience senders ──
  command(action, extra = {}) {
    return this.send({ t: "cmd", action, ...extra });
  }
  report(position, playing) {
    return this.send({ t: "report", position, playing });
  }
  setMyStatus(status) {
    return this.send({ t: "status", ...status });
  }
  chat(text) {
    return this.send({ t: "chat", text });
  }
  react(emoji) {
    return this.send({ t: "react", emoji });
  }
  changeContent(content) {
    return this.send({ t: "content", content });
  }
  setRole(userId, role) {
    return this.send({ t: "role", userId, role });
  }
  transferHost(userId) {
    return this.send({ t: "transfer_host", userId });
  }
  kick(userId) {
    return this.send({ t: "kick", userId });
  }
  end() {
    return this.send({ t: "end" });
  }
}
