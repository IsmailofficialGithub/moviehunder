import { unzipSync } from "fflate";
import { decodeBytes } from "./subtitles.js";

const API = "https://api.subdl.com/api/v1/subtitles";
const DL = "https://dl.subdl.com";

function getApiKey(env) {
  return String(env?.SUBDL_API_KEY || "").trim();
}

export function subdlConfigured(env) {
  return Boolean(getApiKey(env));
}

function toSubdlLang(languages = "en") {
  return String(languages)
    .split(",")
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean)
    .map((l) => {
      if (l === "en" || l.startsWith("en-")) return "EN";
      if (l === "hi" || l === "hin") return "HI";
      if (l === "ur") return "UR";
      if (l === "ar") return "AR";
      if (l === "es") return "ES";
      if (l === "fr") return "FR";
      if (l === "de") return "DE";
      if (l === "pt") return "PT";
      if (l === "tr") return "TR";
      return l.toUpperCase().slice(0, 2);
    })
    .join(",");
}

/** Strip api_key and host — keep SubDL path only (server-side). */
function normalizeSubdlPath(path) {
  let p = String(path || "").trim();
  if (!p) return "";
  try {
    if (p.startsWith("http")) {
      const u = new URL(p);
      if (!u.hostname.endsWith("subdl.com")) return "";
      u.searchParams.delete("api_key");
      p = u.pathname + (u.search || "");
    } else if (p.includes("api_key=")) {
      p = p.replace(/([?&])api_key=[^&]*/g, "").replace(/[?&]$/, "");
    }
  } catch {
    return "";
  }
  return p.startsWith("/") ? p : `/${p}`;
}

/** Opaque token for clients — never exposes SubDL URLs or api_key. */
export function encodeFileRef(path) {
  const rel = normalizeSubdlPath(path);
  if (!rel) throw new Error("Invalid subtitle path");
  const b64 = btoa(rel);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeFileRef(token) {
  const raw = String(token || "").trim();
  if (!raw || /^https?:\/\//i.test(raw)) {
    throw new Error("Invalid file_id");
  }
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const rel = atob(b64 + pad);
  if (!rel.startsWith("/") || !/\/[^/]+\.[a-z0-9]+$/i.test(rel)) {
    throw new Error("Invalid file_id");
  }
  return `${DL}${rel}`;
}

function resolveDownloadUrl(env, fileId) {
  const url = new URL(decodeFileRef(fileId));
  if (!url.hostname.endsWith("subdl.com")) {
    throw new Error("Invalid file_id");
  }
  const key = getApiKey(env);
  if (key && !url.searchParams.has("api_key")) {
    url.searchParams.set("api_key", key);
  }
  return url.toString();
}

export async function searchSubdl(env, { query, season, episode, languages = "en", type } = {}) {
  const key = getApiKey(env);
  if (!key) {
    const err = new Error("SubDL API key missing");
    err.code = "NO_API_KEY";
    throw err;
  }

  const params = new URLSearchParams();
  params.set("api_key", key);
  params.set("film_name", query);
  params.set("languages", toSubdlLang(languages));
  if (type === "episode" || type === "tv") params.set("type", "tv");
  else if (type === "movie") params.set("type", "movie");
  if (season && Number(season) > 0) params.set("season_number", String(season));
  if (episode && Number(episode) > 0) params.set("episode_number", String(episode));

  const res = await fetch(`${API}?${params}`, {
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) {
    throw new Error(data.message || data.error || `SubDL search failed (${res.status})`);
  }

  const list = Array.isArray(data.subtitles) ? data.subtitles : [];
  return list
    .map((row, i) => {
      const rawPath = row.url || row.download_link || "";
      if (!rawPath) return null;
      let file_id;
      try {
        file_id = encodeFileRef(rawPath);
      } catch {
        return null;
      }
      return {
        id: `subdl-${row.sd_id || i}`,
        file_id,
        file_name: row.name || row.release_name || "subtitle.srt",
        language: row.lang || row.language || "en",
        download_count: row.download_count || 0,
        release: row.release_name || row.name || "",
        season: row.season ?? null,
        episode: row.episode ?? null,
        from: "subdl",
      };
    })
    .filter(Boolean)
    .slice(0, 25);
}

function extractSubtitleText(buffer, preferredName = "") {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;

  if (!isZip) {
    return { text: decodeBytes(bytes), file_name: preferredName || "subtitle.srt" };
  }

  const files = unzipSync(bytes);
  const names = Object.keys(files).filter(
    (n) => !n.endsWith("/") && /\.(srt|vtt|txt|ass|ssa)$/i.test(n)
  );
  if (!names.length) {
    throw new Error("SubDL zip had no subtitle file inside");
  }
  names.sort((a, b) => {
    const score = (n) => (/\.srt$/i.test(n) ? 0 : /\.vtt$/i.test(n) ? 1 : 2);
    return score(a) - score(b);
  });
  const file_name = names[0].split("/").pop();
  return { text: decodeBytes(files[names[0]]), file_name };
}

/** Download by opaque file_id — api_key stays on server. */
export async function downloadSubdl(env, fileId) {
  if (!fileId) throw new Error("file_id is required");
  const downloadUrl = resolveDownloadUrl(env, fileId);

  const res = await fetch(downloadUrl, {
    headers: { Accept: "*/*" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`SubDL download failed (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  return extractSubtitleText(buf, new URL(downloadUrl).pathname.split("/").pop());
}
