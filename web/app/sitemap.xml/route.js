import { getSiteUrl } from "../../lib/config";
import {
  getHome,
  getMovies,
  getTvSeries,
  getAnimation,
  getRanking,
} from "../../lib/api";
import { DEFAULT_TITLES } from "../../lib/defaultSitemapData";

// Cache sitemap and revalidate every hour for instant responses
export const revalidate = 3600;

function escapeXml(unsafe) {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const siteUrl = getSiteUrl();
  const nowIso = new Date().toISOString();

  // Static routes
  const staticRoutes = [
    { loc: `${siteUrl}`, lastmod: nowIso, changefreq: "daily", priority: "1.0" },
    { loc: `${siteUrl}/movies`, lastmod: nowIso, changefreq: "daily", priority: "0.95" },
    { loc: `${siteUrl}/tv-series`, lastmod: nowIso, changefreq: "daily", priority: "0.95" },
    { loc: `${siteUrl}/animation`, lastmod: nowIso, changefreq: "daily", priority: "0.9" },
    { loc: `${siteUrl}/ranking`, lastmod: nowIso, changefreq: "daily", priority: "0.85" },
    { loc: `${siteUrl}/songs`, lastmod: nowIso, changefreq: "daily", priority: "0.85" },
    { loc: `${siteUrl}/search`, lastmod: nowIso, changefreq: "weekly", priority: "0.7" },
    { loc: `${siteUrl}/sitemap`, lastmod: nowIso, changefreq: "daily", priority: "0.75" },
    { loc: `${siteUrl}/support`, lastmod: nowIso, changefreq: "monthly", priority: "0.5" },
    { loc: `${siteUrl}/terms`, lastmod: nowIso, changefreq: "monthly", priority: "0.4" },
    { loc: `${siteUrl}/privacy`, lastmod: nowIso, changefreq: "monthly", priority: "0.4" },
  ];

  // Dynamic catalog titles, pre-seeded with default items for guaranteed instant responses
  const titlesMap = new Map();

  for (const item of DEFAULT_TITLES) {
    if (item?.slug) {
      titlesMap.set(item.slug, {
        loc: `${siteUrl}/title/${encodeURIComponent(item.slug)}`,
        lastmod: nowIso,
        changefreq: "weekly",
        priority: "0.8",
      });
    }
  }

  const addItems = (items) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || !item.slug) continue;
      const slug = String(item.slug).trim();
      if (!slug || titlesMap.has(slug)) continue;

      const dateStr = item.updated_at || item.created_at;
      let parsedDate = nowIso;
      if (dateStr) {
        try {
          parsedDate = new Date(dateStr).toISOString();
        } catch {
          parsedDate = nowIso;
        }
      }

      titlesMap.set(slug, {
        loc: `${siteUrl}/title/${encodeURIComponent(slug)}`,
        lastmod: parsedDate,
        changefreq: "weekly",
        priority: "0.8",
      });
    }
  };

  const addSections = (sections) => {
    if (!Array.isArray(sections)) return;
    for (const sec of sections) {
      if (Array.isArray(sec?.movies)) addItems(sec.movies);
      if (Array.isArray(sec?.items)) addItems(sec.items);
    }
  };

  try {
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve("timeout"), 3500)
    );

    const fetchPromise = Promise.allSettled([
      getHome(),
      getMovies(),
      getTvSeries(),
      getAnimation(),
      getRanking(),
    ]);

    const winner = await Promise.race([fetchPromise, timeoutPromise]);

    if (winner !== "timeout" && Array.isArray(winner)) {
      for (const res of winner) {
        if (res.status !== "fulfilled" || !res.value) continue;
        const data = res.value;
        if (data.sections) addSections(data.sections);
        if (data.movies) addItems(data.movies);
        if (data.items) addItems(data.items);
        if (data.ranking) addItems(data.ranking);
      }
    }
  } catch (err) {
    console.error("[Sitemap XML Route] Error fetching dynamic catalog:", err?.message);
  }

  const allRoutes = [...staticRoutes, ...titlesMap.values()];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allRoutes
  .map(
    (r) => `  <url>
    <loc>${escapeXml(r.loc)}</loc>
    <lastmod>${r.lastmod}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
