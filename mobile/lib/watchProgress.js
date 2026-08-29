import AsyncStorage from "@react-native-async-storage/async-storage";

const STORE_KEY = "moviehunter.watch.progress.v1";
const MIN_RESUME_SEC = 30;
const END_LEFT_SEC = 45;
const END_RATIO = 0.92;

/** @type {Record<string, { position: number, duration: number, title?: string, subjectId?: string, detailPath?: string, se?: string, ep?: string, poster?: string, kind?: string, completed?: boolean, updatedAt: number }>} */
let cache = {};
let hydrated = false;
let hydratePromise = null;
let persistTimer = null;
const listeners = new Set();

async function hydrate() {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === "object") cache = data;
      }
    } catch {
      cache = {};
    } finally {
      hydrated = true;
      hydratePromise = null;
      emit();
    }
  })();
  return hydratePromise;
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(cache)).catch(() => {});
  }, 400);
}

function snapshot() {
  return Object.entries(cache)
    .map(([key, entry]) => ({ key, ...entry }))
    .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
}

function emit() {
  const list = snapshot();
  for (const fn of listeners) {
    try {
      fn(list);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Stable key for a title/episode (same for live stream + download of that ep).
 */
export function watchProgressKey({ subjectId, se = "0", ep = "0", downloadId } = {}) {
  const sid = String(subjectId || "").trim();
  if (sid) {
    return `t:${sid}:s${String(se || "0")}:e${String(ep || "0")}`;
  }
  if (downloadId) return `d:${String(downloadId)}`;
  return "";
}

/** Enough watched to offer resume, and not essentially finished. */
export function isResumable(entry) {
  if (!entry) return false;
  const pos = Number(entry.position) || 0;
  const dur = Number(entry.duration) || 0;
  if (pos < MIN_RESUME_SEC) return false;
  if (dur > 0) {
    if (pos >= dur - END_LEFT_SEC) return false;
    if (pos / dur >= END_RATIO) return false;
  }
  return true;
}

export async function getWatchProgress(key) {
  if (!key) return null;
  await hydrate();
  return cache[key] || null;
}

export function subscribeWatchProgress(fn) {
  listeners.add(fn);
  fn(snapshot());
  hydrate()
    .then(() => fn(snapshot()))
    .catch(() => {});
  return () => listeners.delete(fn);
}

export async function getAllWatchProgress() {
  await hydrate();
  return snapshot();
}

export function progressPercent(entry) {
  if (!entry) return 0;
  if (entry.completed) return 100;
  const position = Math.max(0, Number(entry.position) || 0);
  const duration = Number(entry.duration) || 0;
  if (!(duration > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((position / duration) * 100)));
}

export function historyBucket(updatedAt, now = Date.now()) {
  const age = Math.max(0, now - (Number(updatedAt) || 0));
  const day = 24 * 60 * 60 * 1000;
  if (age < day) return "Today";
  if (age < day * 2) return "Yesterday";
  if (age < day * 4) return "Last 3 days";
  if (age < day * 8) return "Last 7 days";
  return "";
}

export async function getWatchHistory({ limit = 30 } = {}) {
  const entries = await getAllWatchProgress();
  return entries
    .filter((entry) => entry.title && entry.detailPath && historyBucket(entry.updatedAt))
    .slice(0, Math.max(0, Number(limit) || 30));
}

export async function saveWatchProgress(
  key,
  {
    position,
    duration,
    title,
    subjectId,
    detailPath,
    se,
    ep,
    poster,
    kind,
  } = {}
) {
  if (!key) return;
  const pos = Number(position) || 0;
  const dur = Number(duration) || 0;
  if (pos < 5) return;
  await hydrate();

  const completed =
    dur > 0 && (pos >= dur - END_LEFT_SEC || pos / dur >= END_RATIO);
  const previous = cache[key] || {};
  cache[key] = {
    position: completed ? dur : pos,
    duration: dur,
    title: title ? String(title) : previous.title,
    subjectId: subjectId ? String(subjectId) : previous.subjectId,
    detailPath: detailPath ? String(detailPath) : previous.detailPath,
    se: se != null ? String(se) : previous.se,
    ep: ep != null ? String(ep) : previous.ep,
    poster: poster ? String(poster) : previous.poster,
    kind: kind ? String(kind) : previous.kind,
    completed,
    updatedAt: Date.now(),
  };
  schedulePersist();
  emit();
}

export async function clearWatchProgress(key) {
  if (!key) return;
  await hydrate();
  if (cache[key]) {
    delete cache[key];
    schedulePersist();
    emit();
  }
}

export function formatResumeTime(seconds) {
  const t = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

hydrate().catch(() => {});
