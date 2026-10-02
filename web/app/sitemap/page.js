import { getSiteUrl } from "../../lib/config";
import {
  getHome,
  getMovies,
  getTvSeries,
  getAnimation,
  getRanking,
} from "../../lib/api";
import SitemapClient from "./SitemapClient";

export const revalidate = 3600; // Hourly ISR refresh

export async function generateMetadata() {
  const siteUrl = getSiteUrl();
  return {
    title: "Sitemap & Content Directory — Free Movies & TV Series",
    description:
      "Explore the comprehensive directory of free movies, TV series, Hindi dubbed titles, Hollywood and Bollywood releases on Movies Hunder (offstream.co).",
    alternates: {
      canonical: `${siteUrl}/sitemap`,
    },
    openGraph: {
      title: "Sitemap & Content Directory · Movies Hunder",
      description:
        "Explore the comprehensive directory of free movies, TV series, Hindi dubbed titles, Hollywood and Bollywood releases on Movies Hunder.",
      url: `${siteUrl}/sitemap`,
      siteName: "Movies Hunder",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Sitemap & Content Directory · Movies Hunder",
      description:
        "Comprehensive index of free movies, TV shows, and entertainment on Movies Hunder (offstream.co).",
    },
  };
}

export default async function SitemapPage() {
  const siteUrl = getSiteUrl();

  const categories = [
    {
      title: "Home Catalog",
      path: "/",
      description: "Trending movies, popular series, anime spotlight, and featured recommendations.",
      priority: "1.0",
      changeFreq: "Daily",
    },
    {
      title: "Movies Directory",
      path: "/movies",
      description: "Extensive collection of cinema blockbusters, Hindi dubbed releases, classics, and indie films.",
      priority: "0.95",
      changeFreq: "Daily",
    },
    {
      title: "TV Series Hub",
      path: "/tv-series",
      description: "Full episodic seasons, trending television series, and multi-season dramas.",
      priority: "0.95",
      changeFreq: "Daily",
    },
    {
      title: "Anime & Animation",
      path: "/animation",
      description: "Top anime releases, animated feature films, Japanese OVAs, and animated series.",
      priority: "0.9",
      changeFreq: "Daily",
    },
    {
      title: "Top Rankings",
      path: "/ranking",
      description: "Highest-rated and most-watched titles ranked across cinema, series, and anime.",
      priority: "0.85",
      changeFreq: "Daily",
    },
    {
      title: "Songs & Audio Catalog",
      path: "/songs",
      description: "Free streaming music, soundtrack collections, and artist discovery powered by Audius.",
      priority: "0.85",
      changeFreq: "Daily",
    },
    {
      title: "Live Search & Discovery",
      path: "/search",
      description: "Instant title search with smart suggestion indexing across the full catalog.",
      priority: "0.7",
      changeFreq: "Weekly",
    },
  ];

  const genres = [
    { name: "Action", slug: "action", path: "/search?q=Action" },
    { name: "Drama", slug: "drama", path: "/search?q=Drama" },
    { name: "Comedy", slug: "comedy", path: "/search?q=Comedy" },
    { name: "Sci-Fi & Fantasy", slug: "scifi", path: "/search?q=Sci-Fi" },
    { name: "Animation & Anime", slug: "animation", path: "/animation" },
    { name: "Thriller & Crime", slug: "thriller", path: "/search?q=Thriller" },
    { name: "Romance", slug: "romance", path: "/search?q=Romance" },
    { name: "Horror", slug: "horror", path: "/search?q=Horror" },
    { name: "Hindi Dubbed", slug: "hindi", path: "/search?q=Hindi" },
    { name: "Adventure", slug: "adventure", path: "/search?q=Adventure" },
    { name: "Mystery", slug: "mystery", path: "/search?q=Mystery" },
    { name: "Documentary", slug: "documentary", path: "/search?q=Documentary" },
  ];

  const legal = [
    {
      title: "Terms of Service",
      path: "/terms",
      description: "Terms governing use of MovieHunter website and mobile applications.",
      priority: "0.4",
      changeFreq: "Monthly",
    },
    {
      title: "Privacy Policy",
      path: "/privacy",
      description: "Data handling, device permissions, and user privacy protection commitments.",
      priority: "0.4",
      changeFreq: "Monthly",
    },
    {
      title: "Help & Support",
      path: "/support",
      description: "Frequently asked questions, troubleshooting guides, and customer contact.",
      priority: "0.5",
      changeFreq: "Monthly",
    },
  ];

  const userPages = [
    {
      title: "User Profiles",
      path: "/profiles",
      description: "Manage multiple viewing profiles for personalized recommendations.",
    },
    {
      title: "Watch History",
      path: "/history",
      description: "Review recently played titles and resume playback anytime.",
    },
    {
      title: "Account Settings",
      path: "/settings",
      description: "Configure preferences, player options, audio, and device sync.",
    },
  ];

  // Dynamically load top titles for rich directory indexing
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
    const results = await Promise.allSettled([
      getHome(),
      getMovies(),
      getTvSeries(),
      getAnimation(),
      getRanking(),
    ]);

    if (results[0].status === "fulfilled" && results[0].value) {
      const data = results[0].value;
      if (data.sections) addSections(data.sections);
      if (data.movies) addItems(data.movies, "Home");
    }
    if (results[1].status === "fulfilled" && results[1].value) {
      const data = results[1].value;
      if (data.sections) addSections(data.sections);
      if (data.movies) addItems(data.movies, "Movies");
    }
    if (results[2].status === "fulfilled" && results[2].value) {
      const data = results[2].value;
      if (data.sections) addSections(data.sections);
      if (data.movies) addItems(data.movies, "TV Series");
    }
    if (results[3].status === "fulfilled" && results[3].value) {
      const data = results[3].value;
      if (data.sections) addSections(data.sections);
      if (data.movies) addItems(data.movies, "Animation");
    }
    if (results[4].status === "fulfilled" && results[4].value) {
      const data = results[4].value;
      if (data.ranking) addItems(data.ranking, "Top Ranked");
      if (data.items) addItems(data.items, "Top Ranked");
    }
  } catch (err) {
    console.error("[Sitemap Page] Failed to fetch some catalog items", err?.message);
  }

  const topTitles = Array.from(titlesMap.values());

  // Schema.org Structured Data
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${siteUrl}/sitemap#webpage`,
        url: `${siteUrl}/sitemap`,
        name: "MovieHunter Directory & Sitemap",
        description:
          "Comprehensive architectural index of all media categories, streaming hubs, and indexed titles on MovieHunter.",
        isPartOf: {
          "@type": "WebSite",
          "@id": `${siteUrl}/#website`,
          name: "MovieHunter",
          url: `${siteUrl}`,
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${siteUrl}/sitemap#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${siteUrl}`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Sitemap",
            item: `${siteUrl}/sitemap`,
          },
        ],
      },
      {
        "@type": "ItemList",
        "@id": `${siteUrl}/sitemap#navigation`,
        name: "Main Site Sections",
        itemListElement: categories.map((cat, idx) => ({
          "@type": "SiteNavigationElement",
          position: idx + 1,
          name: cat.title,
          description: cat.description,
          url: `${siteUrl}${cat.path}`,
        })),
      },
    ],
  };

  return (
    <main className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SitemapClient
        categories={categories}
        genres={genres}
        topTitles={topTitles}
        legal={legal}
        userPages={userPages}
        siteUrl={siteUrl}
      />
    </main>
  );
}
