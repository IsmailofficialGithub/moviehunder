import Link from "next/link";
import { notFound } from "next/navigation";
import DetailClient from "../../../components/DetailClient";
import { getDetail, getEpisodes } from "../../../lib/api";
import { getSiteUrl } from "../../../lib/config";
import styles from "./title.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  const siteUrl = getSiteUrl();

  try {
    const detail = await getDetail(decoded);
    const name =
      detail?.title || detail?.name || detail?.subject_title || decoded;
    const isSeries = Boolean(
      detail?.seasons?.length ||
      detail?.episode_count ||
      detail?.kind === "tv" ||
      detail?.kind === "series"
    );
    const desc =
      detail?.description ||
      detail?.overview ||
      detail?.intro ||
      `Watch ${name} online free in HD on Movies Hunder (offstream.co). Enjoy Hollywood, Bollywood, and Hindi dubbed cinema ads-free.`;
    const poster =
      detail?.cover ||
      detail?.poster ||
      detail?.image ||
      `${siteUrl}/brand/logo-full.png`;
    const canonical = `${siteUrl}/title/${encodeURIComponent(decoded)}`;

    return {
      title: `${name} - Watch Free Online | Offstream`,
      description: desc.slice(0, 160),
      keywords: [
        name,
        `watch ${name} free`,
        `stream ${name} online`,
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
      ],
      alternates: {
        canonical,
      },
      openGraph: {
        title: `${name} · Watch Free on Offstream`,
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
        title: `${name} · Watch Free on Movies Hunder`,
        description: desc.slice(0, 180),
        images: [poster],
      },
    };
  } catch {
    const fallbackName = decoded
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
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

    const name =
      detail?.title || detail?.name || detail?.subject_title || slug;
    const isSeries = Boolean(
      detail?.seasons?.length ||
      episodes?.length ||
      detail?.kind === "tv" ||
      detail?.kind === "series"
    );
    const poster =
      detail?.cover ||
      detail?.poster ||
      detail?.image ||
      `${siteUrl}/brand/logo-full.png`;
    const pageUrl = `${siteUrl}/title/${encodeURIComponent(slug)}`;
    const categoryUrl = isSeries ? `${siteUrl}/tv-series` : `${siteUrl}/movies`;
    const categoryName = isSeries ? "TV Series" : "Movies";

    const schemaData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": isSeries ? "TVSeries" : "Movie",
          "@id": `${pageUrl}#media`,
          name: name,
          description:
            detail?.description ||
            detail?.overview ||
            `Watch ${name} free online in HD on Offstream.`,
          image: poster,
          url: pageUrl,
          dateCreated: detail?.release_date || detail?.year || undefined,
          inLanguage: detail?.language || "en",
          provider: {
            "@type": "Organization",
            name: "Offstream",
            alternateName: "Movies Hunder",
            url: siteUrl,
          },
        },
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
        <Link className={styles.back} href="/">
          ← Back
        </Link>
        <DetailClient slug={slug} detail={detail} episodes={episodes} />
      </main>
    );
  } catch {
    notFound();
  }
}
