import { NextResponse } from "next/server";
import { searchSubdl, subdlConfigured } from "../../../../lib/subdl";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!subdlConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          configured: false,
          error: "Online subtitles aren’t set up yet",
          results: [],
        },
        { status: 200 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";
    const season = searchParams.get("season") || "";
    const episode = searchParams.get("episode") || "";
    const languages = searchParams.get("languages") || "en";
    const type = searchParams.get("type") || "";

    if (!query.trim()) {
      return NextResponse.json(
        { ok: false, error: "query is required", results: [] },
        { status: 400 }
      );
    }

    const results = await searchSubdl({
      query: query.trim(),
      season,
      episode,
      languages,
      type: type || undefined,
    });

    return NextResponse.json({
      ok: true,
      configured: true,
      provider: "subdl",
      count: results.length,
      results,
    });
  } catch (err) {
    console.error("[subtitles/search]", err);
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: "Subtitle search didn’t work",
        results: [],
      },
      { status: 502 }
    );
  }
}
