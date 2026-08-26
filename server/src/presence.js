/**
 * Live "watching now" counter.
 * displayed = fakeBase (8k–15k random walk) + realActive sessions
 *
 * Optional: bind Cloudflare KV as PRESENCE_KV for multi-isolate accuracy.
 * Without KV, uses process/module memory (fine for local + single isolate).
 */

const FAKE_MIN = 8000;
const FAKE_MAX = 15000;
const SESSION_TTL_MS = 90_000;
const STATE_KEY = "presence:v1";

/** @type {{ sessions: Map<string, number>, fakeBase: number, fakeNextAt: number } | null} */
let mem = null;

function now() {
  return Date.now();
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function freshMem() {
  return {
    sessions: new Map(),
    fakeBase: randInt(10000, 13000),
    fakeNextAt: now() + randInt(60_000, 300_000),
  };
}

function getMem() {
  if (!mem) mem = freshMem();
  return mem;
}

function pruneSessions(state, t = now()) {
  for (const [id, ts] of state.sessions) {
    if (t - ts > SESSION_TTL_MS) state.sessions.delete(id);
  }
}

function tickFake(state, t = now()) {
  if (t < state.fakeNextAt) return;
  const delta = randInt(40, 420) * (Math.random() < 0.5 ? -1 : 1);
  state.fakeBase = Math.min(FAKE_MAX, Math.max(FAKE_MIN, state.fakeBase + delta));
  state.fakeNextAt = t + randInt(60_000, 300_000);
}

function snapshot(state) {
  const t = now();
  pruneSessions(state, t);
  tickFake(state, t);
  const real = state.sessions.size;
  return {
    real,
    fake: state.fakeBase,
    active: state.fakeBase + real,
    fake_min: FAKE_MIN,
    fake_max: FAKE_MAX,
  };
}

function serialize(state) {
  pruneSessions(state);
  tickFake(state);
  return JSON.stringify({
    sessions: Object.fromEntries(state.sessions),
    fakeBase: state.fakeBase,
    fakeNextAt: state.fakeNextAt,
  });
}

function deserialize(raw) {
  const state = freshMem();
  try {
    const data = JSON.parse(raw);
    state.fakeBase = Number(data.fakeBase) || state.fakeBase;
    state.fakeNextAt = Number(data.fakeNextAt) || state.fakeNextAt;
    state.fakeBase = Math.min(FAKE_MAX, Math.max(FAKE_MIN, state.fakeBase));
    const sessions = data.sessions && typeof data.sessions === "object" ? data.sessions : {};
    const t = now();
    for (const [id, ts] of Object.entries(sessions)) {
      const n = Number(ts);
      if (id && Number.isFinite(n) && t - n <= SESSION_TTL_MS) {
        state.sessions.set(String(id).slice(0, 80), n);
      }
    }
  } catch {
    /* keep fresh */
  }
  return state;
}

async function loadState(env) {
  const kv = env?.PRESENCE_KV;
  if (!kv) return getMem();
  try {
    const raw = await kv.get(STATE_KEY);
    if (!raw) {
      const s = freshMem();
      mem = s;
      return s;
    }
    const s = deserialize(raw);
    mem = s;
    return s;
  } catch {
    return getMem();
  }
}

async function saveState(env, state) {
  mem = state;
  const kv = env?.PRESENCE_KV;
  if (!kv) return;
  try {
    await kv.put(STATE_KEY, serialize(state), { expirationTtl: 60 * 60 * 24 });
  } catch {
    /* ignore */
  }
}

/**
 * @param {any} env
 * @param {string} sessionId
 */
export async function presenceHeartbeat(env, sessionId) {
  const id = String(sessionId || "").trim().slice(0, 80);
  if (!id || id.length < 8) {
    return { error: "Invalid session id", status: 400 };
  }
  const state = await loadState(env);
  state.sessions.set(id, now());
  const out = snapshot(state);
  await saveState(env, state);
  return { ...out, status: 200 };
}

/**
 * @param {any} env
 * @param {string} sessionId
 */
export async function presenceLeave(env, sessionId) {
  const id = String(sessionId || "").trim().slice(0, 80);
  const state = await loadState(env);
  if (id) state.sessions.delete(id);
  const out = snapshot(state);
  await saveState(env, state);
  return { ...out, status: 200 };
}

/** @param {any} env */
export async function presenceStats(env) {
  const state = await loadState(env);
  const out = snapshot(state);
  await saveState(env, state);
  return { ...out, status: 200 };
}
