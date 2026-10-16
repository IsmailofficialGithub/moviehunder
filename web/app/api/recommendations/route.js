import { NextResponse } from "next/server";
import { getApiBase, apiClientHeaders } from "../../../lib/config";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "movie";
    const exclude = url.searchParams.get("exclude") || "";
    const limit = Number(url.searchParams.get("limit")) || 16;

    // 1. Try local server first
    try {
      const localRes = await fetch(
        `http://127.0.0.1:8787/recommendations?type=${encodeURIComponent(type)}&exclude=${encodeURIComponent(exclude)}&limit=${limit}`,
        {
          headers: apiClientHeaders(),
          signal: AbortSignal.timeout(3000),
        }
      );
      if (localRes.ok) {
        const data = await localRes.json();
        const list = Array.isArray(data) ? data : (data.recommendations || data.items || []);
        if (list.length > 0) {
          return NextResponse.json({
            type,
            count: list.length,
            recommendations: list,
          });
        }
      }
    } catch {
      // Local endpoint failed, fall through to catalog fallback
    }

    // 2. Fallback: fetch from catalog endpoint based on type (/movies, /tv-series, /animation)
    const base = getApiBase() || "https://api.offstream.co";
    let catPath = "/movies";
    if (type === "anime") catPath = "/animation";
    else if (type === "series") catPath = "/tv-series";

    let items = [];
    try {
      const catRes = await fetch(`${base}${catPath}`, {
        headers: apiClientHeaders(),
        signal: AbortSignal.timeout(6000),
      });
      if (catRes.ok) {
        const catData = await catRes.json();
        const raw = Array.isArray(catData) ? catData : (catData.movies || catData.items || []);
        const excludeClean = String(exclude).toLowerCase().trim();

        items = raw
          .filter((it) => {
            if (!it) return false;
            const itSlug = String(it.slug || it.detailPath || "").toLowerCase();
            return !excludeClean || !itSlug.includes(excludeClean);
          })
          .slice(0, limit)
          .map((it) => ({
            name: it.name || it.title || "Title",
            poster_url: it.poster_url || it.poster || it.cover?.url || "",
            slug: String(it.slug || it.detailPath || "").replace(/^\/?detail\//, "").replace(/^\/+/, ""),
            badge: it.badge || it.corner || null,
            year: it.year || it.releaseDate || null,
            rating: it.rating || it.imdbRatingValue || null,
            subject_id: it.subject_id || it.id || null,
            genre: it.genre || null,
          }));
      }
    } catch {
      // Catalog fetch failed
    }

    return NextResponse.json({
      type,
      count: items.length,
      recommendations: items,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
