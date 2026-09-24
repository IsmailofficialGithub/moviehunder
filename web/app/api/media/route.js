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
    const isRelayConfigured =
      relayBase &&
      !relayBase.includes("127.0.0.1:8788") &&
      !relayBase.includes("localhost:8788");

    let redirectUrl = targetUrl;
    if (isRelayConfigured) {
      redirectUrl = `${relayBase}/api/media?url=${encodeURIComponent(targetUrl)}`;
    }

    // 302 Redirect to upstream CDN or Relay. Transfers 0 video bytes through Vercel.
    return Response.redirect(redirectUrl, 302);
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
