/**
 * Offline music downloads — Audius streams under documentDirectory.
 * Parallel to video downloads.js, without movie/season assumptions.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

const STORE_KEY = "flick.music.downloads.v1";
const ROOT = `${FileSystem.documentDirectory || ""}flick-music/`;
const MAX_CONCURRENT = 2;
const PROGRESS_THROTTLE_MS = 400;

function audiusApiBase() {
  return String(process.env.EXPO_PUBLIC_AUDIUS_API_BASE || "").replace(/\/+$/, "");
}

function audiusAppName() {
  return String(process.env.EXPO_PUBLIC_AUDIUS_APP_NAME || "").trim();
}

function streamUrlForTrackId(trackId) {
  const base = audiusApiBase();
  const app = audiusAppName();
  if (!base || !app || !trackId) return "";
  return `${base}/tracks/${encodeURIComponent(trackId)}/stream?app_name=${encodeURIComponent(app)}`;
}

/** @typedef {'queued'|'downloading'|'paused'|'completed'|'failed'} MusicDlStatus */

/**
 * @typedef {object} MusicDownloadItem
 * @property {string} id
 * @property {string} name
 * @property {string} [artist]
 * @property {string} [album]
 * @property {string|null} [image]
 * @property {number} [duration_ms]
 * @property {string} sourceUrl
 * @property {string} fileUri
 * @property {MusicDlStatus} status
 * @property {number} bytesWritten
 * @property {number} totalBytes
 * @property {string} [error]
 * @property {string} [resumeData]
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** @type {Map<string, MusicDownloadItem>} */
const items = new Map();
/** @type {Map<string, import('expo-file-system/legacy').DownloadResumable>} */
const tasks = new Map();
/** @type {Set<(list: MusicDownloadItem[]) => void>} */
const listeners = new Set();
const startingIds = new Set();
let hydrated = false;
let hydratePromise = null;
let persistTimer = null;
let lastProgressEmit = 0;

function fileNameFor(trackId) {
  const safe = String(trackId)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 64);
  return `${safe}.mp3`;
}

function emit(force = false) {
  const now = Date.now();
  if (!force && now - lastProgressEmit < PROGRESS_THROTTLE_MS) return;
  lastProgressEmit = now;
  const list = [...items.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const fn of listeners) {
    try {
      fn(list);
    } catch {
      /* ignore */
    }
  }
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persist().catch(() => {});
  }, 350);
}

async function ensureRoot() {
  if (!FileSystem.documentDirectory) {
    throw new Error("Storage unavailable on this device");
  }
  const info = await FileSystem.getInfoAsync(ROOT);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
  }
}

async function persist() {
  await AsyncStorage.setItem(
    STORE_KEY,
    JSON.stringify([...items.values()])
  );
}

function patch(id, partial, { emitNow = false } = {}) {
  const cur = items.get(id);
  if (!cur) return null;
  const next = { ...cur, ...partial, updatedAt: Date.now() };
  items.set(id, next);
  schedulePersist();
  emit(emitNow);
  return next;
}

export async function hydrateMusicDownloads() {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      await ensureRoot();
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const row of list) {
            if (!row?.id) continue;
            if (row.status === "downloading" || row.status === "queued") {
              row.status = "paused";
            }
            items.set(row.id, row);
          }
        }
      }
    } catch {
      /* empty */
    } finally {
      hydrated = true;
      hydratePromise = null;
      emit(true);
      pumpQueue();
    }
  })();
  return hydratePromise;
}

export function subscribeMusicDownloads(fn) {
  listeners.add(fn);
  hydrateMusicDownloads().then(() => {
    fn([...items.values()].sort((a, b) => b.updatedAt - a.updatedAt));
  });
  fn([...items.values()].sort((a, b) => b.updatedAt - a.updatedAt));
  return () => listeners.delete(fn);
}

export function getMusicDownloads() {
  return [...items.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getMusicDownloadById(id) {
  return items.get(String(id)) || null;
}

export function isMusicDownloaded(id) {
  const item = items.get(String(id));
  return item?.status === "completed";
}

/** Local file URI when a completed download exists on disk. */
export async function getLocalMusicUri(trackId) {
  await hydrateMusicDownloads();
  const item = items.get(String(trackId));
  if (!item || item.status !== "completed" || !item.fileUri) return null;
  try {
    const info = await FileSystem.getInfoAsync(item.fileUri);
    if (info.exists) return item.fileUri;
  } catch {
    /* missing */
  }
  return null;
}

function activeCount() {
  return [...items.values()].filter((d) => d.status === "downloading").length;
}

function nextQueued() {
  return [...items.values()]
    .filter(
      (d) =>
        d.status === "queued" &&
        d.sourceUrl &&
        !startingIds.has(d.id) &&
        !tasks.has(d.id)
    )
    .sort((a, b) => a.createdAt - b.createdAt)[0];
}

function pumpQueue() {
  while (activeCount() + startingIds.size < MAX_CONCURRENT) {
    const next = nextQueued();
    if (!next) break;
    startingIds.add(next.id);
    const cur = items.get(next.id);
    if (cur) {
      items.set(next.id, {
        ...cur,
        status: "downloading",
        error: undefined,
        updatedAt: Date.now(),
      });
    }
    startTask(next.id)
      .catch(() => {})
      .finally(() => {
        startingIds.delete(next.id);
      });
  }
  emit(true);
}

function onProgress(id, { totalBytesWritten, totalBytesExpectedToWrite }) {
  patch(id, {
    bytesWritten: totalBytesWritten || 0,
    totalBytes: totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : 0,
  });
}

async function startTask(id) {
  const item = items.get(id);
  if (!item?.sourceUrl) {
    startingIds.delete(id);
    return;
  }
  if (item.status === "completed") {
    startingIds.delete(id);
    return;
  }
  if (tasks.has(id)) return;

  try {
    await ensureRoot();
  } catch (err) {
    patch(
      id,
      { status: "failed", error: err?.message || "Storage unavailable" },
      { emitNow: true }
    );
    startingIds.delete(id);
    pumpQueue();
    return;
  }

  // Fresh stream URL for new downloads (Audius redirects expire).
  const sourceUrl = item.resumeData
    ? item.sourceUrl
    : streamUrlForTrackId(id) || item.sourceUrl;

  patch(
    id,
    { status: "downloading", error: undefined, sourceUrl },
    { emitNow: true }
  );

  const latest = items.get(id) || item;
  let task;
  try {
    task = FileSystem.createDownloadResumable(
      latest.sourceUrl,
      latest.fileUri,
      {},
      (data) => onProgress(id, data),
      latest.resumeData || undefined
    );
    tasks.set(id, task);
  } catch (err) {
    patch(
      id,
      {
        status: "failed",
        error: err?.message || "Couldn’t start download",
      },
      { emitNow: true }
    );
    startingIds.delete(id);
    pumpQueue();
    return;
  }

  try {
    const result = latest.resumeData
      ? await task.resumeAsync()
      : await task.downloadAsync();

    if (!result) {
      const savable = task.savable?.() || {};
      patch(
        id,
        {
          status: "paused",
          resumeData: savable.resumeData || latest.resumeData,
        },
        { emitNow: true }
      );
      tasks.delete(id);
      pumpQueue();
      return;
    }

    const info = await FileSystem.getInfoAsync(latest.fileUri);
    if (!info.exists || !(info.size > 0)) {
      throw new Error("Download finished but file is empty");
    }

    patch(
      id,
      {
        status: "completed",
        bytesWritten: info.size || latest.bytesWritten || 0,
        totalBytes: info.size || latest.totalBytes || 0,
        resumeData: undefined,
        error: undefined,
      },
      { emitNow: true }
    );
    tasks.delete(id);
    pumpQueue();
  } catch (err) {
    let resumeData = latest.resumeData;
    try {
      const savable = task.savable?.();
      if (savable?.resumeData) resumeData = savable.resumeData;
    } catch {
      /* ignore */
    }
    tasks.delete(id);
    patch(
      id,
      {
        status: "failed",
        error: err?.message || "Download failed",
        resumeData,
      },
      { emitNow: true }
    );
    pumpQueue();
  }
}

/**
 * Queue a track for offline download.
 * @param {{ id: string, name?: string, artist?: string, album?: string, image?: string|null, duration_ms?: number, stream_url?: string|null, preview_url?: string|null }} track
 */
export async function enqueueMusicDownload(track) {
  await hydrateMusicDownloads();
  const id = String(track?.id || "");
  if (!id) throw new Error("Missing track id");

  const existing = items.get(id);
  if (existing?.status === "completed") {
    const info = await FileSystem.getInfoAsync(existing.fileUri).catch(() => null);
    if (info?.exists) return existing;
  }
  if (
    existing &&
    (existing.status === "queued" ||
      existing.status === "downloading" ||
      existing.status === "paused")
  ) {
    if (existing.status === "paused" || existing.status === "failed") {
      return resumeMusicDownload(id);
    }
    return existing;
  }

  const sourceUrl =
    track.stream_url || track.preview_url || streamUrlForTrackId(id);
  if (!sourceUrl) throw new Error("No stream URL for this track");

  await ensureRoot();
  const fileUri = `${ROOT}${fileNameFor(id)}`;
  try {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  } catch {
    /* ignore */
  }

  const now = Date.now();
  /** @type {MusicDownloadItem} */
  const item = {
    id,
    name: track.name || "Unknown",
    artist: track.artist || "",
    album: track.album || "",
    image: track.image || null,
    duration_ms: track.duration_ms || 0,
    sourceUrl,
    fileUri,
    status: "queued",
    bytesWritten: 0,
    totalBytes: 0,
    createdAt: now,
    updatedAt: now,
  };
  items.set(id, item);
  schedulePersist();
  emit(true);
  pumpQueue();
  return item;
}

export async function resumeMusicDownload(id) {
  await hydrateMusicDownloads();
  const item = items.get(String(id));
  if (!item) return null;
  if (item.status === "completed") return item;

  // Prefer a fresh stream URL when not mid-resume.
  const sourceUrl = item.resumeData
    ? item.sourceUrl
    : streamUrlForTrackId(item.id);
  patch(
    item.id,
    {
      status: "queued",
      sourceUrl,
      error: undefined,
    },
    { emitNow: true }
  );
  pumpQueue();
  return items.get(item.id);
}

export async function pauseMusicDownload(id) {
  const key = String(id);
  const task = tasks.get(key);
  if (task) {
    try {
      await task.pauseAsync();
      const savable = task.savable?.() || {};
      patch(
        key,
        {
          status: "paused",
          resumeData: savable.resumeData,
        },
        { emitNow: true }
      );
    } catch {
      patch(key, { status: "paused" }, { emitNow: true });
    }
    tasks.delete(key);
  } else {
    const item = items.get(key);
    if (item && (item.status === "queued" || item.status === "downloading")) {
      patch(key, { status: "paused" }, { emitNow: true });
    }
  }
  pumpQueue();
}

export async function removeMusicDownload(id) {
  const key = String(id);
  const task = tasks.get(key);
  if (task) {
    try {
      await task.pauseAsync();
    } catch {
      /* ignore */
    }
    tasks.delete(key);
  }
  const item = items.get(key);
  if (item?.fileUri) {
    try {
      await FileSystem.deleteAsync(item.fileUri, { idempotent: true });
    } catch {
      /* ignore */
    }
  }
  items.delete(key);
  schedulePersist();
  emit(true);
  pumpQueue();
}

export function musicDownloadProgress(item) {
  if (!item) return 0;
  if (item.status === "completed") return 1;
  const total = item.totalBytes || 0;
  if (total > 0) return Math.min(1, (item.bytesWritten || 0) / total);
  return 0;
}
