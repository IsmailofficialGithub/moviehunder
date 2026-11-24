// Mobile watch-party hook — same rules as web/lib/party/usePartyRoom.js, adapted to expo-video.
//
// expo-video has no "seeked" event, so play.js calls `onLocalSeek()` from its own seek handlers.
// Buffering comes from statusChange ("loading" after "readyToPlay"); readiness from sourceLoad.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PartyClient } from "./client";
import { joinParty } from "./api";
import { DRIFT, ROLES, canControl, correction, expectedPosition } from "./syncMath";

const LOOP_MS = 1000;
const HOST_REPORT_MS = 1000;
const ECHO_WINDOW_MS = 900;
const SETTLE_MS = 2000; // play.js runs a muted preload/autoplay right after a source loads
// Catching up: jump ahead of the live point by this viewer's measured load time, and never stack
// a new seek on one that is still loading (that caused endless buffering for new joiners).
const LEAD_DEFAULT_S = 2.5;
const LEAD_MIN_S = 1;
const LEAD_MAX_S = 8;
const SEEK_PENDING_MAX_MS = 15_000;
const MAX_CHAT = 200;
const REACTION_TTL_MS = 4000;

export function usePartyRoom({ code, initialTicket, enabled = true }) {
  const [status, setStatus] = useState("idle");
  const [you, setYou] = useState(null);
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [chat, setChat] = useState([]);
  const [roomState, setRoomState] = useState(null);
  const [ended, setEnded] = useState(false);
  const [fatal, setFatal] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [detached, setDetached] = useState(false);
  const [behindBy, setBehindBy] = useState(0);
  const [voiceAvailable, setVoiceAvailable] = useState(false);

  const clientRef = useRef(null);
  const stateRef = useRef(null);
  const youRef = useRef(null);
  const playerRef = useRef(null);
  const pendingSeekRef = useRef(null); // sync seek still loading { t, at }
  const seekLeadRef = useRef(LEAD_DEFAULT_S); // learned load time (s) for jumping ahead
  const detachedRef = useRef(false);
  const bufferingRef = useRef(false);
  const readyRef = useRef(false);
  const echoUntilRef = useRef({ play: 0, pause: 0, seek: 0, rate: 0 });
  const armedAtRef = useRef(Infinity);
  const lastReportRef = useRef(0);
  const ticketRef = useRef(initialTicket);
  const playerSubsRef = useRef([]);
  const joinStateRef = useRef(null);

  youRef.current = you; // stateRef is written by the socket handlers, never from render
  const role = you?.role || ROLES.VIEWER;

  useEffect(() => {
    if (initialTicket) ticketRef.current = initialTicket;
  }, [initialTicket]);

  // ── Applying room state to the player ───────────────────
  const withEcho = (kind, fn) => {
    echoUntilRef.current[kind] = Date.now() + ECHO_WINDOW_MS;
    try {
      fn();
    } catch {
      /* player released */
    }
  };

  const applyRoomState = useCallback((state, { force = false } = {}) => {
    const player = playerRef.current;
    const client = clientRef.current;
    if (!player || !client || !state || !readyRef.current) return;
    if (detachedRef.current && !force) return;
    if (force && detachedRef.current && youRef.current?.role === ROLES.VIEWER) return;

    let current = 0;
    let playing = false;
    let rate = 1;
    try {
      current = player.currentTime || 0;
      playing = Boolean(player.playing);
      rate = player.playbackRate || 1;
    } catch {
      return;
    }
    const c = correction(state, current, client.serverNow());
    const wantRate = c.kind === "nudge" ? c.rate : state.rate || 1;
    if (c.kind === "seek") {
      const follower = youRef.current?.role !== ROLES.HOST;
      const pend = pendingSeekRef.current;
      const stillLoading = pend && Date.now() - pend.at < SEEK_PENDING_MAX_MS;
      if (!stillLoading || Math.abs(c.target - pend.t) > seekLeadRef.current + 8) {
        const t = Math.max(0, state.playing && follower ? c.target + seekLeadRef.current : c.target);
        pendingSeekRef.current = { t, at: Date.now() };
        withEcho("seek", () => (player.currentTime = t));
      }
    }
    if (state.playing && !playing) withEcho("play", () => player.play());
    if (!state.playing && playing) withEcho("pause", () => player.pause());
    if (Math.abs(rate - wantRate) > 0.001) withEcho("rate", () => (player.playbackRate = wantRate));
  }, []);

  const setDetachedBoth = useCallback((value) => {
    detachedRef.current = value;
    setDetached(value);
    clientRef.current?.setMyStatus({ detached: value, buffering: bufferingRef.current });
  }, []);

  const maybeRejoin = useCallback(() => {
    const player = playerRef.current;
    const st = stateRef.current;
    const c = clientRef.current;
    if (!player || !st || !c) return;
    const live = expectedPosition(st, c.serverNow());
    if (Math.abs(live - (player.currentTime || 0)) <= DRIFT.AUTO_REJOIN) {
      setDetachedBoth(false);
      applyRoomState(st);
    }
  }, [applyRoomState, setDetachedBoth]);

  // ── Connection ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !code) return undefined;
    const client = new PartyClient({
      getTicket: async () => {
        if (ticketRef.current) {
          const t = ticketRef.current;
          ticketRef.current = null;
          return t;
        }
        return (await joinParty({ code })).ticket;
      },
    });
    clientRef.current = client;

    const offs = [
      client.on("status", setStatus),
      client.on("joined", (m) => {
        setYou(m.you);
        setRoom(m.room);
        setMembers(m.members || []);
        setChat(m.chat || []);
        stateRef.current = m.state;
        setRoomState(m.state);
        setVoiceAvailable(Boolean(m.voice));
        joinStateRef.current = m.state;
      }),
      client.on("state", (m) => {
        setRoomState(m.state);
        stateRef.current = m.state;
        if (m.action !== "tick" && m.action !== "host_sync" && m.by !== youRef.current?.userId) {
          applyRoomState(m.state, { force: true });
        }
      }),
      client.on("content", (m) => {
        setRoom((r) => (r ? { ...r, content: m.content } : r));
        stateRef.current = m.state;
        setRoomState(m.state);
        readyRef.current = false;
        armedAtRef.current = Infinity;
        detachedRef.current = false;
        setDetached(false);
      }),
      client.on("room_settings", (m) => setRoom((r) => (r ? { ...r, ...(m.settings || {}) } : r))),
      client.on("member_join", (m) => setMembers((list) => upsert(list, m.member))),
      client.on("member", (m) => {
        setMembers((list) => upsert(list, m.member));
        if (m.member.userId === youRef.current?.userId) setYou((y) => (y ? { ...y, role: m.member.role } : y));
      }),
      client.on("member_leave", (m) => setMembers((list) => list.filter((x) => x.userId !== m.userId))),
      client.on("host", (m) => {
        setRoom((r) => (r ? { ...r, hostUserId: m.userId } : r));
        setYou((y) => {
          if (!y) return y;
          if (y.userId === m.userId) return { ...y, role: ROLES.HOST };
          if (y.userId === m.previous) return { ...y, role: ROLES.COHOST };
          return y;
        });
      }),
      client.on("chat", (m) => setChat((list) => [...list, m.msg].slice(-MAX_CHAT))),
      client.on("react", (m) => {
        const r = { id: `${m.at}-${m.userId}-${Math.random()}`, emoji: m.emoji, at: Date.now() };
        setReactions((list) => [...list, r].slice(-20));
        setTimeout(() => setReactions((list) => list.filter((x) => x.id !== r.id)), REACTION_TTL_MS);
      }),
      client.on("ended", () => setEnded(true)),
      client.on("fatal", (m) => setFatal(m.code || "ERROR")),
    ];
    client.connect();
    return () => {
      offs.forEach((off) => off());
      client.close();
      clientRef.current = null;
    };
  }, [code, enabled, applyRoomState]);

  // ── Player events ───────────────────────────────────────
  const isEcho = (kind) => Date.now() < echoUntilRef.current[kind];
  const isHostNow = () => youRef.current?.role === ROLES.HOST;
  const isArmed = () => isHostNow() || Date.now() >= armedAtRef.current;

  const onReady = useCallback(() => {
    readyRef.current = true;
    if (isHostNow()) {
      // Host is the source of truth; align once only when rejoining a party already under way.
      armedAtRef.current = Date.now();
      const js = joinStateRef.current;
      joinStateRef.current = null;
      if (js && (js.playing || js.position > 1)) applyRoomState(stateRef.current, { force: true });
      return;
    }
    armedAtRef.current = Date.now() + SETTLE_MS;
    applyRoomState(stateRef.current, { force: true });
    setTimeout(() => applyRoomState(stateRef.current, { force: true }), SETTLE_MS);
  }, [applyRoomState]);

  const onPlayer = useCallback(
    (player) => {
      playerSubsRef.current.forEach((s) => s?.remove?.());
      playerSubsRef.current = [];
      playerRef.current = player;
      readyRef.current = false;
      armedAtRef.current = Infinity;
      if (!player) return;

      const sub = (name, fn) => {
        try {
          playerSubsRef.current.push(player.addListener(name, fn));
        } catch {
          /* unsupported event */
        }
      };

      sub("sourceLoad", onReady);
      sub("statusChange", ({ status: st }) => {
        if (st === "readyToPlay") {
          const pend = pendingSeekRef.current;
          if (pend) {
            // Our sync seek became playable: learn how long this device needs.
            pendingSeekRef.current = null;
            const took = (Date.now() - pend.at) / 1000;
            const next = 0.6 * seekLeadRef.current + 0.4 * (took + 0.5);
            seekLeadRef.current = Math.min(LEAD_MAX_S, Math.max(LEAD_MIN_S, next));
          }
          if (!readyRef.current) onReady();
          if (bufferingRef.current) {
            bufferingRef.current = false;
            clientRef.current?.setMyStatus({ buffering: false, detached: detachedRef.current });
            if (!detachedRef.current && !isHostNow()) applyRoomState(stateRef.current);
          }
        } else if (st === "loading" && readyRef.current && !bufferingRef.current) {
          bufferingRef.current = true;
          clientRef.current?.setMyStatus({ buffering: true, detached: detachedRef.current });
        }
      });
      sub("playingChange", ({ isPlaying }) => {
        if (isEcho(isPlaying ? "play" : "pause")) return;
        if (!isArmed()) {
          applyRoomState(stateRef.current, { force: true });
          return;
        }
        if (bufferingRef.current) return; // stalls toggle isPlaying; not a user action
        if (canControl(youRef.current?.role)) {
          clientRef.current?.command(isPlaying ? "play" : "pause", { position: player.currentTime || 0 });
          return;
        }
        // Followers can't pause/resume on their own — put them straight back on the live room.
        applyRoomState(stateRef.current, { force: true });
      });
      sub("playbackRateChange", ({ playbackRate }) => {
        if (isEcho("rate") || !isArmed()) return;
        if (!canControl(youRef.current?.role)) {
          // Followers can't change speed — snap back (our drift nudges are echoes, skipped above).
          applyRoomState(stateRef.current, { force: true });
          return;
        }
        const st = stateRef.current;
        if (st && Math.abs(playbackRate - (st.rate || 1)) > DRIFT.NUDGE_RATE + 0.01) {
          clientRef.current?.command("rate", { rate: playbackRate });
        }
      });
      if (player.status === "readyToPlay") onReady();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onReady, applyRoomState, setDetachedBoth, maybeRejoin]
  );

  /** Called by play.js right after the user seeks (expo-video has no seek event). Debounced: scrubbing fires often. */
  const seekTimerRef = useRef(null);
  const onLocalSeek = useCallback(() => {
    clearTimeout(seekTimerRef.current);
    seekTimerRef.current = setTimeout(() => flushLocalSeek(), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const flushLocalSeek = () => {
    const player = playerRef.current;
    if (!player || !isArmed()) return;
    const pos = player.currentTime || 0;
    if (canControl(youRef.current?.role)) {
      clientRef.current?.command("seek", { position: pos });
      return;
    }
    // Followers can't scrub — snap back to the live position.
    applyRoomState(stateRef.current, { force: true });
  };

  // ── Sync loop ───────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return undefined;
    const loop = setInterval(() => {
      const player = playerRef.current;
      const c = clientRef.current;
      const st = stateRef.current;
      const me = youRef.current;
      if (!player || !c || !st || !me || c.status !== "open" || !readyRef.current) return;
      let pos = 0;
      let playing = false;
      try {
        pos = player.currentTime || 0;
        playing = Boolean(player.playing);
      } catch {
        return;
      }
      const live = expectedPosition(st, c.serverNow());
      setBehindBy(Math.max(0, Math.round(live - pos)));

      if (me.role === ROLES.HOST) {
        const now = Date.now();
        if (now - lastReportRef.current >= HOST_REPORT_MS && now >= armedAtRef.current) {
          lastReportRef.current = now;
          c.report(pos, playing);
        }
        return;
      }
      if (detachedRef.current) {
        if (playing && Math.abs(live - pos) <= DRIFT.IGNORE) maybeRejoin();
        return;
      }
      if (!bufferingRef.current && Date.now() >= armedAtRef.current) applyRoomState(st);
    }, LOOP_MS);
    return () => clearInterval(loop);
  }, [enabled, applyRoomState, maybeRejoin]);

  useEffect(
    () => () => {
      playerSubsRef.current.forEach((s) => s?.remove?.());
      playerSubsRef.current = [];
    },
    []
  );

  const jumpToLive = useCallback(() => {
    setDetachedBoth(false);
    applyRoomState(stateRef.current, { force: true });
  }, [applyRoomState, setDetachedBoth]);

  const actions = useMemo(
    () => ({
      jumpToLive,
      sendChat: (text) => clientRef.current?.chat(text),
      react: (emoji) => clientRef.current?.react(emoji),
      setRole: (userId, r) => clientRef.current?.setRole(userId, r),
      transferHost: (userId) => clientRef.current?.transferHost(userId),
      kick: (userId) => clientRef.current?.kick(userId),
      end: () => clientRef.current?.end(),
      navigate: (target) =>
        clientRef.current?.changeContent({
          subjectId: String(target.subjectId),
          detailPath: target.detailPath,
          se: String(target.se ?? "0"),
          ep: String(target.ep ?? "0"),
          title: target.title || null,
          poster: target.poster || null,
        }),
    }),
    [jumpToLive]
  );

  return {
    status,
    you,
    role,
    isHost: role === ROLES.HOST,
    canControl: canControl(role),
    room,
    members,
    chat,
    roomState,
    reactions,
    ended,
    fatal,
    detached,
    behindBy,
    onPlayer,
    onLocalSeek,
    actions,
    voiceAvailable,
    getClient: () => clientRef.current,
    getPlayer: () => playerRef.current,
  };
}

function upsert(list, member) {
  const i = list.findIndex((m) => m.userId === member.userId);
  if (i < 0) return [...list, member];
  const next = list.slice();
  next[i] = { ...next[i], ...member };
  return next;
}
