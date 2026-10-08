import { getSiteUrl } from "../../lib/config";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_GENRES,
  DEFAULT_LEGAL,
  DEFAULT_USER_PAGES,
  DEFAULT_TITLES,
} from "../../lib/defaultSitemapData";
import SitemapClient from "./SitemapClient";

export const revalidate = 3600; // Hourly ISR refresh

export async function generateMetadata() {
  const siteUrl = getSiteUrl();
  return {
    title: "Sitemap & Content Directory — Free Movies & TV Series",
    description:
      "Explore the comprehensive directory of free movies, TV series, Hindi dubbed titles, Hollywood and Bollywood releases on Offstream (offstream.co).",
    alternates: {
      canonical: `${siteUrl}/sitemap`,
    },
    openGraph: {
      title: "Sitemap & Content Directory · Offstream",
      description:
        "Explore the comprehensive directory of free movies, TV series, Hindi dubbed titles, Hollywood and Bollywood releases on Offstream.",
      url: `${siteUrl}/sitemap`,
      siteName: "Offstream",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Sitemap & Content Directory · Offstream",
      description:
        "Comprehensive index of free movies, TV shows, and entertainment on Offstream (offstream.co).",
    },
  };
}

export default function SitemapPage() {
  const siteUrl = getSiteUrl();

  // Schema.org Structured Data rendered immediately with zero network delay
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${siteUrl}/sitemap#webpage`,
        url: `${siteUrl}/sitemap`,
        name: "Offstream Directory & Sitemap",
        description:
          "Comprehensive architectural index of all media categories, streaming hubs, and indexed titles on Offstream (offstream.co).",
        isPartOf: {
          "@type": "WebSite",
          "@id": `${siteUrl}/#website`,
          name: "Offstream",
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
        itemListElement: DEFAULT_CATEGORIES.map((cat, idx) => ({
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
        categories={DEFAULT_CATEGORIES}
        genres={DEFAULT_GENRES}
        initialTitles={DEFAULT_TITLES}
        legal={DEFAULT_LEGAL}
        userPages={DEFAULT_USER_PAGES}
        siteUrl={siteUrl}
      />
    </main>
  );
}

