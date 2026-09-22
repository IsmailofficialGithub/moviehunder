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
    const appKey = String(process.env.APP_CLIENT_KEY || "").trim();

    // If a remote or local relay is configured, request through relay with server-side credentials
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
      } catch {
        // Fall back to direct fetch if relay network request fails
      }
    }

    if (!upstreamRes || !upstreamRes.ok) {
      upstreamRes = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: "follow",
      });
    }

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return NextResponse.json(
        { ok: false, error: `Upstream media error (${upstreamRes.status})` },
        { status: upstreamRes.status }
      );
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
