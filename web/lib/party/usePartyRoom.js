"use client";

// React hook that owns a watch-party connection and keeps a <video> in sync with the room.
//
// Sync rules (see server/party/syncMath.js):
//   • HOST's player is the truth: it reports its position, and its play/pause/seek/rate become room commands.
//   • COHOST follows the room like a viewer, but its own play/pause/seek also become commands.
//   • VIEWER follows the room. Pausing or scrubbing locally "detaches" them (everyone else keeps going);
//     "Jump to live" (or catching back up within a few seconds) re-attaches.
//   • Each client picks its own quality — sync is by position, not by stream.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PartyClient } from "./client";
import { joinParty } from "./api";
import { DRIFT, ROLES, canControl, correction, expectedPosition } from "./syncMath";

const LOOP_MS = 1000;
const HOST_REPORT_MS = 1000;
const ECHO_WINDOW_MS = 700;
const SETTLE_MS = 1500; // ignore the player's own autoplay/resume right after a source loads
const MAX_CHAT = 200;
const REACTION_TTL_MS = 4000;

// Debug: in the browser console run  localStorage.partyDebug = "1"  and reload.
const dbg = (...a) => {
  try {
    if (typeof window !== "undefined" && window.localStorage?.getItem("partyDebug") === "1") console.log("[party]", ...a);
  } catch {
    /* storage blocked */
  }
};
const vidId = (v) => (v ? `${v.className?.match?.(/video\w*/g)?.join(".") || "video"}@${v.currentTime?.toFixed?.(1)}s rs${v.readyState}` : "none");

/**
 * @param {{ code: string, initialTicket: string | null, enabled?: boolean }} opts
 */
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
  const [needsGesture, setNeedsGesture] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [voiceAvailable, setVoiceAvailable] = useState(false);

  const clientRef = useRef(null);
  const stateRef = useRef(null);
  const youRef = useRef(null);
  const videoRef = useRef(null);
  const detachedRef = useRef(false);
  const bufferingRef = useRef(false);
  // Per-kind echo windows: our own speed nudges must not swallow a real pause click, etc.
  const echoUntilRef = useRef({ play: 0, pause: 0, seek: 0, rate: 0 });
  // Target of the last seek *we* made: a slow network can deliver its "seeked" long after the echo window.
  const ourSeekRef = useRef(null);
  const armedAtRef = useRef(Infinity);
  const lastReportRef = useRef(0);
  const ticketRef = useRef(initialTicket);
  // Room state at the moment we joined; the host only aligns to it once (rejoining a running party).
  const joinStateRef = useRef(null);

  // NOTE: stateRef is written directly by the socket handlers (not from render), so the sync loop
  // never acts on a state that React hasn't re-rendered yet (that caused play/pause flip-flops).
  youRef.current = you;

  const role = you?.role || ROLES.VIEWER;
  const isHost = role === ROLES.HOST;
  const controls = canControl(role);

  // A ticket from "Create party"/REST join can arrive after the first render — keep the latest one.
  // (Declared before the connection effect so it runs first in the same commit.)
  useEffect(() => {
    if (initialTicket) ticketRef.current = initialTicket;
  }, [initialTicket]);

  // ── Connection ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !code) return undefined;
    const client = new PartyClient({
      getTicket: async () => {
        if (ticketRef.current) {
          const t = ticketRef.current;
          ticketRef.current = null; // single use; later reconnects fetch a fresh one
          return t;
        }
        const res = await joinParty({ code });
        return res.ticket;
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
        stateRef.current = m.state;
        setRoomState(m.state);
        // Explicit commands from someone else are applied right away (host included).
        if (m.action !== "tick" && m.action !== "host_sync" && m.by !== youRef.current?.userId) {
          applyRoomState(m.state, { force: true });
        }
      }),
      client.on("content", (m) => {
        setRoom((r) => (r ? { ...r, content: m.content } : r));
        stateRef.current = m.state;
        setRoomState(m.state);
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
        const r = { id: `${m.at}-${m.userId}-${Math.random()}`, emoji: m.emoji, userId: m.userId, at: Date.now() };
        setReactions((list) => [...list, r].slice(-30));
        setTimeout(() => setReactions((list) => list.filter((x) => x.id !== r.id)), REACTION_TTL_MS);
      }),
      client.on("ended", () => setEnded(true)),
      client.on("fatal", (m) => setFatal(m.code || "ERROR")),
      client.on("error", (m) => !m.fatal && setLastError(m.code)),
    ];
    client.connect();
    return () => {
      offs.forEach((off) => off());
      client.close();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, enabled]);

  // ── Applying room state to the local player ─────────────
  const withEcho = (kind, fn) => {
    echoUntilRef.current[kind] = Date.now() + ECHO_WINDOW_MS;
    fn();
  };

  const safePlay = (video) => {
    const p = video.play();
    if (p?.catch) {
      p.then(() => setNeedsGesture(false)).catch((err) => {
        if (err?.name === "NotAllowedError") setNeedsGesture(true);
      });
    }
  };

  /** Bring the local player to the room state. `force` = explicit command (seek even for the host). */
  const applyRoomState = useCallback((state, { force = false } = {}) => {
    const video = videoRef.current;
    const client = clientRef.current;
    if (!video || !client || !state || video.readyState < 1) return;
    if (detachedRef.current && !force) return;
    if (force && detachedRef.current && youRef.current?.role === ROLES.VIEWER) return;

    const now = client.serverNow();
    const c = correction(state, video.currentTime, now);
    if (c.kind !== "none" || state.playing === video.paused) dbg("apply", { force, kind: c.kind, target: c.target?.toFixed(1), local: video.currentTime.toFixed(1), roomPlaying: state.playing, videoPaused: video.paused });
    const wantRate = c.kind === "nudge" ? c.rate : state.rate || 1;
    // Only open the echo window when we actually touch the player, so real user clicks still count.
    if (c.kind === "seek") {
      const t = Math.max(0, c.target);
      ourSeekRef.current = { t, at: Date.now() };
      withEcho("seek", () => (video.currentTime = t));
    }
    if (state.playing && video.paused) withEcho("play", () => safePlay(video));
    if (!state.playing && !video.paused) withEcho("pause", () => video.pause());
    if (Math.abs(video.playbackRate - wantRate) > 0.001) withEcho("rate", () => (video.playbackRate = wantRate));
  }, []);

  // ── Observing the local player ──────────────────────────
  const onActiveVideo = useCallback((video) => {
    videoRef.current = video;
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let bound = null;
    let cleanup = null;

    const bind = (video) => {
      const isEcho = (kind) => Date.now() < echoUntilRef.current[kind];
      const me = () => youRef.current;
      // Host clicks always count; followers ignore the player's own start-up events.
      const isArmed = () => me()?.role === ROLES.HOST || Date.now() >= armedAtRef.current;
      const client = () => clientRef.current;

      const onReady = () => {
        dbg("ready", vidId(video));
        const st = stateRef.current;
        if (me()?.role === ROLES.HOST) {
          // The host's player is the source of truth: never correct it. Only when (re)joining a party
          // that was already under way do we bring the host to where everyone is — once.
          armedAtRef.current = Date.now();
          const js = joinStateRef.current;
          joinStateRef.current = null;
          if (js && (js.playing || js.position > 1)) applyRoomState(st, { force: true });
          return;
        }
        armedAtRef.current = Date.now() + SETTLE_MS;
        // Align as soon as the new source can seek; repeat once the player settles.
        applyRoomState(st, { force: true });
        setTimeout(() => applyRoomState(stateRef.current, { force: true }), SETTLE_MS);
      };
      const onReset = () => {
        armedAtRef.current = Infinity;
      };

      const detach = (value) => {
        detachedRef.current = value;
        setDetached(value);
        client()?.setMyStatus({ detached: value, buffering: bufferingRef.current });
      };

      const onPlayPause = (e) => {
        dbg("local", e.type, { echo: isEcho(e.type), armed: isArmed(), role: me()?.role, at: video.currentTime.toFixed(1) });
        if (isEcho(e.type)) return;
        if (!isArmed()) {
          // The player's own autoplay/resume: keep it in line with the room instead.
          applyRoomState(stateRef.current, { force: true });
          return;
        }
        const playing = e.type === "play";
        if (canControl(me()?.role)) {
          client()?.command(playing ? "play" : "pause", { position: video.currentTime });
          return;
        }
        if (!playing) detach(true);
        else if (detachedRef.current) maybeRejoin();
      };

      let seekTimer = null;
      const onSeeked = () => {
        const ours = ourSeekRef.current;
        if (ours && Math.abs(video.currentTime - ours.t) < 1 && Date.now() - ours.at < 15_000) {
          ourSeekRef.current = null; // our own correction finished loading — not a user scrub
          return;
        }
        if (isEcho("seek") || !isArmed()) return;
        if (canControl(me()?.role)) {
          // Scrubbing fires many seeks — send only where the drag ends.
          clearTimeout(seekTimer);
          seekTimer = setTimeout(() => client()?.command("seek", { position: video.currentTime }), 250);
          return;
        }
        const st = stateRef.current;
        const c = client();
        if (!st || !c) return;
        const live = expectedPosition(st, c.serverNow());
        if (Math.abs(live - video.currentTime) <= DRIFT.HARD_SEEK) {
          if (detachedRef.current) detach(false);
        } else {
          detach(true);
        }
      };

      const onRate = () => {
        if (isEcho("rate") || !isArmed()) return;
        if (canControl(me()?.role)) {
          const st = stateRef.current;
          const r = video.playbackRate;
          // Ignore our own drift nudges (±5 %) — only real speed changes become commands.
          if (st && Math.abs(r - (st.rate || 1)) > DRIFT.NUDGE_RATE + 0.01) client()?.command("rate", { rate: r });
        }
      };

      const onWaiting = () => {
        bufferingRef.current = true;
        client()?.setMyStatus({ buffering: true, detached: detachedRef.current });
      };
      const onPlaying = () => {
        if (!bufferingRef.current) return;
        bufferingRef.current = false;
        client()?.setMyStatus({ buffering: false, detached: detachedRef.current });
        // Stalled viewers jump back to live once their stream recovers (the host is never corrected).
        if (!detachedRef.current && me()?.role !== ROLES.HOST) applyRoomState(stateRef.current);
      };

      const evts = [
        ["loadedmetadata", onReady],
        ["emptied", onReset],
        ["loadstart", onReset],
        ["play", onPlayPause],
        ["pause", onPlayPause],
        ["seeked", onSeeked],
        ["ratechange", onRate],
        ["waiting", onWaiting],
        ["playing", onPlaying],
      ];
      evts.forEach(([n, fn]) => video.addEventListener(n, fn));
      if (video.readyState >= 1) onReady();
      return () => {
        clearTimeout(seekTimer);
        evts.forEach(([n, fn]) => video.removeEventListener(n, fn));
      };
    };

    const maybeRejoin = () => {
      const video = videoRef.current;
      const st = stateRef.current;
      const c = clientRef.current;
      if (!video || !st || !c) return;
      if (Math.abs(expectedPosition(st, c.serverNow()) - video.currentTime) <= DRIFT.AUTO_REJOIN) {
        detachedRef.current = false;
        setDetached(false);
        c.setMyStatus({ detached: false, buffering: bufferingRef.current });
        applyRoomState(st);
      }
    };

    // Re-bind when the player swaps <video> elements (quality switch) + run the sync loop.
    const loop = setInterval(() => {
      const video = videoRef.current;
      if (video !== bound) {
        dbg("bind", vidId(video));
        cleanup?.();
        cleanup = video ? bind(video) : null;
        bound = video;
      }
      const c = clientRef.current;
      const st = stateRef.current;
      const me = youRef.current;
      if (!video || !c || !st || !me || c.status !== "open" || video.readyState < 1) return;

      const live = expectedPosition(st, c.serverNow());
      setBehindBy(Math.max(0, Math.round(live - video.currentTime))); // whole seconds → few re-renders

      if (me.role === ROLES.HOST) {
        const now = Date.now();
        if (now - lastReportRef.current >= HOST_REPORT_MS && now >= armedAtRef.current) {
          lastReportRef.current = now;
          c.report(video.currentTime, !video.paused);
        }
        return;
      }
      if (detachedRef.current) {
        // A detached viewer who has caught back up (e.g. pressed play quickly) re-attaches.
        if (!video.paused && Math.abs(live - video.currentTime) <= DRIFT.IGNORE) maybeRejoin();
        return;
      }
      if (!bufferingRef.current && Date.now() >= armedAtRef.current) applyRoomState(st);
    }, LOOP_MS);

    return () => {
      clearInterval(loop);
      cleanup?.();
    };
  }, [enabled, applyRoomState]);

  // ── Actions ─────────────────────────────────────────────
  const jumpToLive = useCallback(() => {
    detachedRef.current = false;
    setDetached(false);
    setNeedsGesture(false);
    clientRef.current?.setMyStatus({ detached: false, buffering: bufferingRef.current });
    applyRoomState(stateRef.current, { force: true });
    const video = videoRef.current;
    if (video && stateRef.current?.playing && video.paused) safePlay(video);
  }, [applyRoomState]);

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
      clearError: () => setLastError(null),
    }),
    [jumpToLive]
  );

  return {
    status,
    you,
    role,
    isHost,
    canControl: controls,
    room,
    members,
    chat,
    roomState,
    reactions,
    ended,
    fatal,
    lastError,
    detached,
    behindBy,
    needsGesture,
    onActiveVideo,
    actions,
    voiceAvailable,
    getClient: () => clientRef.current,
    getVideo: () => videoRef.current,
  };
}

function upsert(list, member) {
  const i = list.findIndex((m) => m.userId === member.userId);
  if (i < 0) return [...list, member];
  const next = list.slice();
  next[i] = { ...next[i], ...member };
  return next;
}
