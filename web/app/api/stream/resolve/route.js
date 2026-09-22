// Server-side stream resolution route
// Resolves streams from backend/relay and replaces raw upstream URLs with opaque tickets
import { NextResponse } from "next/server";
import { getApiBase, getPlayRelayBase } from "../../../../lib/config";
import { createPlaybackTicket } from "../../../../lib/mediaSecurity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const subjectId = url.searchParams.get("subjectId");
    const detailPath = url.searchParams.get("detailPath");
    const se = url.searchParams.get("se") || "0";
    const ep = url.searchParams.get("ep") || "0";

    if (!subjectId || !detailPath) {
      return NextResponse.json(
        { ok: false, error: "subjectId and detailPath are required" },
        { status: 400 }
      );
    }

    const appKey = String(process.env.APP_CLIENT_KEY || "").trim();
    const serverHeaders = {
      Accept: "application/json",
      "X-MovieHunter-Client": "web",
    };
    if (appKey) serverHeaders["X-App-Key"] = appKey;

    const streamPath = `/api/stream/${encodeURIComponent(
      subjectId
    )}?detail_path=${encodeURIComponent(detailPath)}&se=${se}&ep=${ep}`;

    let data = null;
    let via = "worker";
    let streamDomain = "";

    // Prefer play relay if available
    const relayBase = getPlayRelayBase();
    if (relayBase) {
      try {
        const relayRes = await fetch(`${relayBase}${streamPath}`, {
          headers: serverHeaders,
        });
        if (relayRes.ok) {
          data = await relayRes.json();
          via = "relay";
          streamDomain = data.stream_domain || "relay";
        }
      } catch {
        // Relay failed, fall through to worker API
      }
    }

    if (!data) {
      const apiRes = await fetch(`${getApiBase()}${streamPath}`, {
        headers: serverHeaders,
      });
      if (!apiRes.ok) {
        const errData = await apiRes.json().catch(() => ({}));
        return NextResponse.json(
          { ok: false, error: errData.error || `Stream resolve failed (${apiRes.status})` },
          { status: apiRes.status }
        );
      }
      data = await apiRes.json();
      via = "worker";
      streamDomain = data.stream_domain || "worker";
    }

    const rawSources = Array.isArray(data.sources) ? data.sources : [];

    // Mask raw CDN URLs by converting them into secure, short-lived playback tickets
    const maskedSources = rawSources
      .filter((s) => s?.url)
      .map((s) => {
        const height =
          parseInt(String(s.resolution || "").replace(/p$/i, ""), 10) || 0;
        const ticket = createPlaybackTicket(s.url);
        return {
          url: `/api/media?ticket=${ticket}`,
          resolution: s.resolution || (height ? `${height}p` : "Auto"),
          height,
          format: s.format || "MP4",
          size_bytes: s.size_bytes ?? null,
          id: s.id || null,
        };
      })
      .sort((a, b) => b.height - a.height);

    return NextResponse.json({
      ok: true,
      sources: maskedSources,
      host: streamDomain,
      via,
    });
  } catch (err) {
    console.error("[api/stream/resolve] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to resolve media streams" },
      { status: 500 }
    );
  }
}
