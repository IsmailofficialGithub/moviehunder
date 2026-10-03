/**
 * Node API router for auth, sync, and device access (Prisma + nodemailer).
 * Used by play-relay; Worker proxies these paths here.
 */

import {
  verifyDeviceAccess,
  setDeviceBlocked,
  listDevices,
  assertAdmin,
} from "./access.js";
import {
  handleSignup,
  handleLogin,
  handleLogout,
  handleRefresh,
  handleVerifyEmail,
  handleResendVerification,
  handleMe,
  handleSetPassword,
  handleGoogleStart,
  handleLinkGoogle,
  handleGoogleCallbackWithLink,
} from "./auth.js";
import {
  handleGetProfiles,
  handleCreateProfile,
  handleUpdateProfile,
  handleDeleteProfile,
  handleBuyExtraSlot,
} from "./profiles.js";
import {
  handleGetWatchProgress,
  handlePutWatchProgress,
  handleDeleteWatchProgress,
  handleGetPlaylists,
  handlePutPlaylists,
  handleGetLikes,
  handlePutLikes,
  handleGetDownloads,
  handlePutDownloads,
  handleSyncGuestHistory,
} from "./sync.js";
import {
  handlePlaybackStart,
  handlePlaybackHeartbeat,
  handlePlaybackStop,
  handleRequestCode,
  handleVerifyCode,
} from "./antisharing.js";

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/**
 * @param {Request} request
 * @param {{ env?: Record<string, string> }} [opts]
 * @returns {Promise<Response|null>} null if path not handled
 */
export async function handleNodeApi(request, opts = {}) {
  const env = opts.env || process.env;
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method || "GET";

  // ── Access ──────────────────────────────────────────────
  if (p === "/api/access/verify" && method === "POST") {
    const body = await readJson(request);
    try {
      const result = await verifyDeviceAccess(env, body);
      return json({ ok: result.allowed, ...result }, result.allowed ? 200 : 403);
    } catch (err) {
      console.error("[access/verify]", err);
      return json(
        {
          ok: false,
          allowed: true,
          mode: "degraded",
          error: err.message || "Access check failed",
          hint: "Check DATABASE_URL and that Prisma migrations are applied",
        },
        503
      );
    }
  }

  if (p === "/api/access/devices" && method === "GET") {
    const auth = assertAdmin(env, request);
    if (!auth.ok) return json({ error: auth.error }, 401);
    try {
      const devices = await listDevices(env, {
        limit: url.searchParams.get("limit"),
      });
      return json({ ok: true, devices });
    } catch (err) {
      return json({ error: err.message || "List failed" }, 502);
    }
  }

  if (p === "/api/access/block" && method === "POST") {
    const auth = assertAdmin(env, request);
    if (!auth.ok) return json({ error: auth.error }, 401);
    const body = await readJson(request);
    try {
      const row = await setDeviceBlocked(env, body);
      return json({ ok: true, device: row });
    } catch (err) {
      return json({ error: err.message || "Block failed" }, 502);
    }
  }

  // ── Auth ────────────────────────────────────────────────
  if (p === "/api/auth/signup" && method === "POST") {
    return fromHandler(await handleSignup(request));
  }
  if (p === "/api/auth/login" && method === "POST") {
    return fromHandler(await handleLogin(request));
  }
  if (p === "/api/auth/logout" && method === "POST") {
    return fromHandler(await handleLogout(request));
  }
  if (p === "/api/auth/refresh" && method === "POST") {
    return fromHandler(await handleRefresh(request));
  }
  if (p === "/api/auth/verify-email" && method === "POST") {
    return fromHandler(await handleVerifyEmail(request));
  }
  if (p === "/api/auth/resend-verification" && method === "POST") {
    return fromHandler(await handleResendVerification(request));
  }
  if (p === "/api/auth/me" && method === "GET") {
    return fromHandler(await handleMe(request));
  }
  if (p === "/api/auth/set-password" && method === "POST") {
    return fromHandler(await handleSetPassword(request));
  }
  if (p === "/api/auth/google/start" && (method === "GET" || method === "POST")) {
    return fromHandler(await handleGoogleStart(request));
  }
  if (p === "/api/auth/google/callback" && method === "GET") {
    return fromHandler(await handleGoogleCallbackWithLink(request));
  }
  if (p === "/api/auth/link/google" && method === "POST") {
    return fromHandler(await handleLinkGoogle(request));
  }

  // ── Profiles ────────────────────────────────────────────
  if (p === "/api/profiles" && method === "GET") {
    return fromHandler(await handleGetProfiles(request));
  }
  if (p === "/api/profiles" && method === "POST") {
    return fromHandler(await handleCreateProfile(request));
  }
  if (p.startsWith("/api/profiles/") && p !== "/api/profiles/extra-slot") {
    const profileId = p.slice("/api/profiles/".length);
    if (method === "PUT") {
      return fromHandler(await handleUpdateProfile(request, profileId));
    }
    if (method === "DELETE") {
      return fromHandler(await handleDeleteProfile(request, profileId));
    }
  }
  if (p === "/api/profiles/extra-slot" && method === "POST") {
    return fromHandler(await handleBuyExtraSlot(request));
  }

  // ── Sync ────────────────────────────────────────────────
  if (p === "/api/sync/watch-progress" && method === "GET") {
    return fromHandler(await handleGetWatchProgress(request));
  }
  if (p === "/api/sync/watch-progress" && method === "PUT") {
    return fromHandler(await handlePutWatchProgress(request));
  }
  if (p === "/api/sync/watch-progress" && method === "DELETE") {
    return fromHandler(await handleDeleteWatchProgress(request));
  }
  if (p === "/api/sync/playlists" && method === "GET") {
    return fromHandler(await handleGetPlaylists(request));
  }
  if (p === "/api/sync/playlists" && method === "PUT") {
    return fromHandler(await handlePutPlaylists(request));
  }
  if (p === "/api/sync/likes" && method === "GET") {
    return fromHandler(await handleGetLikes(request));
  }
  if (p === "/api/sync/likes" && method === "PUT") {
    return fromHandler(await handlePutLikes(request));
  }
  if (p === "/api/sync/downloads" && method === "GET") {
    return fromHandler(await handleGetDownloads(request));
  }
  if (p === "/api/sync/downloads" && method === "PUT") {
    return fromHandler(await handlePutDownloads(request));
  }
  if (p === "/api/history/sync" && method === "POST") {
    return fromHandler(await handleSyncGuestHistory(request));
  }

  // ── Anti-Sharing ───────────────────────────────────────
  if (p === "/api/playback/start" && method === "POST") {
    return fromHandler(await handlePlaybackStart(request));
  }
  if (p === "/api/playback/heartbeat" && method === "POST") {
    return fromHandler(await handlePlaybackHeartbeat(request));
  }
  if (p === "/api/playback/stop" && method === "POST") {
    return fromHandler(await handlePlaybackStop(request));
  }
  if (p === "/api/household/request-code" && method === "POST") {
    return fromHandler(await handleRequestCode(request));
  }
  if (p === "/api/household/verify-code" && method === "POST") {
    return fromHandler(await handleVerifyCode(request));
  }

  return null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function fromHandler(result) {
  if (!result) return json({ error: "Empty handler result" }, 500);
  if (result.redirect) {
    return Response.redirect(result.redirect, result.status || 302);
  }
  return json(result.body ?? {}, result.status || 200);
}

export function isNodeApiPath(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return (
    p.startsWith("/api/access") ||
    p.startsWith("/api/auth") ||
    p.startsWith("/api/sync") ||
    p.startsWith("/api/history/sync") ||
    p.startsWith("/api/playback") ||
    p.startsWith("/api/household")
  );
}
