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

    // Direct 302 redirect to upstream video stream (0 Vercel bandwidth consumed)
    return Response.redirect(targetUrl, 302);
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
