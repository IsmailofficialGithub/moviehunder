"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import { syncDelete, syncGet, syncPut } from "../../lib/auth";
import {
  applyRemoteWatch,
  clearLocalWatchHistory,
  clearWatchCache,
  getWatchCache,
  listLocalWatch,
  parseTimestamp,
  saveWatchCache,
  runFullSync,
} from "../../lib/sync";
import { syncGuestHistoryToServer } from "../../lib/guestHistory";
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

function formatTimeAgo(timestamp) {
  const ts = parseTimestamp(timestamp);
  if (!ts) return null;
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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
  let subjectId = item.subjectId || null;
  let detailPath = item.detailPath || null;
  if (!subjectId && item.key?.startsWith("t:")) {
    const parts = item.key.slice(2).split(":");
    subjectId = parts[0] || null;
  }
  if (!subjectId && detailPath) subjectId = detailPath;
  if (!detailPath && subjectId) detailPath = subjectId;
  if (!subjectId && !detailPath) return null;

  const p = new URLSearchParams();
  p.set("subjectId", subjectId);
  p.set("detail_path", detailPath);
  if (item.se != null) p.set("se", String(item.se));
  if (item.ep != null) p.set("ep", String(item.ep));
  if (item.title) p.set("title", item.title);
  if (item.poster) p.set("poster", item.poster);
  if (item.position != null && item.position > 0) {
    p.set("t", String(Math.floor(item.position)));
  }
  return `/play?${p.toString()}`;
}

function resolveItemTitle(item) {
  if (!item) return "Continue Watching";
  let title = item.title;
  if (title && !/^\d+$/.test(String(title).trim())) {
    return String(title).replace(/(?: \u00B7 S\d+E\d+)+$/, "");
  }
  if (typeof window !== "undefined" && item.subjectId) {
    try {
      const meta = JSON.parse(localStorage.getItem(`history_meta_${item.subjectId}`) || "{}");
      if (meta.title && !/^\d+$/.test(String(meta.title).trim())) {
        return String(meta.title).replace(/(?: \u00B7 S\d+E\d+)+$/, "");
      }
    } catch {}
  }
  if (item.detailPath && typeof item.detailPath === "string") {
    let slug = item.detailPath.replace(/^.*\/detail\//, "").replace(/^\/+/, "");
    slug = slug.replace(/-[A-Za-z0-9]{8,16}$/, "");
    if (slug && !/^\d+$/.test(slug)) {
      return slug
        .split("-")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }
  return "Continue Watching";
}

function resolveItemPoster(item) {
  if (!item) return null;
  if (item.poster) return item.poster;
  if (typeof window !== "undefined" && item.subjectId) {
    try {
      const meta = JSON.parse(localStorage.getItem(`history_meta_${item.subjectId}`) || "{}");
      if (meta.poster) return meta.poster;
    } catch {}
  }
  return null;
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

const CATEGORIES = [
  { id: "all", label: "All Watched" },
  { id: "Hot", label: "Hot" },
  { id: "Short TV", label: "Short TV" },
  { id: "Movies", label: "Movies" },
  { id: "TV Series", label: "TV Series" },
  { id: "Anime", label: "Anime" },
];

export default function HistoryPage() {
  const { user, isSignedIn, loading: authLoading } = useAuth();
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 24;
  const isClearingRef = useRef(false);

  useEffect(() => {
    async function load() {
      if (isClearingRef.current) return;

      // 1. Instant Cache Hit (0ms delay)
      const cached = getWatchCache(user?.id);
      if (cached && cached.length > 0) {
        setItems(cached);
        setLoading(false);
      }

      // 2. Background Revalidation (SWR)
      try {
        if (isSignedIn) {
          const data = await syncGet("/api/sync/watch-progress");
          if (isClearingRef.current) return;
          setLastSynced(new Date());
          const remoteItems = data.items || [];
          applyRemoteWatch(remoteItems);

          const localItems = listLocalWatch();
          const remoteMap = new Map();

          for (const item of remoteItems) {
            if (Number(item.position) <= 2) continue;
            const localMatch = localItems.find(
              (l) =>
                l.subjectId === item.subjectId &&
                String(l.se) === String(item.se) &&
                String(l.ep) === String(item.ep)
            ) || localItems.find((l) => l.subjectId === item.subjectId);

            const merged = {
              ...item,
              title: item.title || localMatch?.title || null,
              poster: item.poster || localMatch?.poster || null,
              detailPath: item.detailPath || localMatch?.detailPath || null,
              duration: item.duration || localMatch?.duration || 0,
              updatedAt: Math.max(
                parseTimestamp(item.updatedAt),
                parseTimestamp(localMatch?.updatedAt)
              ),
            };
            const mapKey =
              item.key ||
              `t:${item.subjectId}:s${item.se || "0"}:e${item.ep || "0"}`;
            remoteMap.set(mapKey, merged);
          }

          for (const loc of localItems) {
            const locKey =
              loc.key || `t:${loc.subjectId}:s${loc.se || "0"}:e${loc.ep || "0"}`;
            if (!remoteMap.has(locKey)) {
              remoteMap.set(locKey, loc);
            }
          }

          const sorted = Array.from(remoteMap.values()).sort(
            (a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt)
          );

          if (!isClearingRef.current) {
            saveWatchCache(user?.id, sorted);
            setItems(sorted);
          }
        } else {
          const loc = listLocalWatch();
          saveWatchCache(null, loc);
          setItems(loc);
        }
      } catch (err) {
        if (!cached || cached.length === 0) {
          const loc = listLocalWatch();
          setItems(loc);
        }
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      load();
      const onFocus = () => load();
      window.addEventListener("focus", onFocus);
      return () => {
        window.removeEventListener("focus", onFocus);
      };
    }
  }, [isSignedIn, authLoading, user?.id]);

  async function handleDeleteItem(itemToDelete) {
    if (!itemToDelete) return;
    const itemKey =
      itemToDelete.key ||
      `t:${itemToDelete.subjectId}:s${itemToDelete.se || "0"}:e${itemToDelete.ep || "0"}`;

    // 1. Optimistic UI and Cache removal
    const nextItems = (items || []).filter((i) => {
      const k = i.key || `t:${i.subjectId}:s${i.se || "0"}:e${i.ep || "0"}`;
      return k !== itemKey;
    });
    setItems(nextItems);
    saveWatchCache(user?.id, nextItems);

    // 2. Remove from localStorage
    const rawSe = itemToDelete.se;
    const rawEp = itemToDelete.ep;
    const se = (!rawSe || rawSe === "undefined" || rawSe === "null") ? "0" : rawSe;
    const ep = (!rawEp || rawEp === "undefined" || rawEp === "null") ? "0" : rawEp;
    
    localStorage.removeItem(`history_${itemToDelete.subjectId}_${se}_${ep}`);
    localStorage.removeItem(`history_time_${itemToDelete.subjectId}_${se}_${ep}`);
    
    // Also remove bad data keys to clean them up
    if (rawSe !== se || rawEp !== ep) {
      localStorage.removeItem(`history_${itemToDelete.subjectId}_${rawSe}_${rawEp}`);
      localStorage.removeItem(`history_time_${itemToDelete.subjectId}_${rawSe}_${rawEp}`);
    }

    let hasOtherEpisodes = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k?.startsWith(`history_${itemToDelete.subjectId}_`) &&
        !k.startsWith("history_meta_") &&
        !k.startsWith("history_time_")
      ) {
        hasOtherEpisodes = true;
        break;
      }
    }
    if (!hasOtherEpisodes) {
      localStorage.removeItem(`history_meta_${itemToDelete.subjectId}`);
    }

    // 3. Remove from server if signed in
    if (isSignedIn) {
      await syncPut("/api/sync/watch-progress", [
        {
          key: itemKey,
          subjectId: itemToDelete.subjectId,
          se,
          ep,
          position: -1,
          duration: -1,
          updatedAt: Date.now(),
        },
      ]).catch(() => {});
    }
  }

  async function executeClearAll() {
    setIsDeleting(true);
    isClearingRef.current = true;
    try {
      // 1. Clear user cache and local storage immediately
      clearWatchCache(user?.id);
      clearLocalWatchHistory();
      setItems([]);
      setShowClearConfirm(false);

      // 2. Delete all records from server
      if (isSignedIn) {
        await syncDelete("/api/sync/watch-progress");
      }
    } catch (err) {
      console.error("[clearHistory error]", err);
    } finally {
      setIsDeleting(false);
      setTimeout(() => {
        isClearingRef.current = false;
      }, 3000);
    }
  }

  async function handleSyncNow() {
    if (!isSignedIn) return;
    setIsSyncing(true);
    try {
      await syncGuestHistoryToServer().catch(() => {});
      await runFullSync().catch(() => {});
      
      setLastSynced(new Date());
      window.dispatchEvent(new Event("focus"));
    } catch (err) {
      console.error("Sync failed", err);
    } finally {
      setIsSyncing(false);
    }
  }

  const recentItem = items && items.length > 0 ? items[0] : null;

  const filteredItems =
    items && activeTab !== "all"
      ? items.filter((i) => getItemCategory(i) === activeTab)
      : items || [];

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  return (
    <main className={`page ${styles.page}`}>
      <header className={styles.head}>
        <div className={styles.headLeft}>
          <div className={styles.titleRow}>
            <h1>Watch History</h1>
            {items && items.length > 0 && (
              <span className={styles.totalBadge}>
                {items.length} {items.length === 1 ? "title" : "titles"}
              </span>
            )}
          </div>
          <div className={styles.syncStatus}>
            {isSignedIn ? (
              <div className={styles.syncOnlineWrap}>
                <span className={styles.syncOnline}>
                  <span className={styles.syncDotOnline} />
                  Synced with <strong>{user?.email || "Account"}</strong>
                </span>
                {lastSynced && (
                  <span className={styles.lastSynced}>
                    Last synced: {lastSynced.toLocaleTimeString()}
                  </span>
                )}
                <button 
                  onClick={handleSyncNow} 
                  className={styles.syncBtn}
                  disabled={isSyncing}
                >
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </button>
              </div>
            ) : (
              <span className={styles.syncLocal}>
                <Link href="/login" className={styles.syncLink}>
                  Sign in to backup your history
                </Link>
              </span>
            )}
          </div>
        </div>

        {items && items.length > 0 && !showClearConfirm && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => setShowClearConfirm(true)}
            disabled={isDeleting}
            title="Clear all watch history"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Clear All History
          </button>
        )}
      </header>

      {/* In-app Inline Confirmation Banner (prevents focus loss and race condition) */}
      {showClearConfirm && (
        <div className={styles.confirmBanner}>
          <div className={styles.confirmText}>
            <strong>Clear all watch history?</strong>
            <span>
              This will remove all progress across your devices and browser
              cache. This action cannot be undone.
            </span>
          </div>
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.confirmDeleteBtn}
              onClick={executeClearAll}
              disabled={isDeleting}
            >
              {isDeleting ? "Clearing…" : "Yes, Clear All"}
            </button>
            <button
              type="button"
              className={styles.confirmCancelBtn}
              onClick={() => setShowClearConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && (!items || items.length === 0) ? (
        <div className={styles.empty}>
          <div className="spinner" style={{ margin: "0 auto" }} />
          <p className={styles.emptyHint} style={{ marginTop: 16 }}>
            Loading watch history…
          </p>
        </div>
      ) : !items || items.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
              <line x1="7" y1="2" x2="7" y2="22"></line>
              <line x1="17" y1="2" x2="17" y2="22"></line>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <line x1="2" y1="7" x2="7" y2="7"></line>
              <line x1="2" y1="17" x2="7" y2="17"></line>
              <line x1="17" y1="17" x2="22" y2="17"></line>
              <line x1="17" y1="7" x2="22" y2="7"></line>
            </svg>
          </div>
          <p className={styles.emptyTitle}>No watch history yet</p>
          <p className={styles.emptyHint}>
            Start watching any movie, series, or short show and pick up right
            where you left off.
          </p>
          <Link href="/" className={styles.exploreBtn}>
            Explore Catalog
          </Link>
        </div>
      ) : (
        <>
          {/* Spotlight Hero: Most Recently Watched Title */}
          {recentItem && (() => {
            const heroPoster = resolveItemPoster(recentItem);
            const heroTitle = resolveItemTitle(recentItem);
            return (
              <section className={styles.heroCard} aria-label="Continue Watching">
                {heroPoster && (
                  <div
                    className={styles.heroBackdrop}
                    style={{ backgroundImage: `url(${heroPoster})` }}
                  />
                )}
                <div className={styles.heroOverlay} />
                <div className={styles.heroBody}>
                  <div className={styles.heroPosterWrap}>
                    {heroPoster ? (
                      <img
                        src={heroPoster}
                        alt={heroTitle}
                        className={styles.heroPoster}
                      />
                    ) : (
                      <div className={styles.heroPosterFallback}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                      </div>
                    )}
                    {progressPct(recentItem.position, recentItem.duration) > 0 && (
                      <div className={styles.heroPosterBar}>
                        <div
                          className={styles.heroPosterBarFill}
                          style={{
                            width: `${progressPct(
                              recentItem.position,
                              recentItem.duration
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className={styles.heroInfo}>
                    <div className={styles.heroTopRow}>
                      <div className={styles.heroBadge}>
                        Continue Watching
                      </div>
                      {formatTimeAgo(recentItem.updatedAt) && (
                        <span className={styles.heroTimeAgo}>
                          Watched {formatTimeAgo(recentItem.updatedAt)}
                        </span>
                      )}
                    </div>

                    <h2 className={styles.heroTitle}>
                      {heroTitle}
                    </h2>

                  <div className={styles.heroMeta}>
                    {episodeLabel(recentItem.se, recentItem.ep) && (
                      <span className={styles.heroEpisodeBadge}>
                        {episodeLabel(recentItem.se, recentItem.ep)}
                      </span>
                    )}
                    <span>{formatTime(recentItem.position)} watched</span>
                    {recentItem.duration > 0 && (
                      <>
                        <span>·</span>
                        <span>
                          {progressPct(
                            recentItem.position,
                            recentItem.duration
                          )}
                          % complete
                        </span>
                      </>
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
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Resume Watching
                    </Link>

                    <button
                      type="button"
                      className={styles.heroDeleteBtn}
                      onClick={() => handleDeleteItem(recentItem)}
                      title="Remove from history"
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          );
        })()}

          {/* Category Filters Bar */}
          <div className={styles.tabs}>
            {CATEGORIES.map((cat) => {
              const count =
                cat.id === "all"
                  ? items.length
                  : items.filter((i) => getItemCategory(i) === cat.id).length;
              return (
                <button
                  key={cat.id}
                  className={`${styles.tab} ${
                    activeTab === cat.id ? styles.tabActive : ""
                  }`}
                  onClick={() => setActiveTab(cat.id)}
                >
                  <span>{cat.label}</span>
                  {count > 0 && (
                    <span className={styles.tabCount}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Catalog Grid showing Watched Items */}
          <div>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>
                {activeTab === "all"
                  ? "All Watched Titles"
                  : CATEGORIES.find((c) => c.id === activeTab)?.label ||
                    "Filtered Titles"}
                <span className={styles.sectionCount}>
                  {filteredItems.length}{" "}
                  {filteredItems.length === 1 ? "title" : "titles"}
                </span>
              </h3>
              
              <div className={styles.viewToggles}>
                <button
                  type="button"
                  className={`${styles.viewBtn} ${viewMode === "grid" ? styles.viewBtnActive : ""}`}
                  onClick={() => setViewMode("grid")}
                  title="Grid View"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                  </svg>
                </button>
                <button
                  type="button"
                  className={`${styles.viewBtn} ${viewMode === "list" ? styles.viewBtnActive : ""}`}
                  onClick={() => setViewMode("list")}
                  title="List View"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div className={styles.noFilterMatch}>
                <p>No titles watched in this category yet.</p>
              </div>
            ) : (
              <>
                <div className={viewMode === "list" ? styles.list : styles.grid}>
                  {paginatedItems.map((item, idx) => (
                    <HistoryCard
                      key={
                        item.key ||
                        `${item.subjectId}_${item.se}_${item.ep}_${idx}`
                      }
                      item={item}
                      onDelete={handleDeleteItem}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
                
                {totalPages > 1 && (
                  <div className={styles.pagination}>
                    <button
                      className={styles.pageBtn}
                      disabled={currentPage === 1}
                      onClick={() => {
                        setCurrentPage((p) => Math.max(1, p - 1));
                        window.scrollTo({ top: 300, behavior: "smooth" });
                      }}
                    >
                      Previous
                    </button>
                    <span className={styles.pageInfo}>
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      className={styles.pageBtn}
                      disabled={currentPage === totalPages}
                      onClick={() => {
                        setCurrentPage((p) => Math.min(totalPages, p + 1));
                        window.scrollTo({ top: 300, behavior: "smooth" });
                      }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function HistoryCard({ item, onDelete, viewMode }) {
  const pct = progressPct(item.position, item.duration);
  const epLabel = episodeLabel(item.se, item.ep);
  const playUrl = buildPlayUrl(item);
  const displayTitle = resolveItemTitle(item);
  const cardPoster = resolveItemPoster(item);
  const categoryTag = getItemCategory(item);
  const timeAgo = formatTimeAgo(item.updatedAt);

  return (
    <div className={`${styles.card} ${viewMode === "list" ? styles.cardList : ""}`}>
      <Link href={playUrl || "#"} className={styles.cardMediaLink}>
        <div className={styles.cardPosterWrap}>
          {cardPoster ? (
            <img
              src={cardPoster}
              alt={displayTitle}
              className={styles.cardPoster}
              loading="lazy"
            />
          ) : (
            <div className={styles.cardPosterFallback}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                <line x1="7" y1="2" x2="7" y2="22"></line>
                <line x1="17" y1="2" x2="17" y2="22"></line>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <line x1="2" y1="7" x2="7" y2="7"></line>
                <line x1="2" y1="17" x2="7" y2="17"></line>
                <line x1="17" y1="17" x2="22" y2="17"></line>
                <line x1="17" y1="7" x2="22" y2="7"></line>
              </svg>
            </div>
          )}

          <div className={styles.cardBadge}>{epLabel || categoryTag}</div>

          <div className={styles.cardPlayOverlay}>
            <div className={styles.cardPlayIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
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
      </Link>

      {/* Delete / Remove item button */}
      <button
        type="button"
        className={styles.cardDeleteBtn}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete(item);
        }}
        title={`Remove ${displayTitle} from history`}
        aria-label={`Remove ${displayTitle} from history`}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div className={styles.cardBody}>
        <Link href={playUrl || "#"} className={styles.cardTitleLink}>
          <p className={styles.cardTitle}>{displayTitle}</p>
        </Link>
        <div className={styles.cardMetaRow}>
          <span className={styles.cardMetaTime}>
            {formatTime(item.position)} {pct > 0 ? `· ${pct}%` : ""}
          </span>
          {timeAgo && (
            <span className={styles.cardMetaAgo}>{timeAgo}</span>
          )}
        </div>
      </div>
    </div>
  );
}
