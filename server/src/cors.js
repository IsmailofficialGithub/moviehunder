/**
 * CORS + client gate — only allowlisted web origins or the mobile app key.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { cfg } from "./config.js";

/** @type {AsyncLocalStorage<{ cors: Record<string, string> }>} */
export const requestContext = new AsyncLocalStorage();

function normalizeOrigin(origin) {
  try {
    const u = new URL(String(origin || "").trim());
    if (!/^https?:$/i.test(u.protocol)) return "";
    return u.origin;
  } catch {
    return "";
  }
}

function originFromReferer(request) {
  const ref = request.headers.get("Referer") || "";
  if (!ref) return "";
  return normalizeOrigin(ref);
}

function isOriginAllowed(origin, allowlist, suffixes) {
  if (!origin) return false;
  if (allowlist.includes("*")) return true;
  if (allowlist.includes(origin)) return true;
  let host = "";
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  for (const raw of suffixes) {
    const s = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/^\.+/, "");
    if (!s) continue;
    if (host === s || host.endsWith(`.${s}`)) return true;
  }
  return false;
}

export function corsHeadersForOrigin(originEcho) {
  const base = {
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Range, Content-Type, Accept, X-MovieHunter-Client, X-App-Key, Authorization",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Accept-Ranges, X-Stream-Resolution",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (originEcho) {
    return {
      ...base,
      "Access-Control-Allow-Origin": originEcho,
    };
  }
  return {
    ...base,
    "Access-Control-Allow-Origin": "null",
  };
}

export function activeCorsHeaders() {
  return (
    requestContext.getStore()?.cors || {
      "Access-Control-Allow-Origin": "null",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Range, Content-Type, Accept, X-MovieHunter-Client, X-App-Key, Authorization",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    }
  );
}

/**
 * @returns {{ ok: true, cors: Record<string, string>, kind: 'web'|'app' } | { ok: false, reason: string, received_origin?: string }}
 */
export function authorizeClient(request) {
  const allowlist = (cfg().CORS_ALLOWED_ORIGINS || [])
    .map((o) => (String(o).trim() === "*" ? "*" : normalizeOrigin(o)))
    .filter(Boolean);
  const suffixes = cfg().CORS_ALLOWED_ORIGIN_SUFFIXES || [];
  const expectedKey = String(cfg().APP_CLIENT_KEY || "").trim();

  const originRaw = request.headers.get("Origin");
  let origin = originRaw ? normalizeOrigin(originRaw) : "";
  if (!origin) origin = originFromReferer(request);

  let selfOrigin = "";
  try {
    selfOrigin = new URL(request.url).origin;
  } catch {
    /* ignore */
  }

  let appKey = String(request.headers.get("X-App-Key") || "").trim();
  if (!appKey) {
    try {
      appKey = String(
        new URL(request.url).searchParams.get("app_key") || ""
      ).trim();
    } catch {
      /* ignore */
    }
  }

  const keyOk = Boolean(expectedKey) && appKey === expectedKey;
  const webOk =
    isOriginAllowed(origin, allowlist, suffixes) ||
    (Boolean(origin) && Boolean(selfOrigin) && origin === selfOrigin);

  if (!allowlist.length && !suffixes.length && !expectedKey) {
    return {
      ok: false,
      reason:
        "CORS not configured — set CORS_ALLOWED_ORIGINS and APP_CLIENT_KEY in .dev.vars",
      received_origin: origin || null,
    };
  }

  if (webOk) {
    return {
      ok: true,
      kind: "web",
      cors: corsHeadersForOrigin(origin || selfOrigin || null),
    };
  }

  if (keyOk) {
    return {
      ok: true,
      kind: "app",
      cors: corsHeadersForOrigin(origin || null),
    };
  }

  return {
    ok: false,
    reason: origin
      ? `Origin not allowed: ${origin}`
      : "Unauthorized client — use the official web app or mobile app",
    received_origin: origin || null,
  };
}
