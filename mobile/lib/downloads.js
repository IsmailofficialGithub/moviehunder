/**
 * In-app download manager — resumable, quality-aware, space-conscious.
 * Uses expo-file-system/legacy DownloadResumable + AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { getEpisodes } from "./api";
import { getCachedStreams, prefetchStreams } from "./streamCache";
import { downloadMediaUrl } from "./stream";
import { toUserMessage } from "./userFacingError";

const STORE_KEY = "flick.downloads.v1";
const ROOT = `${FileSystem.documentDirectory || ""}flick-dl/`;
const MAX_CONCURRENT = 1;
const PROGRESS_THROTTLE_MS = 400;

/** @typedef {'queued'|'downloading'|'paused'|'completed'|'failed'} DlStatus */

/**
 * @typedef {object} DownloadItem
 * @property {string} id
 * @property {'movie'|'series'} kind
 * @property {string} subjectId
 * @property {string} detailPath
 * @property {string} title
 * @property {string} [poster]
 * @property {string} se
 * @property {string} ep
 * @property {string} resolution
 * @property {number} height
 * @property {string} sourceUrl
 * @property {string} fileUri
 * @property {DlStatus} status
 * @property {number} bytesWritten
 * @property {number} totalBytes
 * @property {number} [sizeHint]
 * @property {string} [error]
 * @property {string} [resumeData]
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** @type {Map<string, DownloadItem>} */
const items = new Map();
/** @type {Map<string, import('expo-file-system/legacy').DownloadResumable>} */
const tasks = new Map();
/** @type {Set<(list: DownloadItem[]) => void>} */
const listeners = new Set();
let hydrated = false;
let hydratePromise = null;
let persistTimer = null;
let lastProgressEmit = 0;

function makeId({ subjectId, detailPath, se, ep, height }) {
  return `${subjectId}|${detailPath}|${se}|${ep}|${height}`;
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
  const payload = [...items.values()].map((item) => {
    const { ...rest } = item;
    return rest;
  });
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(payload));
}

export async function hydrateDownloads() {
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
            // Incomplete downloads become paused so user can resume
            if (row.status === "downloading" || row.status === "queued") {
              row.status = "paused";
            }
            // Drop stale preparing rows from previous hung runs
            if (row.pending) continue;
            // Rebase absolute paths when documentDirectory changes (Expo updates)
            if (row.fileUri && FileSystem.documentDirectory) {
              const dl = String(row.fileUri).match(/flick-dl\/[^?#]+/);
              const vault = String(row.fileUri).match(/\.mh_sys\/[^?#]+/);
              if (dl) row.fileUri = `${FileSystem.documentDirectory}${dl[0]}`;
              else if (vault)
                row.fileUri = `${FileSystem.documentDirectory}${vault[0]}`;
            }
            items.set(row.id, row);
          }
        }
      }
    } catch {
      /* empty store */
    } finally {
      hydrated = true;
      hydratePromise = null;
      emit(true);
      pumpQueue();
    }
  })();
  return hydratePromise;
}

export function subscribeDownloads(fn) {
  listeners.add(fn);
  fn([...items.values()].sort((a, b) => b.updatedAt - a.updatedAt));
  return () => listeners.delete(fn);
}

export function getDownloads({ vault = false } = {}) {
  return [...items.values()]
    .filter((d) => (vault ? d.inVault : !d.inVault))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDownloadById(id) {
  return items.get(id) || null;
}

export function findDownload({
  subjectId,
  detailPath,
  se = "0",
  ep = "0",
  height,
  includeVault = false,
}) {
  const match = (d) => {
    if (!includeVault && d.inVault) return false;
    return (
      d.subjectId === String(subjectId) &&
      d.detailPath === String(detailPath) &&
      String(d.se) === String(se) &&
      String(d.ep) === String(ep)
    );
  };
  if (height != null) {
    const hit = items.get(makeId({ subjectId, detailPath, se, ep, height }));
    if (!hit) return null;
    if (!includeVault && hit.inVault) return null;
    return hit;
  }
  return [...items.values()].find(match) || null;
}

export function packKeyFromItem(item) {
  if (!item) return "";
  return `${item.subjectId}|${item.detailPath}`;
}

/** Minimum bytes before partial offline play is offered (~256 KB). */
const MIN_PARTIAL_BYTES = 256 * 1024;

/** True when enough of the file exists on disk to try offline playback. */
export function canPlayPartial(item) {
  if (!item || item.pending || !item.fileUri) return false;
  if (item.status === "completed") return true;
  const written = item.bytesWritten || 0;
  if (written < MIN_PARTIAL_BYTES) return false;
  const total = item.totalBytes || item.sizeHint || 0;
  if (total > 0 && written / total >= 0.05) return true;
  return written >= MIN_PARTIAL_BYTES;
}

/** Playable but not fully downloaded yet. */
export function isPartialOnly(item) {
  return canPlayPartial(item) && item.status !== "completed";
}

/** Catalog lookup: any non-vault downloads for a title slug / detail path. */
export function getDownloadSummaryForPath(detailPath) {
  const path = String(detailPath || "");
  if (!path) return null;
  const list = [...items.values()].filter(
    (d) => d.detailPath === path && !d.inVault
  );
  if (!list.length) return null;

  const playable = list.filter(canPlayPartial);
  const bestPlay =
    playable.sort((a, b) => progressOf(b) - progressOf(a))[0] || null;
  const maxProgress = Math.max(...list.map((d) => progressOf(d)), 0);
  const sample = list[0];
  const isSeries =
    list.some(
      (d) => d.kind === "series" || Number(d.se) > 0 || Number(d.ep) > 0
    );

  return {
    packKey: packKeyFromItem(sample),
    count: list.length,
    progressPct: Math.round(maxProgress * 100),
    hasActive: list.some(
      (d) =>
        d.pending ||
        d.status === "downloading" ||
        d.status === "queued" ||
        d.status === "paused" ||
        d.status === "failed"
    ),
    hasPartial: playable.some(isPartialOnly),
    isSeries,
    playItem: bestPlay,
  };
}

function fileNameFor(item) {
  const safe = String(item.detailPath || item.subjectId)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 48);
  const epPart =
    Number(item.se) > 0 || Number(item.ep) > 0
      ? `_S${item.se}E${item.ep}`
      : "";
  return `${safe}${epPart}_${item.height || "auto"}p.mp4`;
}

/**
 * Find the real on-disk URI for a download (handles stale documentDirectory paths).
 */
export async function resolveDownloadFileUri(item) {
  if (!item) return null;
  const doc = FileSystem.documentDirectory || "";
  if (!doc) return item.fileUri || null;

  const normalize = (u) => {
    if (!u) return u;
    if (u.startsWith("/") && !u.startsWith("file:")) return `file://${u}`;
    return u;
  };

  const candidates = [];
  const push = (u) => {
    const n = normalize(u);
    if (n && typeof n === "string" && !candidates.includes(n)) candidates.push(n);
  };

  push(item.fileUri);

  if (item.fileUri) {
    const dl = item.fileUri.match(/flick-dl\/[^?#]+/);
    if (dl) push(`${doc}${dl[0]}`);
    const vault = item.fileUri.match(/\.mh_sys\/[^?#]+/);
    if (vault) push(`${doc}${vault[0]}`);
    const base = item.fileUri.split("/").filter(Boolean).pop();
    if (base && !item.inVault) {
      try {
        push(`${doc}flick-dl/${decodeURIComponent(base)}`);
      } catch {
        push(`${doc}flick-dl/${base}`);
      }
    }
    if (base && item.inVault) {
      try {
        push(`${doc}.mh_sys/${decodeURIComponent(base)}`);
      } catch {
        push(`${doc}.mh_sys/${base}`);
      }
    }
  }

  if (!item.inVault) {
    push(`${ROOT}${fileNameFor(item)}`);
  }

  for (const uri of candidates) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && !info.isDirectory) {
        return info.uri || uri;
      }
    } catch {
      /* try next */
    }
  }
  return null;
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

const startingIds = new Set();

function activeCount() {
  return [...items.values()].filter((d) => d.status === "downloading").length;
}

function nextQueued() {
  return [...items.values()]
    .filter(
      (d) =>
        d.status === "queued" &&
        d.sourceUrl &&
        !d.pending &&
        !startingIds.has(d.id) &&
        !tasks.has(d.id)
    )
    .sort((a, b) => a.createdAt - b.createdAt)[0];
}

function pumpQueue() {
  // Claim slots synchronously so we never spawn duplicate startTask calls
  while (activeCount() + startingIds.size < MAX_CONCURRENT) {
    const next = nextQueued();
    if (!next) break;
    startingIds.add(next.id);
    // Mark immediately so nextQueued skips this id
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
  if (!item || item.pending || !item.sourceUrl) {
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
      {
        status: "failed",
        error: toUserMessage(err, "Storage unavailable"),
      },
      { emitNow: true }
    );
    startingIds.delete(id);
    pumpQueue();
    return;
  }

  patch(id, { status: "downloading", error: undefined }, { emitNow: true });

  const callback = (data) => onProgress(id, data);
  const latest = items.get(id) || item;

  let task;
  try {
    task = FileSystem.createDownloadResumable(
      latest.sourceUrl,
      latest.fileUri,
      {},
      callback,
      latest.resumeData || undefined
    );
    tasks.set(id, task);
  } catch (err) {
    patch(
      id,
      {
        status: "failed",
        error: toUserMessage(err, "Couldn't start download"),
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

    const savedUri = result.uri || latest.fileUri;
    const info = await FileSystem.getInfoAsync(savedUri);
    if (!info.exists) {
      patch(
        id,
        {
          status: "failed",
          error: "Download finished but the file wasn’t saved. Try again.",
          fileUri: savedUri,
        },
        { emitNow: true }
      );
      tasks.delete(id);
      pumpQueue();
      return;
    }
    patch(
      id,
      {
        status: "completed",
        fileUri: savedUri,
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
        error: toUserMessage(err, "Download failed. Check your connection."),
        resumeData,
      },
      { emitNow: true }
    );
    pumpQueue();
  }
}

/**
 * Enqueue a download for a specific quality.
 * Reuses existing incomplete download when same id.
 */
export async function enqueueDownload({
  subjectId,
  detailPath,
  title,
  poster,
  se = "0",
  ep = "0",
  kind = "movie",
  source,
}) {
  await hydrateDownloads();
  if (!source?.url) throw new Error("No stream URL for this quality");

  const height = source.height || 0;
  const id = makeId({
    subjectId: String(subjectId),
    detailPath: String(detailPath),
    se: String(se),
    ep: String(ep),
    height,
  });

  const existing = items.get(id);
  if (existing?.status === "completed") {
    if (existing.inVault) {
      throw new Error(
        "This download is sealed in Movie Safe. Unlock the vault (5 taps on Device storage) to watch or restore it."
      );
    }
    return existing;
  }
  if (existing && (existing.status === "downloading" || existing.status === "queued")) {
    return existing;
  }

  await ensureRoot();
  const fileUri = `${ROOT}${fileNameFor({
    detailPath,
    subjectId,
    se,
    ep,
    height,
  })}`;

  const mediaUrl = downloadMediaUrl({
    subjectId: String(subjectId),
    detailPath: String(detailPath),
    se,
    ep,
    height,
    cdnUrl: source.url,
  });
  const now = Date.now();

  if (existing && (existing.status === "paused" || existing.status === "failed")) {
    // Retry / resume same quality from same place
    patch(
      id,
      {
        sourceUrl: mediaUrl,
        status: "queued",
        error: undefined,
      },
      { emitNow: true }
    );
    pumpQueue();
    return items.get(id);
  }

  /** @type {DownloadItem} */
  const item = {
    id,
    kind: kind === "series" || Number(se) > 0 || Number(ep) > 0 ? "series" : "movie",
    subjectId: String(subjectId),
    detailPath: String(detailPath),
    title: String(title || detailPath),
    poster: poster || null,
    se: String(se),
    ep: String(ep),
    resolution: source.resolution || (height ? `${height}p` : "Auto"),
    height,
    sourceUrl: mediaUrl,
    fileUri,
    status: "queued",
    bytesWritten: 0,
    totalBytes: source.size_bytes || 0,
    sizeHint: source.size_bytes || null,
    createdAt: now,
    updatedAt: now,
  };

  items.set(id, item);
  schedulePersist();
  emit(true);
  pumpQueue();
  return item;
}

/** Resolve qualities then enqueue chosen height (or default ≤720 for space). */
export async function enqueueBestEffort({
  subjectId,
  detailPath,
  title,
  poster,
  se = "0",
  ep = "0",
  kind,
  preferredHeight = 720,
}) {
  await hydrateDownloads();

  const params = {
    subjectId: String(subjectId),
    detailPath: String(detailPath),
    se: String(se),
    ep: String(ep),
  };
  const seriesKind =
    kind === "series" || Number(se) > 0 || Number(ep) > 0 ? "series" : "movie";

  const pendingId = `pending|${params.subjectId}|${params.detailPath}|${params.se}|${params.ep}`;
  // Drop any previous stuck preparing row for the same title
  for (const [id, row] of items) {
    if (
      row.pending &&
      row.subjectId === params.subjectId &&
      row.detailPath === params.detailPath &&
      String(row.se) === params.se &&
      String(row.ep) === params.ep
    ) {
      items.delete(id);
    }
  }

  const now = Date.now();
  items.set(pendingId, {
    id: pendingId,
    kind: seriesKind,
    subjectId: params.subjectId,
    detailPath: params.detailPath,
    title: String(title || detailPath),
    poster: poster || null,
    se: params.se,
    ep: params.ep,
    resolution: `${preferredHeight}p`,
    height: preferredHeight,
    sourceUrl: "",
    fileUri: "",
    status: "queued",
    bytesWritten: 0,
    totalBytes: 0,
    sizeHint: null,
    createdAt: now,
    updatedAt: now,
    pending: true,
  });
  emit(true);

  const failPending = (message) => {
    patch(
      pendingId,
      {
        status: "failed",
        resolution: "Failed",
        error: message || "Couldn’t start download",
        pending: true,
      },
      { emitNow: true }
    );
  };

  try {
    let result = getCachedStreams(params);
    if (!result?.sources?.length) {
      result = await Promise.race([
        prefetchStreams(params, { maxHeight: preferredHeight }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Preparing timed out — is the API running?")),
            10000
          )
        ),
      ]);
    }
    const sources = result?.sources || [];
    if (!sources.length) throw new Error("No streams available");

    const source =
      sources.find((s) => s.height === preferredHeight) ||
      sources.find((s) => s.height && s.height <= preferredHeight) ||
      sources[sources.length - 1];

    items.delete(pendingId);
    schedulePersist();
    emit(true);

    return await enqueueDownload({
      subjectId: params.subjectId,
      detailPath: params.detailPath,
      title,
      poster,
      se: params.se,
      ep: params.ep,
      kind: seriesKind,
      source,
    });
  } catch (err) {
    failPending(
      toUserMessage(err, "Couldn't start download. Check your connection.")
    );
    throw err;
  }
}

/** True if this episode is already downloaded, queued, or preparing (any height). Vault copies do not count (hidden from UI). */
export function isEpisodeCovered({ subjectId, detailPath, se, ep }) {
  const sid = String(subjectId);
  const path = String(detailPath);
  const seStr = String(se);
  const epStr = String(ep);
  for (const item of items.values()) {
    if (item.inVault) continue;
    if (
      item.subjectId === sid &&
      item.detailPath === path &&
      String(item.se) === seStr &&
      String(item.ep) === epStr &&
      item.status !== "failed"
    ) {
      return true;
    }
  }
  return false;
}

function episodeExistsIncludingVault({ subjectId, detailPath, se, ep }) {
  const sid = String(subjectId);
  const path = String(detailPath);
  const seStr = String(se);
  const epStr = String(ep);
  for (const item of items.values()) {
    if (
      item.subjectId === sid &&
      item.detailPath === path &&
      String(item.se) === seStr &&
      String(item.ep) === epStr &&
      item.status !== "failed"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Fetch season episodes from the API and queue missing ones at preferredHeight
 * (default 720p). Never prompts for resolution.
 */
export async function enqueueSeason({
  subjectId,
  detailPath,
  title,
  poster,
  season,
  preferredHeight = 720,
}) {
  await hydrateDownloads();
  const data = await getEpisodes(detailPath);
  const seasons = Array.isArray(data?.seasons) ? data.seasons : [];
  const seasonRow = seasons.find((s) => String(s.season) === String(season));
  const episodes = Array.isArray(seasonRow?.episodes) ? seasonRow.episodes : [];
  if (!episodes.length) {
    throw new Error(`No episodes found for season ${season}`);
  }

  const toQueue = [];
  for (const row of episodes) {
    const se = String(row.se ?? season);
    const ep = String(row.ep ?? row.episode);
    if (!ep || ep === "undefined") continue;
    if (episodeExistsIncludingVault({ subjectId, detailPath, se, ep })) continue;
    toQueue.push({ se, ep });
  }

  // Resolve streams one-by-one so we don’t hammer the API; UI shows pending rows as each starts.
  void (async () => {
    for (const { se, ep } of toQueue) {
      if (episodeExistsIncludingVault({ subjectId, detailPath, se, ep })) continue;
      try {
        await enqueueBestEffort({
          subjectId,
          detailPath,
          title,
          poster,
          se,
          ep,
          kind: "series",
          preferredHeight,
        });
      } catch {
        /* keep going through the season */
      }
    }
  })();

  return {
    queued: toQueue.length,
    skipped: episodes.length - toQueue.length,
    total: episodes.length,
  };
}

/** Load season/episode catalog from the server (for Downloads “more”). */
export async function fetchSeasonCatalog(detailPath) {
  const data = await getEpisodes(detailPath);
  return {
    subjectId: data?.subject_id || null,
    seasons: Array.isArray(data?.seasons) ? data.seasons : [],
    isMovie: !!data?.is_movie,
  };
}

export async function pauseDownload(id) {
  const task = tasks.get(id);
  const item = items.get(id);
  if (!item) return;
  if (task) {
    try {
      const pauseState = await task.pauseAsync();
      const savable = task.savable?.() || pauseState || {};
      patch(
        id,
        {
          status: "paused",
          resumeData: savable.resumeData || item.resumeData,
        },
        { emitNow: true }
      );
    } catch {
      patch(id, { status: "paused" }, { emitNow: true });
    }
    tasks.delete(id);
  } else if (item.status === "queued" || item.status === "downloading") {
    patch(id, { status: "paused" }, { emitNow: true });
  }
  pumpQueue();
}

export async function resumeDownload(id) {
  await hydrateDownloads();
  const item = items.get(id);
  if (!item || item.status === "completed") return;
  patch(id, { status: "queued", error: undefined }, { emitNow: true });
  pumpQueue();
}

export async function retryDownload(id) {
  return resumeDownload(id);
}

export async function removeDownload(id) {
  const task = tasks.get(id);
  if (task) {
    try {
      await task.pauseAsync();
    } catch {
      /* ignore */
    }
    try {
      await task.cancelAsync?.();
    } catch {
      /* ignore */
    }
    tasks.delete(id);
  }
  const item = items.get(id);
  if (item?.fileUri) {
    try {
      await FileSystem.deleteAsync(item.fileUri, { idempotent: true });
    } catch {
      /* ignore */
    }
  }
  items.delete(id);
  schedulePersist();
  emit(true);
  pumpQueue();
}

/** Move a completed download into the password vault (caller must unlock vault first). */
export async function moveDownloadToVault(id) {
  await hydrateDownloads();
  const item = items.get(id);
  if (!item) throw new Error("Download not found");
  if (item.inVault) return item;
  if (item.status !== "completed") {
    throw new Error("Only finished downloads can go in the vault");
  }

  const srcUri = await resolveDownloadFileUri(item);
  if (!srcUri) {
    throw new Error(
      "Download file missing on disk. Play or re-download it first, then import again."
    );
  }
  if (srcUri !== item.fileUri) {
    patch(id, { fileUri: srcUri });
  }

  const { sealDownloadIntoVault } = await import("./vault");
  const sealed = await sealDownloadIntoVault({
    ...items.get(id),
    fileUri: srcUri,
  });
  items.set(id, {
    ...items.get(id),
    ...sealed,
    updatedAt: Date.now(),
  });
  schedulePersist();
  emit(true);
  return items.get(id);
}

/** Seal many finished downloads into the vault (one after another). */
export async function moveDownloadsToVault(ids) {
  const moved = [];
  const failed = [];
  for (const id of ids || []) {
    try {
      moved.push(await moveDownloadToVault(id));
    } catch (err) {
      failed.push({
        id,
        message: err?.message || "Failed",
      });
    }
  }
  if (!moved.length && failed.length) {
    throw new Error(failed[0].message || "Couldn’t import into the vault");
  }
  return { moved, failed };
}

/** Restore a vault download to the normal Downloads list. */
export async function moveDownloadFromVault(id) {
  await hydrateDownloads();
  const item = items.get(id);
  if (!item?.inVault) return item;
  await ensureRoot();
  const destUri = `${ROOT}${fileNameFor(item)}`;
  const { unsealDownloadFromVault } = await import("./vault");
  const open = await unsealDownloadFromVault(item, destUri);
  items.set(id, {
    ...item,
    ...open,
    updatedAt: Date.now(),
  });
  schedulePersist();
  emit(true);
  return items.get(id);
}

export async function getStorageStats() {
  await hydrateDownloads();
  let used = 0;
  for (const d of items.values()) {
    used += d.bytesWritten || d.sizeHint || 0;
  }
  let free = 0;
  try {
    free = await FileSystem.getFreeDiskStorageAsync();
  } catch {
    free = 0;
  }
  return { used, free, count: items.size };
}

export function formatBytes(n) {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

export function progressOf(item) {
  if (!item) return 0;
  if (item.status === "completed") return 1;
  const total = item.totalBytes || item.sizeHint || 0;
  if (total <= 0) return 0;
  return Math.min(1, (item.bytesWritten || 0) / total);
}

// Kick hydration on import (non-blocking)
hydrateDownloads().catch(() => {});
