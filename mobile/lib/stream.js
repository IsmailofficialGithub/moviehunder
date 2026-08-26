import { getApiBase, getPlayRelayBase, apiClientHeaders, withAppKeyQuery } from "./config";
import { toUserMessage } from "./userFacingError";

const FETCH_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, message = "Request timed out") {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function fetchJson(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await withTimeout(
      fetch(url, {
        signal: ctrl.signal,
        headers: apiClientHeaders(),
      }),
      timeoutMs + 500,
      "Request timed out"
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(
        toUserMessage(data.error || data.reason, "Request failed. Please try again.")
      );
      err.status = res.status;
      err.code = data.code;
      throw err;
    }
    return data;
  } catch (err) {
    throw new Error(
      toUserMessage(
        err,
        "Couldn't load streams. Check your connection and try again."
      )
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function relayHealthy() {
  try {
    const data = await fetchJson(`${getPlayRelayBase()}/health`, {
      timeoutMs: 1500,
    });
    return !!data.ok;
  } catch {
    return false;
  }
}

/**
 * Resolve stream qualities.
 * Tries catalog API first (same host as browsing), then play relay.
 */
export async function resolveStreams({ subjectId, detailPath, se = 0, ep = 0 }) {
  const path = `/api/stream/${encodeURIComponent(
    subjectId
  )}?detail_path=${encodeURIComponent(detailPath)}&se=${se}&ep=${ep}`;

  let lastErr;
  try {
    const data = await fetchJson(`${getApiBase()}${path}`, { timeoutMs: 8000 });
    const sources = normalizeSources(data.sources);
    if (sources.length) {
      return { sources, via: "worker" };
    }
  } catch (err) {
    lastErr = err;
  }

  try {
    const data = await fetchJson(`${getPlayRelayBase()}${path}`, {
      timeoutMs: 6000,
    });
    const sources = normalizeSources(data.sources);
    if (sources.length) {
      return { sources, via: "relay" };
    }
  } catch (err) {
    lastErr = err;
  }

  throw lastErr || new Error("No streams available");
}

/** Proxy CDN URL through play relay so Referer/Origin work on device. */
export function proxiedMediaUrl(cdnUrl) {
  if (!cdnUrl) return "";
  if (cdnUrl.includes("/api/media?")) return withAppKeyQuery(cdnUrl);
  return withAppKeyQuery(
    `${getPlayRelayBase()}/api/media?url=${encodeURIComponent(cdnUrl)}`
  );
}

/**
 * Best download URL: CDN via Node play-relay (supports Range / resume).
 * Never use Worker /watch for downloads — proxying multi‑GB files through
 * workerd melts CPU and exhausts localhost ports (EADDRNOTAVAIL).
 */
export function downloadMediaUrl({
  subjectId,
  detailPath,
  se = 0,
  ep = 0,
  height = 0,
  cdnUrl = "",
}) {
  if (cdnUrl) return proxiedMediaUrl(cdnUrl);
  // Last resort only when CDN URL is unknown
  if (subjectId && detailPath) {
    return watchStreamUrl({
      subjectId,
      detailPath,
      se,
      ep,
      resolution: height || 0,
    });
  }
  return "";
}

/**
 * Worker progressive stream for a given resolution (fallback if relay media fails).
 */
export function watchStreamUrl({ subjectId, detailPath, se = 0, ep = 0, resolution = 0 }) {
  const q = new URLSearchParams({
    detail_path: String(detailPath || ""),
    se: String(se),
    ep: String(ep),
  });
  if (resolution > 0) q.set("resolution", String(resolution));
  return withAppKeyQuery(
    `${getApiBase()}/watch/${encodeURIComponent(subjectId)}?${q.toString()}`
  );
}

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .filter((s) => s?.url)
    .map((s) => {
      const height =
        parseInt(String(s.resolution || s.resolutions || "").replace(/p$/i, ""), 10) ||
        0;
      return {
        url: s.url,
        resolution: s.resolution || (height ? `${height}p` : "Auto"),
        height,
        format: s.format || "MP4",
        size_bytes: s.size_bytes ?? null,
        id: s.id || null,
      };
    })
    .sort((a, b) => b.height - a.height);
}

/** Prefer 720p, then 480p, then highest available. */
export function pickDefaultIndex(sources) {
  const i720 = sources.findIndex((s) => s.height === 720);
  if (i720 >= 0) return i720;
  const i480 = sources.findIndex((s) => s.height === 480);
  if (i480 >= 0) return i480;
  return 0;
}

/** Auto mode starts at ≤720p (or nearest below). */
export function pickAutoIndex(sources, maxHeight = 720) {
  if (!sources.length) return 0;
  const eligible = sources
    .map((s, i) => ({ i, h: s.height || 0 }))
    .filter((x) => x.h > 0 && x.h <= maxHeight);
  if (!eligible.length) {
    // all higher than max — pick lowest
    let best = 0;
    for (let i = 1; i < sources.length; i++) {
      if ((sources[i].height || 0) < (sources[best].height || 0)) best = i;
    }
    return best;
  }
  eligible.sort((a, b) => b.h - a.h);
  return eligible[0].i;
}

/** Next lower quality index (worse network). */
export function lowerQualityIndex(sources, current) {
  // sources sorted high→low; next index is lower quality
  if (current < sources.length - 1) return current + 1;
  return current;
}

/** Next higher quality index, capped for Auto. */
export function higherQualityIndex(sources, current, maxHeight = 720) {
  if (current <= 0) return 0;
  const next = current - 1;
  if ((sources[next]?.height || 0) > maxHeight) return current;
  return next;
}

export function formatBytes(n) {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}
