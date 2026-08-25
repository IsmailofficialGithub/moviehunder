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
  // Native app responses don't need ACAO; keep a safe default for browsers
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
        "Range, Content-Type, Accept, X-MovieHunter-Client, X-App-Key",
      Vary: "Origin",
    }
  );
}

/**
 * @returns {{ ok: true, cors: Record<string, string>, kind: 'web'|'app' } | { ok: false, reason: string }}
 */
export function authorizeClient(request) {
  const origins = (cfg().CORS_ALLOWED_ORIGINS || [])
    .map(normalizeOrigin)
    .filter(Boolean);
  const expectedKey = String(cfg().APP_CLIENT_KEY || "").trim();
  const originRaw = request.headers.get("Origin");
  const origin = originRaw ? normalizeOrigin(originRaw) : "";

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

  if (!origins.length && !expectedKey) {
    return {
      ok: false,
      reason:
        "CORS not configured — set CORS_ALLOWED_ORIGINS and APP_CLIENT_KEY in .env",
    };
  }

  // Web browser: Origin must be on the allowlist
  if (origin && origins.includes(origin)) {
    return {
      ok: true,
      kind: "web",
      cors: corsHeadersForOrigin(origin),
    };
  }

  // Mobile / native / SSR / media players: shared app key (header or ?app_key=)
  if (keyOk) {
    return {
      ok: true,
      kind: "app",
      cors: corsHeadersForOrigin(
        origin && origins.includes(origin) ? origin : null
      ),
    };
  }

  if (origin && !origins.includes(origin)) {
    return { ok: false, reason: "Origin not allowed" };
  }

  return {
    ok: false,
    reason: "Unauthorized client — use the official web app or mobile app",
  };
}
