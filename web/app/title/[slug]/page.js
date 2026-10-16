import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import DetailClient from "../../../components/DetailClient";
import { getDetail, getEpisodes } from "../../../lib/api";
import { getSiteUrl } from "../../../lib/config";
import styles from "./title.module.css";

export const revalidate = 86400; // Cache pages with 24-hour ISR for instant bot responses and fast indexing

function cleanSlugName(slug) {
  return String(slug || "")
    .replace(/-[A-Za-z0-9]{8,}$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const siteUrl = getSiteUrl();

  try {
    const detail = await getDetail(decoded);
    const meta = detail?.metadata || detail || {};
    const fallbackName = cleanSlugName(decoded);
    const name = meta?.title || meta?.name || detail?.title || fallbackName;
    const releaseYear = meta?.release_date
      ? String(meta.release_date).slice(0, 4)
      : meta?.year
      ? String(meta.year)
      : "";
    const isSeries = Boolean(
      meta?.seasons?.length ||
      detail?.seasons?.length ||
      detail?.episode_count ||
      meta?.kind === "tv" ||
      meta?.kind === "series" ||
      detail?.kind === "tv" ||
      detail?.kind === "series" ||
      meta?.subject_type === 2 ||
      detail?.subject_type === 2
    );
    const desc =
      meta?.description ||
      meta?.overview ||
      meta?.intro ||
      detail?.description ||
      detail?.overview ||
      `Watch ${name}${releaseYear ? ` (${releaseYear})` : ""} online free in HD on Offstream. Stream Hollywood, Bollywood, and TV series ads-free.`;
    const poster =
      meta?.poster ||
      meta?.cover ||
      detail?.cover ||
      detail?.poster ||
      detail?.image ||
      `${siteUrl}/brand/logo-full.png`;
    const canonical = `${siteUrl}/title/${encodeURIComponent(decoded)}`;
    const pageTitle = `${name}${releaseYear ? ` (${releaseYear})` : ""} - Watch Free Online | Offstream`;

    return {
      title: pageTitle,
      description: desc.slice(0, 155),
      keywords: [
        name,
        `watch ${name} free`,
        `stream ${name} online`,
        releaseYear ? `${name} ${releaseYear}` : null,
        "Offstream",
        "Offstream movies",
        "Movies Hunder",
        "free movies",
        "ads free movies",
        "hindi dubbed",
        "hollywood",
        "bollywood",
        "series",
        "offstream.co",
      ].filter(Boolean),
      alternates: {
        canonical,
      },
      openGraph: {
        title: `${name}${releaseYear ? ` (${releaseYear})` : ""} · Watch Free on Offstream`,
        description: desc.slice(0, 200),
        url: canonical,
        siteName: "Offstream",
        type: isSeries ? "video.tv_show" : "video.movie",
        images: [
          {
            url: poster,
            alt: `${name} Poster - Offstream`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: `${name}${releaseYear ? ` (${releaseYear})` : ""} · Watch Free on Movies Hunder`,
        description: desc.slice(0, 180),
        images: [poster],
      },
    };
  } catch {
    const fallbackName = cleanSlugName(decoded);
    return {
      title: `${fallbackName} - Watch Free Online | Offstream`,
      description: `Watch ${fallbackName} online free in HD on Offstream. Stream Hollywood, Bollywood, and series ads-free.`,
      alternates: {
        canonical: `${siteUrl}/title/${encodeURIComponent(decoded)}`,
      },
    };
  }
}

export default async function TitlePage({ params }) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);
  const siteUrl = getSiteUrl();

  try {
    const [detail, episodes] = await Promise.all([
      getDetail(slug),
      getEpisodes(slug).catch(() => null),
    ]);

    if (!detail) {
      notFound();
    }

    const meta = detail?.metadata || detail || {};
    const fallbackName = cleanSlugName(slug);
    const name = meta?.title || meta?.name || detail?.title || fallbackName;
    const releaseYear = meta?.release_date
      ? String(meta.release_date).slice(0, 4)
      : meta?.year
      ? String(meta.year)
      : "";
    const seasons = episodes?.seasons || meta?.seasons || detail?.seasons || [];
    const isSeries = Boolean(
      seasons?.length ||
      episodes?.length ||
      meta?.kind === "tv" ||
      meta?.kind === "series" ||
      detail?.kind === "tv" ||
      detail?.kind === "series" ||
      meta?.subject_type === 2 ||
      detail?.subject_type === 2
    );
    const poster =
      meta?.poster ||
      meta?.cover ||
      detail?.cover ||
      detail?.poster ||
      detail?.image ||
      `${siteUrl}/brand/logo-full.png`;
    const pageUrl = `${siteUrl}/title/${encodeURIComponent(slug)}`;
    const categoryUrl = isSeries ? `${siteUrl}/tv-series` : `${siteUrl}/movies`;
    const categoryName = isSeries ? "TV Series" : "Movies";
    const desc =
      meta?.description ||
      meta?.overview ||
      detail?.description ||
      `Watch ${name}${releaseYear ? ` (${releaseYear})` : ""} free online in HD on Offstream.`;

    const mediaSchema = {
      "@type": isSeries ? "TVSeries" : "Movie",
      "@id": `${pageUrl}#media`,
      name: name,
      description: desc,
      image: poster,
      url: pageUrl,
      dateCreated: meta?.release_date || releaseYear || undefined,
      datePublished: meta?.release_date || releaseYear || undefined,
      inLanguage: meta?.country === "India" ? "hi" : "en",
      provider: {
        "@type": "Organization",
        name: "Offstream",
        alternateName: "Movies Hunder",
        url: siteUrl,
      },
    };

    const ratingVal = meta?.imdb_rating || meta?.rating;
    if (ratingVal && !isNaN(Number(ratingVal))) {
      mediaSchema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: String(ratingVal),
        bestRating: "10",
        worstRating: "1",
        ratingCount: "100",
      };
    }

    if (meta?.genre) {
      mediaSchema.genre = String(meta.genre)
        .split(/[,/|]/)
        .map((g) => g.trim())
        .filter(Boolean);
    }

    if (Array.isArray(meta?.top_cast) && meta.top_cast.length) {
      mediaSchema.actor = meta.top_cast
        .slice(0, 5)
        .map((p) => ({
          "@type": "Person",
          name: p?.name || p?.staffName || "",
        }))
        .filter((a) => a.name);
    }

    const schemaData = {
      "@context": "https://schema.org",
      "@graph": [
        mediaSchema,
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: siteUrl,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: categoryName,
              item: categoryUrl,
            },
            {
              "@type": "ListItem",
              position: 3,
              name: name,
              item: pageUrl,
            },
          ],
        },
      ],
    };

    return (
      <main className={`page ${styles.wrap}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
        />
        <Link className={styles.back} href="/" title="Back to Home">
          <ChevronLeft size={16} strokeWidth={2.4} />
          <span>Back</span>
        </Link>
        <DetailClient slug={slug} detail={detail} episodes={episodes} />
      </main>
    );
  } catch {
    notFound();
  }
}
