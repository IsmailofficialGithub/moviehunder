import { NextResponse } from "next/server";
import { getApiBase, apiClientHeaders } from "../../../../lib/config";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ error: "Slug required" }, { status: 400 });
    }
    const cleanSlug = String(slug).replace(/^\/?detail\//, "").replace(/^\/+/, "").trim();

    const bases = ["http://127.0.0.1:8787"];
    const configured = getApiBase();
    if (configured && !bases.includes(configured)) {
      bases.push(configured);
    }

    let lastErr = null;
    for (const base of bases) {
      try {
        const res = await fetch(`${base}/episodes/${encodeURIComponent(cleanSlug)}`, {
          headers: apiClientHeaders(),
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const data = await res.json();
          return NextResponse.json(data);
        }
      } catch (err) {
        lastErr = err;
      }
    }

    return NextResponse.json(
      { error: lastErr?.message || "Episodes not found" },
      { status: 404 }
    );
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
