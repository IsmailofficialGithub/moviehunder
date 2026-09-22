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

        // If relay itself is rate-limited or hard-errors, pass it upstream immediately
        // — do NOT fallback to direct CDN fetch, as that double-hits the CDN and
        // causes the 429 seen on the first request.
        if (upstreamRes.status === 429) {
          return new Response(null, {
            status: 429,
            headers: {
              "Retry-After": upstreamRes.headers.get("Retry-After") || "3",
              "Cache-Control": "no-store",
            },
          });
        }
      } catch {
        // Relay connection failed (network), fall through to direct fetch
        upstreamRes = null;
      }
    }

    // Only fall through to direct fetch if relay was not configured or threw a network error
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
