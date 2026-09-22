import { getApiBase, getPlayRelayBase, apiClientHeaders } from "./config";

async function fetchJson(url) {
  const res = await fetch(url, { headers: apiClientHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

export async function relayHealthy() {
  try {
    const data = await fetchJson(`${getPlayRelayBase()}/health`);
    return !!data.ok;
  } catch {
    return false;
  }
}

// Resolve stream list.
// In the browser, routes through secure Next.js BFF endpoint (/api/stream/resolve)
// to shield raw CDN links, tokens, and backend relay credentials.
export async function resolveStreams({ subjectId, detailPath, se = 0, ep = 0 }) {
  const isBrowser = typeof window !== "undefined";

  if (isBrowser) {
    try {
      const bffUrl = `/api/stream/resolve?subjectId=${encodeURIComponent(
        subjectId
      )}&detailPath=${encodeURIComponent(detailPath)}&se=${se}&ep=${ep}`;
      const res = await fetch(bffUrl);
      if (res.ok) {
        const bffData = await res.json();
        if (Array.isArray(bffData.sources) && bffData.sources.length > 0) {
          return {
            sources: bffData.sources,
            host: bffData.host || "secure-proxy",
            via: bffData.via || "bff",
          };
        }
      }
    } catch {
      // Fall through to direct resolution if BFF route fails
    }
  }

  const path = `/api/stream/${encodeURIComponent(
    subjectId
  )}?detail_path=${encodeURIComponent(detailPath)}&se=${se}&ep=${ep}`;

  if (await relayHealthy()) {
    const data = await fetchJson(`${getPlayRelayBase()}${path}`);
    return {
      sources: normalizeSources(data.sources),
      host: data.stream_domain || "localhost-relay",
      via: "relay",
    };
  }

  const data = await fetchJson(`${getApiBase()}${path}`);
  return {
    sources: normalizeSources(data.sources),
    host: data.stream_domain || "worker",
    via: "worker",
  };
}

// Format media URL for player. Never attaches master app_key in browser query params.
export function proxiedMediaUrl(cdnUrl) {
  if (!cdnUrl) return "";
  // Already routed through /api/media with a secure ticket
  if (cdnUrl.startsWith("/api/media") || cdnUrl.includes("/api/media?")) {
    return cdnUrl;
  }
  return cdnUrl;
}

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .filter((s) => s?.url)
    .map((s) => {
      const height = parseInt(String(s.resolution || "").replace(/p$/i, ""), 10) || 0;
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

export function pickDefaultIndex(sources) {
  const i720 = sources.findIndex((s) => s.height === 720);
  if (i720 >= 0) return i720;
  const i480 = sources.findIndex((s) => s.height === 480);
  if (i480 >= 0) return i480;
  return 0;
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
