"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Film,
  Tv,
  Sparkles,
  Music,
  Trophy,
  Search,
  ShieldCheck,
  FileText,
  HelpCircle,
  ExternalLink,
  FolderTree,
  ArrowRight,
  Star,
  Compass,
  User,
  History,
  Settings,
} from "lucide-react";
import styles from "./sitemap.module.css";

export default function SitemapClient({
  categories = [],
  genres = [],
  topTitles = [],
  legal = [],
  userPages = [],
  siteUrl = "",
}) {
  const [filterQuery, setFilterQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const q = filterQuery.trim().toLowerCase();

  // Filter categories
  const filteredCategories = useMemo(() => {
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.path.toLowerCase().includes(q)
    );
  }, [categories, q]);

  // Filter genres
  const filteredGenres = useMemo(() => {
    if (!q) return genres;
    return genres.filter((g) => g.name.toLowerCase().includes(q));
  }, [genres, q]);

  // Filter titles
  const filteredTitles = useMemo(() => {
    if (!q) return topTitles;
    return topTitles.filter((t) =>
      (t.name || "").toLowerCase().includes(q) ||
      String(t.year || "").includes(q) ||
      (t.category || "").toLowerCase().includes(q)
    );
  }, [topTitles, q]);

  // Filter legal
  const filteredLegal = useMemo(() => {
    if (!q) return legal;
    return legal.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q)
    );
  }, [legal, q]);

  // Filter user pages
  const filteredUserPages = useMemo(() => {
    if (!q) return userPages;
    return userPages.filter((u) =>
      u.title.toLowerCase().includes(q) ||
      u.description.toLowerCase().includes(q)
    );
  }, [userPages, q]);

  const totalResults =
    filteredCategories.length +
    filteredGenres.length +
    filteredTitles.length +
    filteredLegal.length +
    filteredUserPages.length;

  return (
    <div className={styles.container}>
      {/* Hero Header */}
      <header className={styles.hero}>
        <div className={styles.badge}>
          <FolderTree size={14} />
          <span>SEO Content Directory</span>
        </div>
        <h1 className={styles.title}>MovieHunter Directory & Sitemap</h1>
        <p className={styles.subtitle}>
          Comprehensive architectural index of all media categories, streaming hubs,
          genre collections, legal policies, and indexed titles for users and search engine crawlers.
        </p>

        <div className={styles.metaStats}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>{categories.length}</span>
            <span className={styles.statLabel}>Main Hubs</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>{genres.length}</span>
            <span className={styles.statLabel}>Curated Genres</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>{topTitles.length}+</span>
            <span className={styles.statLabel}>Indexed Titles</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>100%</span>
            <span className={styles.statLabel}>Crawlable</span>
          </div>
        </div>
      </header>

      {/* Search & Navigation Controls */}
      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>
            <Search size={18} />
          </span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search pages, genres, or movie titles..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
        </div>

        <nav className={styles.filterTabs} aria-label="Sitemap Section Filter">
          <button
            type="button"
            className={`${styles.filterBtn} ${activeTab === "all" ? styles.filterBtnActive : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All Sections
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${activeTab === "hubs" ? styles.filterBtnActive : ""}`}
            onClick={() => setActiveTab("hubs")}
          >
            Hubs ({filteredCategories.length})
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${activeTab === "genres" ? styles.filterBtnActive : ""}`}
            onClick={() => setActiveTab("genres")}
          >
            Genres ({filteredGenres.length})
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${activeTab === "titles" ? styles.filterBtnActive : ""}`}
            onClick={() => setActiveTab("titles")}
          >
            Catalog Titles ({filteredTitles.length})
          </button>
          <button
            type="button"
            className={`${styles.filterBtn} ${activeTab === "legal" ? styles.filterBtnActive : ""}`}
            onClick={() => setActiveTab("legal")}
          >
            Legal & Support
          </button>
        </nav>
      </div>

      {totalResults === 0 ? (
        <div className={styles.noResults}>
          <p>No matching sections or titles found for &quot;{filterQuery}&quot;.</p>
        </div>
      ) : null}

      {/* 1. Core Hubs */}
      {(activeTab === "all" || activeTab === "hubs") && filteredCategories.length > 0 && (
        <section className={styles.section} id="hubs">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <Compass size={20} />
              <span>Core Hubs & Catalog Directories</span>
            </h2>
            <span className={styles.sectionCount}>{filteredCategories.length} routes</span>
          </div>

          <div className={styles.linkGrid}>
            {filteredCategories.map((item) => (
              <Link key={item.path} href={item.path} className={styles.card}>
                <div>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>{item.title}</h3>
                    <ArrowRight size={16} className={styles.cardArrow} />
                  </div>
                  <p className={styles.cardDesc}>{item.description}</p>
                </div>
                <div className={styles.cardMeta}>
                  <span className={styles.priorityBadge}>Priority: {item.priority}</span>
                  <span>{item.changeFreq}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 2. Genre Discovery */}
      {(activeTab === "all" || activeTab === "genres") && filteredGenres.length > 0 && (
        <section className={styles.section} id="genres">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <Sparkles size={20} />
              <span>Genre Collections & Discovery</span>
            </h2>
            <span className={styles.sectionCount}>{filteredGenres.length} collections</span>
          </div>

          <div className={styles.genreGrid}>
            {filteredGenres.map((genre) => (
              <Link key={genre.slug} href={genre.path} className={styles.genreCard}>
                <span>{genre.name}</span>
                <ArrowRight size={14} className={styles.cardArrow} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 3. Catalog Titles */}
      {(activeTab === "all" || activeTab === "titles") && filteredTitles.length > 0 && (
        <section className={styles.section} id="titles">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <Film size={20} />
              <span>Featured Catalog Index</span>
            </h2>
            <span className={styles.sectionCount}>{filteredTitles.length} items</span>
          </div>

          <div className={styles.titlesGrid}>
            {filteredTitles.map((title) => (
              <Link
                key={title.slug}
                href={`/title/${encodeURIComponent(title.slug)}`}
                className={styles.titleItem}
              >
                <div className={styles.titleInfo}>
                  <div className={styles.titleName}>{title.name}</div>
                  <div className={styles.titleDetails}>
                    {title.year ? <span>{title.year}</span> : null}
                    {title.category ? <span>• {title.category}</span> : null}
                    {title.badge ? <span>• {title.badge}</span> : null}
                  </div>
                </div>
                {title.rating ? (
                  <span className={styles.ratingBadge}>★ {title.rating}</span>
                ) : (
                  <ArrowRight size={14} className={styles.cardArrow} />
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 4. Legal & Trust */}
      {(activeTab === "all" || activeTab === "legal") && filteredLegal.length > 0 && (
        <section className={styles.section} id="legal">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <ShieldCheck size={20} />
              <span>Legal, Compliance & Support</span>
            </h2>
            <span className={styles.sectionCount}>{filteredLegal.length} pages</span>
          </div>

          <div className={styles.linkGrid}>
            {filteredLegal.map((item) => (
              <Link key={item.path} href={item.path} className={styles.card}>
                <div>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>{item.title}</h3>
                    <ArrowRight size={16} className={styles.cardArrow} />
                  </div>
                  <p className={styles.cardDesc}>{item.description}</p>
                </div>
                <div className={styles.cardMeta}>
                  <span className={styles.priorityBadge}>Priority: {item.priority}</span>
                  <span>{item.changeFreq}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 5. User & Account Pages */}
      {(activeTab === "all" || activeTab === "legal") && filteredUserPages.length > 0 && (
        <section className={styles.section} id="user">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <User size={20} />
              <span>Account & Personalization</span>
            </h2>
            <span className={styles.sectionCount}>{filteredUserPages.length} routes</span>
          </div>

          <div className={styles.linkGrid}>
            {filteredUserPages.map((item) => (
              <Link key={item.path} href={item.path} className={styles.card}>
                <div>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>{item.title}</h3>
                    <ArrowRight size={16} className={styles.cardArrow} />
                  </div>
                  <p className={styles.cardDesc}>{item.description}</p>
                </div>
                <div className={styles.cardMeta}>
                  <span className={styles.priorityBadge}>Private / User Session</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 6. Machine Crawlers & Technical Hub */}
      <section className={styles.section} id="technical">
        <div className={styles.techBox}>
          <div className={styles.techBoxHeader}>
            <div>
              <h3 className={styles.techBoxTitle}>Search Engine & Crawler Resources</h3>
              <p className={styles.cardDesc}>
                Direct XML schema files for automated indexers (Googlebot, Bingbot, Yandex, DuckDuckGo).
              </p>
            </div>
            <div className={styles.techBoxLinks}>
              <a
                href="/sitemap.xml"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.techLink}
              >
                <span>/sitemap.xml</span>
                <ExternalLink size={14} />
              </a>
              <a
                href="/robots.txt"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.techLink}
              >
                <span>/robots.txt</span>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
