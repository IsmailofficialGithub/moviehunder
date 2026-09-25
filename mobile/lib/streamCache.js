import {
  pickAutoIndex,
  proxiedMediaUrl,
  resolveStreams,
} from "./stream";

const TTL_MS = 30 * 60 * 1000;
const WARM_BYTES = 768 * 1024; // ~first few MP4 segments
const PREFETCH_TIMEOUT_MS = 12000;
const store = new Map();
const inflight = new Map();
const warmed = new Set();

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function streamKey({ subjectId, detailPath, se = 0, ep = 0 }) {
  return `${subjectId}|${detailPath}|${se}|${ep}`;
}

export function getCachedStreams(params) {
  const key = streamKey(params);
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.result;
}

export function setCachedStreams(params, result) {
  store.set(streamKey(params), { result, at: Date.now() });
}

async function warmMediaUrl(url) {
  if (!url || warmed.has(url)) return;
  warmed.add(url);
  try {
    await fetch(url, {
      headers: { Range: `bytes=0-${WARM_BYTES - 1}` },
    });
  } catch {
    warmed.delete(url);
  }
}

const failedCooldown = new Map();
const FAILED_COOLDOWN_MS = 15000;

// Resolve streams + fetch the first chunk of the default quality.
export async function prefetchStreams(params, { maxHeight = 720 } = {}) {
  const key = streamKey(params);
  const cached = getCachedStreams(params);
  if (cached?.sources?.length) return cached;

  // Protect against rapid-fire retry storms (especially on 429s)
  const failedAt = failedCooldown.get(key);
  if (failedAt && Date.now() - failedAt < FAILED_COOLDOWN_MS) {
    throw new Error("Stream lookup temporarily cooling down. Please wait a few seconds.");
  }

  if (inflight.has(key)) {
    try {
      return await withTimeout(
        inflight.get(key),
        PREFETCH_TIMEOUT_MS,
        "Stream lookup timed out"
      );
    } catch {
      inflight.delete(key);
    }
  }

  const task = (async () => {
    try {
      const result = await withTimeout(
        resolveStreams(params),
        PREFETCH_TIMEOUT_MS,
        "Stream lookup timed out"
      );
      if (result.sources?.length) {
        failedCooldown.delete(key);
        setCachedStreams(params, result);
        const idx = pickAutoIndex(result.sources, maxHeight);
        const url = proxiedMediaUrl(result.sources[idx]?.url);
        warmMediaUrl(url).catch(() => {});
      }
      return result;
    } catch (err) {
      failedCooldown.set(key, Date.now());
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}
