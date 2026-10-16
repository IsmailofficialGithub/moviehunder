import { NextResponse } from "next/server";
import { getApiBase, apiClientHeaders } from "../../../lib/config";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const { slug } = await context.params;
    if (!slug) {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    }

    const base = getApiBase();
    const res = await fetch(`${base}/episodes/${encodeURIComponent(slug)}`, {
      headers: apiClientHeaders(),
      next: { revalidate: 3600 },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, {
      status: res.status,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to load episodes" },
      { status: 500 }
    );
  }
}
