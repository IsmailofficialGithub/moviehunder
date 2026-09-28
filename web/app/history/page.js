"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import { syncGet } from "../../lib/auth";
import styles from "./history.module.css";

function formatTime(seconds) {
  if (!seconds || seconds < 1) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function progressPct(position, duration) {
  if (!duration || duration < 1) return 0;
  return Math.min(100, Math.round((position / duration) * 100));
}

function episodeLabel(se, ep) {
  if (!se && !ep) return null;
  const s = Number(se);
  const e = Number(ep);
  if (s === 0 && e === 0) return null;
  if (s > 0 && e > 0) return `S${s} E${e}`;
  if (e > 0) return `Ep ${e}`;
  return null;
}

function buildPlayUrl(item) {
  if (!item.detailPath && !item.subjectId) return null;
  const p = new URLSearchParams();
  if (item.subjectId) p.set("subjectId", item.subjectId);
  if (item.detailPath) p.set("detail_path", item.detailPath);
  if (item.se != null) p.set("se", String(item.se));
  if (item.ep != null) p.set("ep", String(item.ep));
  if (item.title) p.set("title", item.title);
  if (item.position != null && item.position > 0) {
    p.set("t", String(Math.floor(item.position)));
  }
  return `/play?${p.toString()}`;
}

function getItemCategory(item) {
  const path = (item.detailPath || "").toLowerCase();
  const title = (item.title || "").toLowerCase();
  const sub = (item.subjectId || "").toLowerCase();
  const cat = (item.category || "").toLowerCase();

  if (
    cat.includes("short") ||
    path.includes("short") ||
    title.includes("short") ||
    sub.includes("short")
  ) {
    return "Short TV";
  }
  if (
    cat.includes("movie") ||
    path.includes("movie") ||
    (!item.se && !item.ep && !path.includes("series") && !path.includes("tv"))
  ) {
    return "Movies";
  }
  if (
    cat.includes("anime") ||
    cat.includes("animation") ||
    path.includes("anime")
  ) {
    return "Anime";
  }
  if (
    item.se ||
    item.ep ||
    cat.includes("tv") ||
    cat.includes("series") ||
    path.includes("series") ||
    path.includes("tv")
  ) {
    return "TV Series";
  }
  return "Hot";
}

function readLocalHistory() {
  if (typeof window === "undefined") return [];
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("history_") || key.startsWith("history_meta_")) continue;
    const rest = key.slice("history_".length);
    const parts = rest.split("_");
    if (parts.length < 3) continue;
    const ep = parts.pop();
    const se = parts.pop();
    const subjectId = parts.join("_");
    const position = Number(localStorage.getItem(key)) || 0;
    if (position < 2) continue;

    let title = null;
    let poster = null;
    let detailPath = null;
    let duration = 0;

    try {
      const metaRaw = localStorage.getItem(`history_meta_${subjectId}`);
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        title = meta.title || null;
        poster = meta.poster || null;
        detailPath = meta.detailPath || null;
        duration = meta.duration || 0;
      }
    } catch {}

    items.push({
      subjectId,
      se,
      ep,
      position,
      duration,
      title,
      poster,
      detailPath,
      updatedAt: Date.now() - i * 1000,
    });
  }
  return items;
}

const CATEGORIES = [
  { id: "all", label: "All Watched" },
  { id: "Hot", label: "🔥 Hot" },
  { id: "Short TV", label: "📺 Short TV" },
  { id: "Movies", label: "🎬 Movies" },
  { id: "TV Series", label: "🍿 TV Series" },
  { id: "Anime", label: "⚡ Anime" },
];

export default function HistoryPage() {
  const { isSignedIn, loading: authLoading } = useAuth();
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (isSignedIn) {
          const data = await syncGet("/api/sync/watch-progress");
          const remote = (data.items || [])
            .filter((i) => i.position > 2)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          setItems(remote);
        } else {
          setItems(readLocalHistory());
        }
      } catch {
        setItems(readLocalHistory());
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) load();
  }, [isSignedIn, authLoading]);

  function clearHistory() {
    if (!confirm("Clear all watch history from this device?")) return;
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("history_")) toRemove.push(key);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
    if (!isSignedIn) setItems([]);
  }

  const recentItem = items && items.length > 0 ? items[0] : null;

  const filteredItems =
    items && activeTab !== "all"
      ? items.filter((i) => getItemCategory(i) === activeTab)
      : items;

  return (
    <main className={`page ${styles.page}`}>
      <header className={styles.head}>
        <div>
          <h1>Watch History</h1>
          <p className={styles.sub}>
            {isSignedIn
              ? "Synced across your account — pick up where you left off."
              : "Stored locally on this device. Sign in to sync across devices."}
          </p>
        </div>
        {items && items.length > 0 && (
          <button className={styles.clearBtn} onClick={clearHistory}>
            Clear History
          </button>
        )}
      </header>

      {loading || authLoading ? (
        <div className={styles.empty}>
          <div className="spinner" style={{ margin: "0 auto" }} />
        </div>
      ) : !items || items.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🎬</div>
          <p className={styles.emptyTitle}>Nothing watched yet</p>
          <p className={styles.emptyHint}>
            Start watching a movie, series, or short TV show to see it here.
          </p>
        </div>
      ) : (
        <>
          {/* Spotlight Hero: First / Most Recent Watch */}
          {recentItem && (
            <div className={styles.heroCard}>
              {recentItem.poster && (
                <div
                  className={styles.heroBackdrop}
                  style={{ backgroundImage: `url(${recentItem.poster})` }}
                />
              )}
              <div className={styles.heroOverlay} />
              <div className={styles.heroBody}>
                <div className={styles.heroPosterWrap}>
                  {recentItem.poster ? (
                    <img
                      src={recentItem.poster}
                      alt={recentItem.title || "Recent watch"}
                      className={styles.heroPoster}
                    />
                  ) : (
                    <div className={styles.heroPosterFallback}>🎬</div>
                  )}
                </div>
                <div className={styles.heroInfo}>
                  <div className={styles.heroBadge}>
                    ⚡ Recently Watched
                  </div>
                  <h2 className={styles.heroTitle}>
                    {recentItem.title || recentItem.subjectId || "Continue Watching"}
                  </h2>
                  <div className={styles.heroMeta}>
                    {episodeLabel(recentItem.se, recentItem.ep) && (
                      <span>{episodeLabel(recentItem.se, recentItem.ep)}</span>
                    )}
                    <span>{formatTime(recentItem.position)} watched</span>
                    {recentItem.duration > 0 && (
                      <span>{progressPct(recentItem.position, recentItem.duration)}% complete</span>
                    )}
                  </div>
                  {recentItem.duration > 0 && (
                    <div className={styles.heroBarWrap}>
                      <div
                        className={styles.heroBar}
                        style={{
                          width: `${progressPct(
                            recentItem.position,
                            recentItem.duration
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                  <div className={styles.heroActions}>
                    <Link
                      href={buildPlayUrl(recentItem) || "#"}
                      className={styles.heroPlayBtn}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Resume Watching
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Category Filters Bar */}
          <div className={styles.tabs}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`${styles.tab} ${
                  activeTab === cat.id ? styles.tabActive : ""
                }`}
                onClick={() => setActiveTab(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Catalog Grid showing ALL Watched or Filtered Items */}
          <div>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>
                {activeTab === "all"
                  ? "🍿 All Watched History"
                  : CATEGORIES.find((c) => c.id === activeTab)?.label || "Filtered Items"}
                <span className={styles.sectionCount}>
                  {filteredItems.length} {filteredItems.length === 1 ? "title" : "titles"}
                </span>
              </h3>
            </div>
            <div className={styles.grid}>
              {filteredItems.map((item, idx) => (
                <HistoryCard key={item.key || `${item.subjectId}_${item.se}_${item.ep}_${idx}`} item={item} />
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function HistoryCard({ item }) {
  const pct = progressPct(item.position, item.duration);
  const epLabel = episodeLabel(item.se, item.ep);
  const playUrl = buildPlayUrl(item);
  const displayTitle = item.title || item.subjectId || "Unknown title";
  const categoryTag = getItemCategory(item);

  return (
    <Link href={playUrl || "#"} className={styles.card}>
      <div className={styles.cardPosterWrap}>
        {item.poster ? (
          <img
            src={item.poster}
            alt={displayTitle}
            className={styles.cardPoster}
            loading="lazy"
          />
        ) : (
          <div className={styles.cardPosterFallback}>🎬</div>
        )}
        <div className={styles.cardBadge}>
          {epLabel || categoryTag}
        </div>
        <div className={styles.cardPlayOverlay}>
          <div className={styles.cardPlayIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        {item.duration > 0 && (
          <div className={styles.cardBarWrap}>
            <div className={styles.cardBar} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className={styles.cardBody}>
        <p className={styles.cardTitle}>{displayTitle}</p>
        <p className={styles.cardMeta}>
          {formatTime(item.position)} {pct > 0 ? `· ${pct}%` : ""}
        </p>
      </div>
    </Link>
  );
}
