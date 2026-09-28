// Secure Media Redirect Route Handler
// Redirects video requests directly to upstream CDN or relay to consume 0 Vercel bandwidth
import { NextResponse } from "next/server";
import { verifyPlaybackTicket } from "../../../lib/mediaSecurity";
import { getPlayRelayBase } from "../../../lib/config";

export const dynamic = "force-dynamic";

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

    const relayBase = getPlayRelayBase();

    // If relay is configured, redirect to relay to handle CDN headers and streaming
    if (relayBase) {
      let base = relayBase;
      try {
        const reqHost = url.hostname;
        const relayUrl = new URL(relayBase);
        if (
          (relayUrl.hostname === "127.0.0.1" || relayUrl.hostname === "localhost") &&
          reqHost &&
          reqHost !== relayUrl.hostname
        ) {
          relayUrl.hostname = reqHost;
          base = relayUrl.origin;
        }
      } catch {}
      const redirectUrl = `${base}/api/media?url=${encodeURIComponent(targetUrl)}`;
      return Response.redirect(redirectUrl, 302);
    }

    // Direct proxy fallback with upstream headers when no relay is set
    const upstreamHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      Origin: "https://123movienow.cc",
      Referer: "https://123movienow.cc/",
    };
    const range = request.headers.get("range");
    if (range) upstreamHeaders["Range"] = range;

    const upstreamRes = await fetch(targetUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: "follow",
      signal: request.signal,
    });

    const outHeaders = new Headers();
    const forwardHeader = (name) => {
      const val = upstreamRes.headers.get(name);
      if (val) outHeaders.set(name, val);
    };

    forwardHeader("content-type");
    forwardHeader("content-length");
    forwardHeader("content-range");
    forwardHeader("accept-ranges");
    outHeaders.set("Cache-Control", "private, max-age=60");

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: outHeaders,
    });
  } catch (err) {
    console.error("[api/media] redirect error:", err);
    return NextResponse.json(
      { ok: false, error: "Media redirect failed" },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  return handleMedia(request);
}

export async function HEAD(request) {
  return handleMedia(request);
}
