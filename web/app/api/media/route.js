// Secure BFF Media Stream Route Handler
// Proxies media chunks safely without exposing upstream URLs or master app_key
import { NextResponse } from "next/server";
import { verifyPlaybackTicket } from "../../../lib/mediaSecurity";
import { getPlayRelayBase } from "../../../lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// CDN sliding-window token bucket — module-level so it persists across requests
// on the same Node.js process (the Next.js long-running server).
// All configurable via env vars; safe defaults are conservative enough to avoid 429.
const CDN_MAX_REQUESTS = Number(process.env.CDN_MAX_REQUESTS || 3);
const CDN_WINDOW_MS = Number(process.env.CDN_WINDOW_MS || 10000); // 10 seconds
const CDN_BAN_COOLDOWN_MS = Number(process.env.CDN_BAN_COOLDOWN_MS || 15000); // 15 seconds after a real 429

// Timestamps (Date.now()) of recent CDN request starts within the current window
const cdnRequestLog = [];
// If we received a real 429, record when we can retry again
let cdnBanUntil = 0;

// Acquire a token from the bucket. Resolves when it is safe to make a CDN request.
// If the request is aborted while waiting, resolves early so the caller can check signal.aborted.
async function acquireCdnSlot(signal) {
  while (true) {
    if (signal.aborted) return;

    const now = Date.now();

    // If we're in a ban period (got a real 429), wait until ban expires
    if (cdnBanUntil > now) {
      const wait = cdnBanUntil - now;
      await new Promise((r) => setTimeout(r, Math.min(wait, 500)));
      continue;
    }

    // Evict timestamps outside the sliding window
    const windowStart = now - CDN_WINDOW_MS;
    while (cdnRequestLog.length > 0 && cdnRequestLog[0] < windowStart) {
      cdnRequestLog.shift();
    }

    // If we have capacity, consume a slot and proceed
    if (cdnRequestLog.length < CDN_MAX_REQUESTS) {
      cdnRequestLog.push(now);
      return;
    }

    // No capacity — wait until the oldest request falls out of the window
    const oldestTs = cdnRequestLog[0];
    const msUntilSlotFree = oldestTs + CDN_WINDOW_MS - now + 10; // +10ms margin
    await new Promise((r) => setTimeout(r, Math.min(msUntilSlotFree, 500)));
  }
}

// Record a real CDN 429 response — impose a ban cooldown
function recordCdnBan(retryAfterHeader) {
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : null;
  const cooldownMs =
    retryAfterSec && retryAfterSec > 0
      ? retryAfterSec * 1000
      : CDN_BAN_COOLDOWN_MS;
  cdnBanUntil = Date.now() + cooldownMs;
  // Clear the log so the window starts fresh after the ban
  cdnRequestLog.length = 0;
}

async function handleMedia(request) {
  try {
    const url = new URL(request.url);
    const ticket = url.searchParams.get("ticket");

    if (!ticket) {
      return NextResponse.json(
        { ok: false, error: "Playback ticket is required" },
        { status: 400 }
      );
    }

    let targetUrl;
    try {
      targetUrl = verifyPlaybackTicket(ticket);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired playback ticket" },
        { status: 403 }
      );
    }

    // Wait for a CDN slot before proceeding — this is the core rate-limit fix.
    // Instead of a blind fixed delay, we precisely mirror the CDN's rate limit window.
    await acquireCdnSlot(request.signal);
    if (request.signal.aborted) {
      return new Response(null, { status: 499 }); // Client Closed Request — no CDN hit needed
    }

    // Forward Range header from the browser video element
    const rangeHeader = request.headers.get("range");
    const upstreamHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      Origin: "https://trackese.co",
      Referer: "https://trackese.co/",
      Connection: "close", // Ensure TCP socket is closed after each response — prevents connection pool buildup
    };

    // Pass real client IP to avoid all users sharing one CDN rate-limit bucket
    const clientIp =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip");
    if (clientIp) {
      upstreamHeaders["X-Forwarded-For"] = clientIp;
    }

    if (rangeHeader) {
      upstreamHeaders["Range"] = rangeHeader;
    }

    let upstreamRes;
    const relayBase = getPlayRelayBase();
    const appKey = String(
      process.env.APP_CLIENT_KEY ||
        process.env.NEXT_PUBLIC_APP_CLIENT_KEY ||
        ""
    ).trim();

    // Prefer remote relay if configured — it sets correct CDN Referer/Origin from PLAY_HOSTS
    const isRelayConfigured =
      relayBase &&
      !relayBase.includes("127.0.0.1:8788") &&
      !relayBase.includes("localhost:8788");

    if (isRelayConfigured) {
      try {
        const relayHeaders = { ...upstreamHeaders };
        if (appKey) relayHeaders["X-App-Key"] = appKey;
        const relayMediaUrl = `${relayBase}/api/media?url=${encodeURIComponent(
          targetUrl
        )}`;

        upstreamRes = await fetch(relayMediaUrl, {
          method: request.method,
          headers: relayHeaders,
          signal: request.signal,
        });

        // Relay busy — fall through to direct CDN
        if (upstreamRes.status === 503) {
          upstreamRes = null;
        }

        // CDN rate-limited the relay — record ban and fall through to direct CDN
        if (upstreamRes && upstreamRes.status === 429) {
          recordCdnBan(upstreamRes.headers.get("Retry-After"));
          upstreamRes = null;
        }

        // Relay auth failed — fall through to direct CDN
        if (
          upstreamRes &&
          (upstreamRes.status === 401 || upstreamRes.status === 403)
        ) {
          upstreamRes = null;
        }
      } catch (err) {
        if (err.name === "AbortError") throw err;
        upstreamRes = null;
      }
    }

    // Direct CDN fetch when relay is not available
    if (!upstreamRes && !request.signal.aborted) {
      upstreamRes = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: "follow",
        signal: request.signal,
      });

      // Real 429 from CDN — record ban so future requests back off correctly
      if (upstreamRes.status === 429) {
        recordCdnBan(upstreamRes.headers.get("Retry-After"));
      }
    }

    if (!upstreamRes || request.signal.aborted) {
      return new Response(null, { status: 499 });
    }

    // 206 Partial Content is success for Range requests
    const statusOk = upstreamRes.ok || upstreamRes.status === 206;
    if (!statusOk) {
      return new Response(null, {
        status: upstreamRes.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      upstreamRes.headers.get("content-type") || "video/mp4"
    );
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "private, no-cache, no-store");

    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    }

    const contentRange = upstreamRes.headers.get("content-range");
    if (contentRange) {
      responseHeaders.set("Content-Range", contentRange);
    }

    if (request.method === "HEAD") {
      return new Response(null, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    console.error("[api/media] proxy error:", err);
    return NextResponse.json(
      { ok: false, error: "Media streaming failed" },
      { status: 502 }
    );
  }
}

export async function GET(request) {
  return handleMedia(request);
}

export async function HEAD(request) {
  return handleMedia(request);
}
