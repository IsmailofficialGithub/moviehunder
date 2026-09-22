// Secure BFF Media Stream Route Handler
// Proxies media stream chunks directly with upstream origin/referer headers
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
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired playback ticket" },
        { status: 403 }
      );
    }

    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }

    // Forward Range and header metadata from browser video element
    const upstreamHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      Origin: "https://trackese.co",
      Referer: "https://trackese.co/",
    };

    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      upstreamHeaders["Range"] = rangeHeader;
    }

    const ifRangeHeader = request.headers.get("if-range");
    if (ifRangeHeader) {
      upstreamHeaders["If-Range"] = ifRangeHeader;
    }

    const clientIp =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip");
    if (clientIp) {
      upstreamHeaders["X-Forwarded-For"] = clientIp;
    }

    let upstreamRes = null;
    const relayBase = getPlayRelayBase();
    const appKey = String(
      process.env.APP_CLIENT_KEY ||
        process.env.NEXT_PUBLIC_APP_CLIENT_KEY ||
        ""
    ).trim();

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

        // If relay fails or is busy, fallback to direct fetch
        if (!upstreamRes || !upstreamRes.ok && upstreamRes.status !== 206) {
          upstreamRes = null;
        }
      } catch (err) {
        if (err.name === "AbortError") throw err;
        upstreamRes = null;
      }
    }

    // Direct fetch with CDN headers
    if (!upstreamRes && !request.signal.aborted) {
      upstreamRes = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: "follow",
        signal: request.signal,
      });
    }

    if (!upstreamRes || request.signal.aborted) {
      return new Response(null, { status: 499 });
    }

    // 200 OK or 206 Partial Content are valid media responses
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
    console.error("[api/media] stream error:", err);
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
