import {
  getHome,
  getMovies,
  getTvSeries,
  getAnimation,
  getRanking,
} from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const titlesMap = new Map();

  const addItems = (items, category = "") => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || !item.slug) continue;
      const slug = String(item.slug).trim();
      if (!slug || titlesMap.has(slug)) continue;

      titlesMap.set(slug, {
        slug,
        name: item.name || slug,
        year: item.year || null,
        rating: item.rating || null,
        badge: item.badge || null,
        category: category || item.type || "Catalog",
      });
    }
  };

  const addSections = (sections) => {
    if (!Array.isArray(sections)) return;
    for (const sec of sections) {
      const cat = sec?.title || "Featured";
      if (Array.isArray(sec?.movies)) addItems(sec.movies, cat);
      if (Array.isArray(sec?.items)) addItems(sec.items, cat);
    }
  };

  try {
    // 3.5s timeout safeguard so dynamic catalog never stalls
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
      if (winner[0]?.status === "fulfilled" && winner[0]?.value) {
        const data = winner[0].value;
        if (data.sections) addSections(data.sections);
        if (data.movies) addItems(data.movies, "Home");
      }
      if (winner[1]?.status === "fulfilled" && winner[1]?.value) {
        const data = winner[1].value;
        if (data.sections) addSections(data.sections);
        if (data.movies) addItems(data.movies, "Movies");
      }
      if (winner[2]?.status === "fulfilled" && winner[2]?.value) {
        const data = winner[2].value;
        if (data.sections) addSections(data.sections);
        if (data.movies) addItems(data.movies, "TV Series");
      }
      if (winner[3]?.status === "fulfilled" && winner[3]?.value) {
        const data = winner[3].value;
        if (data.sections) addSections(data.sections);
        if (data.movies) addItems(data.movies, "Animation");
      }
      if (winner[4]?.status === "fulfilled" && winner[4]?.value) {
        const data = winner[4].value;
        if (data.ranking) addItems(data.ranking, "Top Ranked");
        if (data.items) addItems(data.items, "Top Ranked");
      }
    }
  } catch (err) {
    console.error("[Sitemap Titles API] Error fetching dynamic catalog:", err?.message);
  }

  return Response.json(
    { titles: Array.from(titlesMap.values()) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
      },
    }
  );
}
