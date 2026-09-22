// Secure BFF Media Stream Route Handler
// Proxies media chunks safely without exposing upstream URLs or master app_key
import { NextResponse } from "next/server";
import { verifyPlaybackTicket } from "../../../lib/mediaSecurity";
import { getPlayRelayBase } from "../../../lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired playback ticket" },
        { status: 403 }
      );
    }

    // Forward Range header from the browser video element
    const rangeHeader = request.headers.get("range");
    const upstreamHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
    };
    if (rangeHeader) {
      upstreamHeaders["Range"] = rangeHeader;
    }

    // Attempt upstream streaming directly or via internal relay
    let upstreamRes;
    const relayBase = getPlayRelayBase();
    const appKey = String(process.env.APP_CLIENT_KEY || process.env.NEXT_PUBLIC_APP_CLIENT_KEY || "").trim();

    // If a remote relay is configured, prefer it (it sets correct Referer / Origin)
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
        });

        // Relay is busy (503) — fall through to direct CDN immediately
        if (upstreamRes.status === 503) {
          upstreamRes = null;
        }

        // CDN rate-limited through relay (429) — wait briefly then retry once via relay
        // If still 429, fall through to direct CDN (which has its own signed token)
        if (upstreamRes && upstreamRes.status === 429) {
          await new Promise((r) => setTimeout(r, 800));
          upstreamRes = await fetch(relayMediaUrl, {
            method: request.method,
            headers: relayHeaders,
          });
          if (upstreamRes.status === 429) {
            // Still rate-limited — try direct CDN as last resort
            upstreamRes = null;
          }
        }

        // Relay auth failed (key not configured / wrong) — fall through to direct CDN
        if (upstreamRes && (upstreamRes.status === 401 || upstreamRes.status === 403)) {
          upstreamRes = null;
        }
      } catch {
        // Relay connection failed (network error) — fall through to direct CDN
        upstreamRes = null;
      }
    }

    // Fall through to direct CDN when relay was not configured, auth failed, busy, or rate-limited
    if (!upstreamRes) {
      upstreamRes = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: "follow",
      });
    }

    // 206 Partial Content is a success for Range requests — check for actual errors
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
