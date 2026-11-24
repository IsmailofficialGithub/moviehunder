// COPY of server/party/syncMath.js — keep in sync (pure, no I/O).
//
// Room playback state is anchored: { playing, position, rate, updatedAt } where
// `position` (seconds) was true at server time `updatedAt` (ms). Anyone can
// extrapolate the live position from that anchor plus a synced clock.

export const ROLES = Object.freeze({ HOST: "HOST", COHOST: "COHOST", VIEWER: "VIEWER" });

export const DRIFT = Object.freeze({
  IGNORE: 0.25, // seconds — closer than this counts as in sync
  HARD_SEEK: 1.5, // seconds — farther than this, jump instead of nudging speed
  NUDGE_RATE: 0.15, // max ±15 % playbackRate while catching up (scaled by how far off we are)
  AUTO_REJOIN: 10, // seconds — a detached viewer this close rejoins automatically
});

const MAX_RATE = 2;
const MIN_RATE = 0.25;

export function initialState(now, position = 0) {
  return { playing: false, position: clampPosition(position), rate: 1, updatedAt: now };
}

export function clampPosition(p) {
  const n = Number(p);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Live room position (seconds) at server time `now` (ms). */
export function expectedPosition(state, now) {
  if (!state) return 0;
  if (!state.playing) return state.position;
  const elapsed = Math.max(0, now - state.updatedAt) / 1000;
  return state.position + elapsed * (state.rate || 1);
}

// Only the room creator (host) drives playback; co-hosts help moderate (kick/mute) but
// follow the room like everyone else, so all viewers stay on the live position.
export function canControl(role) {
  return role === ROLES.HOST;
}

/**
 * Apply a playback command from a member. Returns { ok, state } or { ok: false, error }.
 * The new state is re-anchored at `now`, so all clients extrapolate from the same point.
 */
export function applyCommand(state, cmd, role, now) {
  if (!canControl(role)) return { ok: false, error: "FORBIDDEN" };
  const live = expectedPosition(state, now);
  const action = cmd?.action;
  switch (action) {
    case "play":
      return ok({ ...state, playing: true, position: posOr(cmd.position, live), updatedAt: now });
    case "pause":
      return ok({ ...state, playing: false, position: posOr(cmd.position, live), updatedAt: now });
    case "seek":
      if (!Number.isFinite(Number(cmd.position))) return { ok: false, error: "BAD_POSITION" };
      return ok({ ...state, position: clampPosition(cmd.position), updatedAt: now });
    case "rate": {
      const r = Number(cmd.rate);
      if (!Number.isFinite(r) || r < MIN_RATE || r > MAX_RATE) return { ok: false, error: "BAD_RATE" };
      return ok({ ...state, position: live, rate: r, updatedAt: now });
    }
    default:
      return { ok: false, error: "BAD_ACTION" };
  }
}

/**
 * Host position report: the host's player is the source of truth for *position*. If the host
 * stalls or drifts, re-anchor the room to where the host really is.
 * Play/pause is never taken from reports — only from explicit commands — so a late or racing
 * report can't flip the whole room (e.g. a report sent just before the host's "play" lands).
 * Returns the new state, or null when no correction is needed.
 */
export function reconcileHostReport(state, report, now, tolerance = 0.4) {
  const pos = Number(report?.position);
  if (!Number.isFinite(pos)) return null;
  // While the room plays, a paused host report is ignored entirely (the pause command will follow).
  if (state.playing && report.playing === false) return null;
  const drift = Math.abs(expectedPosition(state, now) - pos);
  if (drift <= tolerance) return null;
  return { ...state, position: clampPosition(pos), updatedAt: now };
}

/**
 * Decide what a client should do given its local player position.
 * @returns {{ kind: 'none'|'nudge'|'seek', target: number, rate?: number, drift: number }}
 * drift > 0 means the local player is behind the room.
 */
export function correction(state, localPosition, now) {
  const target = expectedPosition(state, now);
  const drift = target - localPosition;
  const abs = Math.abs(drift);
  if (!state.playing) {
    return abs > DRIFT.IGNORE ? { kind: "seek", target, drift } : { kind: "none", target, drift };
  }
  if (abs <= DRIFT.IGNORE) return { kind: "none", target, drift, rate: state.rate || 1 };
  if (abs >= DRIFT.HARD_SEEK) return { kind: "seek", target, drift };
  // Proportional nudge: 0.5 s behind → +10 %, 1 s+ → +15 % (catches up in a few seconds, inaudibly).
  const base = state.rate || 1;
  const k = Math.min(DRIFT.NUDGE_RATE, 0.05 + abs * 0.1);
  const rate = drift > 0 ? base * (1 + k) : base * (1 - k);
  return { kind: "nudge", target, drift, rate };
}

/**
 * NTP-style clock offset from ping samples [{ sent, serverTime, received }] (client ms).
 * Uses the lowest round-trip sample. offset = serverClock - clientClock.
 */
export function estimateClockOffset(samples) {
  const valid = (samples || []).filter(
    (s) => Number.isFinite(s?.sent) && Number.isFinite(s?.serverTime) && Number.isFinite(s?.received) && s.received >= s.sent
  );
  if (!valid.length) return { offset: 0, rtt: Infinity };
  valid.sort((a, b) => a.received - a.sent - (b.received - b.sent));
  const best = valid[0];
  const rtt = best.received - best.sent;
  return { offset: best.serverTime - (best.sent + rtt / 2), rtt };
}

/** Next host when the current host leaves: earliest-joined co-host, else earliest-joined member. */
export function pickNextHost(members, leavingUserId) {
  const candidates = (members || []).filter((m) => m.userId !== leavingUserId && m.online !== false);
  if (!candidates.length) return null;
  const byJoin = (a, b) => (a.joinedAt || 0) - (b.joinedAt || 0);
  const cohosts = candidates.filter((m) => m.role === ROLES.COHOST).sort(byJoin);
  if (cohosts.length) return cohosts[0].userId;
  return candidates.sort(byJoin)[0].userId;
}

function ok(state) {
  return { ok: true, state };
}

function posOr(p, fallback) {
  const n = Number(p);
  return Number.isFinite(n) ? clampPosition(n) : fallback;
}
