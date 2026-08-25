import { NextResponse } from "next/server";
import { downloadSubdl, subdlConfigured } from "../../../../lib/subdl";
import { toWebVtt } from "../../../../lib/subtitles";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    if (!subdlConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Online subtitles aren’t set up yet",
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const fileId = body.file_id;
    if (!fileId) {
      return NextResponse.json(
        { ok: false, error: "file_id is required" },
        { status: 400 }
      );
    }
    if (body.download_url) {
      return NextResponse.json(
        { ok: false, error: "Use file_id from search results" },
        { status: 400 }
      );
    }

    const { text, file_name } = await downloadSubdl(fileId);
    const vtt = toWebVtt(text, file_name);

    return NextResponse.json({
      ok: true,
      provider: "subdl",
      file_name,
      vtt,
      label: String(file_name || "SubDL").replace(/\.(srt|vtt|txt|ass|ssa)$/i, ""),
    });
  } catch (err) {
    console.error("[subtitles/download]", err);
    return NextResponse.json(
      { ok: false, error: "Couldn’t download that subtitle" },
      { status: 502 }
    );
  }
}
