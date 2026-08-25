import AsyncStorage from "@react-native-async-storage/async-storage";

const STORE_KEY = "moviehunter.watch.progress.v1";
const MIN_RESUME_SEC = 30;
const END_LEFT_SEC = 45;
const END_RATIO = 0.92;

/** @type {Record<string, { position: number, duration: number, title?: string, updatedAt: number }>} */
let cache = {};
let hydrated = false;
let hydratePromise = null;
let persistTimer = null;

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

export async function saveWatchProgress(key, { position, duration, title } = {}) {
  if (!key) return;
  const pos = Number(position) || 0;
  const dur = Number(duration) || 0;
  if (pos < 5) return;
  await hydrate();

  // Finished → clear so next open starts fresh
  if (dur > 0 && (pos >= dur - END_LEFT_SEC || pos / dur >= END_RATIO)) {
    if (cache[key]) {
      delete cache[key];
      schedulePersist();
    }
    return;
  }

  cache[key] = {
    position: pos,
    duration: dur,
    title: title ? String(title) : cache[key]?.title,
    updatedAt: Date.now(),
  };
  schedulePersist();
}

export async function clearWatchProgress(key) {
  if (!key) return;
  await hydrate();
  if (cache[key]) {
    delete cache[key];
    schedulePersist();
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
