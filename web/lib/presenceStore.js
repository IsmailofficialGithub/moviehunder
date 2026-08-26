/**
 * In-process presence for the Next.js web app.
 * displayed = fakeBase (8k–15k) + real session count
 */

const FAKE_MIN = 8000;
const FAKE_MAX = 15000;
const SESSION_TTL_MS = 90_000;

const g = globalThis;
if (!g.__mhPresence) {
  g.__mhPresence = {
    sessions: new Map(),
    fakeBase: 8000 + Math.floor(Math.random() * 5000),
    fakeNextAt: Date.now() + (60 + Math.floor(Math.random() * 240)) * 1000,
  };
}

function state() {
  return g.__mhPresence;
}

function prune(t = Date.now()) {
  const s = state();
  for (const [id, ts] of s.sessions) {
    if (t - ts > SESSION_TTL_MS) s.sessions.delete(id);
  }
}

function tickFake(t = Date.now()) {
  const s = state();
  if (t < s.fakeNextAt) return;
  const delta = (40 + Math.floor(Math.random() * 380)) * (Math.random() < 0.5 ? -1 : 1);
  s.fakeBase = Math.min(FAKE_MAX, Math.max(FAKE_MIN, s.fakeBase + delta));
  s.fakeNextAt = t + (60 + Math.floor(Math.random() * 240)) * 1000;
}

export function presenceSnapshot() {
  const t = Date.now();
  prune(t);
  tickFake(t);
  const s = state();
  const real = s.sessions.size;
  return {
    real,
    fake: s.fakeBase,
    active: s.fakeBase + real,
    fake_min: FAKE_MIN,
    fake_max: FAKE_MAX,
  };
}

export function presenceHeartbeat(sessionId) {
  const id = String(sessionId || "").trim().slice(0, 80);
  if (!id || id.length < 8) {
    return { error: "Invalid session id", status: 400 };
  }
  state().sessions.set(id, Date.now());
  return { ...presenceSnapshot(), status: 200 };
}

export function presenceLeave(sessionId) {
  const id = String(sessionId || "").trim().slice(0, 80);
  if (id) state().sessions.delete(id);
  return { ...presenceSnapshot(), status: 200 };
}
