import { NextResponse } from "next/server";
import { getApiBase, apiClientHeaders } from "../../../lib/config";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";
    if (!q) {
      return NextResponse.json({ movies: [] });
    }

    const bases = ["http://127.0.0.1:8787"];
    const configured = getApiBase();
    if (configured && !bases.includes(configured)) {
      bases.push(configured);
    }

    for (const base of bases) {
      try {
        const res = await fetch(`${base}/search?q=${encodeURIComponent(q)}`, {
          headers: apiClientHeaders(),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          return NextResponse.json(data);
        }
      } catch {}
    }

    return NextResponse.json({ movies: [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
