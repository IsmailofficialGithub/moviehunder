"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  Play,
  Trash2,
  X,
  Search,
  Check,
  RotateCcw,
  Star,
  Film,
  Tv,
} from "lucide-react";
import LazyPoster from "../../components/LazyPoster";
import EmptyState from "../../components/EmptyState";
import { useAuth } from "../../components/AuthProvider";
import {
  getWatchlist,
  fetchRemoteWatchlist,
  toggleWatchlist,
  bulkRemoveFromWatchlist,
  mergeGuestWatchlistToServer,
  setWatchlistCache,
} from "../../lib/watchlist";
import { getActiveProfile } from "../../lib/profiles";
import styles from "./watchlist.module.css";

function buildPlayUrl(item) {
  const cleanSlug = String(item.slug || item.detailPath || item.id || "")
    .replace(/^\/?(?:detail|title)\//, "")
    .replace(/^\/+/, "");
  const subjectId = item.subjectId || item.id || cleanSlug;
  const p = new URLSearchParams();
  if (subjectId) p.set("subjectId", String(subjectId));
  if (cleanSlug) p.set("detail_path", cleanSlug);
  if (item.title || item.name) p.set("title", item.title || item.name);
  if (item.poster || item.poster_url) p.set("poster", item.poster || item.poster_url);
  if (item.type === "tv") {
    p.set("se", "1");
    p.set("ep", "1");
  }
  return `/play?${p.toString()}`;
}

export default function WatchlistPage() {
  const { user, isSignedIn } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Sorting
  const [activeTab, setActiveTab] = useState("all"); // "all" | "movie" | "tv"
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("date"); // "date" | "date_asc" | "az" | "year" | "rating"

  // Bulk Selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // 5-Second Undo Snackbar
  const [undoState, setUndoState] = useState(null); // { items: [...], timeoutId: number }
  const undoTimerRef = useRef(null);

  // Load and sync watchlist
  const loadData = useCallback(async () => {
    setError(null);
    try {
      // 1. Initial instant load from cache
      const cached = getWatchlist();
      setItems(cached);

      // 2. Fetch fresh remote data if authenticated
      if (isSignedIn) {
        await mergeGuestWatchlistToServer().catch(() => {});
        const remote = await fetchRemoteWatchlist(sortBy);
        if (Array.isArray(remote)) {
          setItems(remote);
        }
      }
    } catch (err) {
      console.error("Watchlist load error", err);
      setError("Could not load your watchlist. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, sortBy]);

  useEffect(() => {
    loadData();

    const onWatchlistChange = () => {
      setItems(getWatchlist());
    };

    window.addEventListener("mh:watchlist:change", onWatchlistChange);
    window.addEventListener("mh:profile:change", loadData);
    window.addEventListener("storage", onWatchlistChange);

    return () => {
      window.removeEventListener("mh:watchlist:change", onWatchlistChange);
      window.removeEventListener("mh:profile:change", loadData);
      window.removeEventListener("storage", onWatchlistChange);
    };
  }, [loadData]);

  // Clean undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Category filter
    if (activeTab === "movie") {
      result = result.filter((it) => it.type === "movie");
    } else if (activeTab === "tv") {
      result = result.filter((it) => it.type === "tv");
    }

    // Search filter
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (it) =>
          String(it.title || it.name || "").toLowerCase().includes(q) ||
          String(it.year || "").includes(q)
      );
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === "date") {
        return new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
      }
      if (sortBy === "date_asc") {
        return new Date(a.addedAt || 0) - new Date(b.addedAt || 0);
      }
      if (sortBy === "az") {
        return String(a.title || a.name || "").localeCompare(String(b.title || b.name || ""));
      }
      if (sortBy === "year") {
        return Number(b.year || 0) - Number(a.year || 0);
      }
      if (sortBy === "rating") {
        return Number(b.rating || 0) - Number(a.rating || 0);
      }
      return 0;
    });

    return result;
  }, [items, activeTab, searchQuery, sortBy]);

  // Counts
  const movieCount = useMemo(() => items.filter((it) => it.type === "movie").length, [items]);
  const tvCount = useMemo(() => items.filter((it) => it.type === "tv").length, [items]);

  // Trigger 5-second Undo Snackbar
  const triggerUndo = (removedItems) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    const timer = setTimeout(() => {
      setUndoState(null);
    }, 5000);

    undoTimerRef.current = timer;
    setUndoState({
      items: removedItems,
      label: removedItems.length === 1 ? `Removed "${removedItems[0].title || removedItems[0].name}"` : `Removed ${removedItems.length} titles`,
    });
  };

  // Execute Undo
  const handleUndo = async () => {
    if (!undoState?.items?.length) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    const toRestore = undoState.items;
    setUndoState(null);

    // Re-add items
    for (const item of toRestore) {
      await toggleWatchlist(item);
    }
  };

  // Remove single title
  const handleRemoveSingle = async (e, item) => {
    e.preventDefault();
    e.stopPropagation();

    triggerUndo([item]);
    await toggleWatchlist(item);
  };

  // Toggle selection
  const toggleSelect = (e, id) => {
    e.preventDefault();
    e.stopPropagation();

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Select all visible
  const handleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((it) => it.id || it.slug)));
    }
  };

  // Bulk remove selected
  const handleBulkRemove = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const removedItems = items.filter((it) => ids.includes(it.id || it.slug));

    triggerUndo(removedItems);
    setSelectedIds(new Set());
    setSelectMode(false);

    await bulkRemoveFromWatchlist(ids);
  };

  const activeProfile = getActiveProfile(user);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <div className={styles.titleRow}>
            <h1>Watchlist</h1>
            <span className={styles.countBadge}>
              {items.length} {items.length === 1 ? "title" : "titles"}
            </span>
          </div>
          <p className={styles.subtitle}>
            {activeProfile?.name ? `Saved titles for ${activeProfile.name}` : "Your saved movies and shows"}
          </p>
        </div>
      </div>

      {/* Controls Bar: Tabs, Search, Sort, Bulk Toggle */}
      <div className={styles.controlsBar}>
        <div className={styles.controlsLeft}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "all" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "movie" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("movie")}
          >
            Movies ({movieCount})
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "tv" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("tv")}
          >
            TV Series ({tvCount})
          </button>
        </div>

        <div className={styles.controlsRight}>
          {/* Live Search */}
          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search list…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
              aria-label="Filter watchlist titles"
            />
          </div>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className={styles.sortSelect}
            aria-label="Sort watchlist"
          >
            <option value="date">Date Added (Newest)</option>
            <option value="date_asc">Date Added (Oldest)</option>
            <option value="az">Title (A–Z)</option>
            <option value="year">Release Year</option>
            <option value="rating">Rating</option>
          </select>

          {/* Bulk Select Button */}
          {items.length > 0 && (
            <button
              type="button"
              className={`${styles.actionBtn} ${selectMode ? styles.actionBtnDanger : ""}`}
              onClick={() => {
                setSelectMode(!selectMode);
                setSelectedIds(new Set());
              }}
            >
              {selectMode ? "Cancel" : "Select"}
            </button>
          )}
        </div>
      </div>

      {/* Bulk Selection Bar */}
      {selectMode && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkBarLeft}>
            <span>
              {selectedIds.size} of {filteredItems.length} selected
            </span>
            <button type="button" className={styles.selectAllBtn} onClick={handleSelectAll}>
              {selectedIds.size === filteredItems.length ? "Deselect All" : "Select All"}
            </button>
          </div>
          {selectedIds.size > 0 && (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              onClick={handleBulkRemove}
            >
              <Trash2 size={14} />
              <span>Remove Selected ({selectedIds.size})</span>
            </button>
          )}
        </div>
      )}

      {/* Main Content States */}
      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`skel-${i}`} className={styles.skeletonCard}>
              <div className={styles.skeletonPoster} />
              <div className={styles.skeletonText} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className={styles.errorBox}>
          <h3 className={styles.errorTitle}>Error Loading Watchlist</h3>
          <p className={styles.errorDesc}>{error}</p>
          <button type="button" className={styles.actionBtn} onClick={loadData}>
            <RotateCcw size={14} />
            <span>Try Again</span>
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Your watchlist is empty"
          hint="Explore movies and TV shows and click 'Watchlist' to save them for later."
          actionHref="/"
          actionLabel="Browse Movies & TV"
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="No matching titles"
          hint={searchQuery ? `Nothing matches "${searchQuery}".` : "No titles in this category."}
          actionHref=""
          actionLabel="Clear Search"
          onClick={() => {
            setSearchQuery("");
            setActiveTab("all");
          }}
        />
      ) : (
        <div className={styles.grid}>
          {filteredItems.map((item) => {
            const id = item.id || item.slug;
            const isSelected = selectedIds.has(id);
            const playHref = buildPlayUrl(item);

            return (
              <div
                key={id}
                className={styles.card}
                onClick={(e) => {
                  if (selectMode) {
                    toggleSelect(e, id);
                  }
                }}
              >
                <div className={styles.posterWrap}>
                  {item.poster_url || item.poster ? (
                    <LazyPoster
                      src={item.poster_url || item.poster}
                      alt={item.title || item.name}
                      className={styles.posterImg}
                    />
                  ) : (
                    <div className={styles.posterFallback}>
                      {item.title || item.name || "No poster"}
                    </div>
                  )}

                  {item.type && (
                    <span className={styles.badge}>
                      {item.type === "tv" ? "Series" : "Movie"}
                    </span>
                  )}

                  {/* Play Action Overlay */}
                  {!selectMode && (
                    <Link
                      href={playHref}
                      className={styles.playOverlay}
                      aria-label={`Play ${item.title || item.name}`}
                    >
                      <div className={styles.playCircle}>
                        <Play size={18} fill="#000" color="#000" style={{ marginLeft: 2 }} />
                      </div>
                    </Link>
                  )}

                  {/* Quick Remove Button (when not in select mode) */}
                  {!selectMode && (
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={(e) => handleRemoveSingle(e, item)}
                      title="Remove from watchlist"
                      aria-label={`Remove ${item.title || item.name} from watchlist`}
                    >
                      <X size={14} />
                    </button>
                  )}

                  {/* Selection Checkbox (when in select mode) */}
                  {selectMode && (
                    <div className={styles.selectCheckboxWrap}>
                      <div
                        className={`${styles.selectCheckbox} ${
                          isSelected ? styles.selectCheckboxActive : ""
                        }`}
                        onClick={(e) => toggleSelect(e, id)}
                      >
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Title & Meta */}
                <div className={styles.cardInfo}>
                  <Link
                    href={playHref}
                    className={styles.cardTitle}
                    title={`Play ${item.title || item.name}`}
                  >
                    {item.title || item.name}
                  </Link>
                  <div className={styles.cardMeta}>
                    {item.year && <span>{String(item.year).slice(0, 4)}</span>}
                    {item.year && item.rating && <span>·</span>}
                    {item.rating && (
                      <span className={styles.rating}>
                        <Star size={11} fill="#eab308" color="#eab308" />
                        <span>{Number(item.rating).toFixed(1)}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5-Second Floating Undo Snackbar */}
      {undoState && (
        <div className={styles.snackbar} role="alert">
          <span className={styles.snackbarText}>{undoState.label}</span>
          <button type="button" className={styles.undoBtn} onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
