"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getWatchCache, listLocalWatch, parseTimestamp, pullWatchProgress } from "../lib/sync";
import RowScroller from "./RowScroller";
import styles from "./ContinueWatchingRow.module.css";

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

function resolveDisplayTitle(item) {
  if (item.title && !/^\d+$/.test(String(item.title).trim())) {
    return item.title;
  }
  if (typeof window !== "undefined" && item.subjectId) {
    try {
      const meta = JSON.parse(localStorage.getItem(`history_meta_${item.subjectId}`) || "{}");
      if (meta.title && !/^\d+$/.test(String(meta.title).trim())) {
        return meta.title;
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
  return item.title || "Continue Watching";
}

function resolvePoster(item) {
  if (item.poster) return item.poster;
  if (typeof window !== "undefined" && item.subjectId) {
    try {
      const meta = JSON.parse(localStorage.getItem(`history_meta_${item.subjectId}`) || "{}");
      if (meta.poster) return meta.poster;
    } catch {}
  }
  return null;
}

function deduplicateShows(list) {
  if (!Array.isArray(list)) return [];
  const map = new Map();

  for (const raw of list) {
    const showId = raw.subjectId || raw.detailPath || raw.key;
    if (!showId) continue;

    const poster = resolvePoster(raw);
    const title = resolveDisplayTitle(raw);
    const item = { ...raw, poster, title };

    if (!map.has(showId)) {
      map.set(showId, item);
    } else {
      const existing = map.get(showId);
      const existingTs = parseTimestamp(existing.updatedAt) || 0;
      const currentTs = parseTimestamp(item.updatedAt) || 0;

      // Keep the most recent episode watched
      if (currentTs >= existingTs) {
        map.set(showId, {
          ...item,
          title: (item.title && item.title !== "Continue Watching") ? item.title : (existing.title || item.title),
          poster: item.poster || existing.poster,
          detailPath: item.detailPath || existing.detailPath,
        });
      } else {
        if (!existing.poster && item.poster) existing.poster = item.poster;
        if ((!existing.title || existing.title === "Continue Watching") && item.title) {
          existing.title = item.title;
        }
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt)
  );
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

export default function ContinueWatchingRow() {
  const { user, isSignedIn } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    function load() {
      // 1. Instant Cache Hit
      const cached = getWatchCache(user?.id);
      if (cached && cached.length > 0) {
        const filtered = cached.filter((i) => (Number(i.position) || 0) > 2);
        setItems(deduplicateShows(filtered));
      } else {
        const local = listLocalWatch().filter((i) => (Number(i.position) || 0) > 2);
        setItems(deduplicateShows(local));
      }

      // 2. Background refresh if signed in
      if (isSignedIn) {
        pullWatchProgress()
          .then((remote) => {
            const filtered = (remote || []).filter(
              (i) => (Number(i.position) || 0) > 2
            );
            if (filtered.length > 0) {
              setItems(deduplicateShows(filtered));
            }
          })
          .catch(() => {});
      }
    }

    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
    };
  }, [user?.id, isSignedIn]);

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section className={styles.row}>
      <div className="row-head">
        <h2>⚡ Continue Watching</h2>
        <Link href="/history" className={styles.seeAllLink}>
          View All ({items.length}) →
        </Link>
      </div>
      <RowScroller>
        {items.slice(0, 12).map((item, idx) => {
          const pct = progressPct(item.position, item.duration);
          const ep = episodeLabel(item.se, item.ep);
          const playUrl = buildPlayUrl(item);
          const displayTitle = item.title || "Continue Watching";

          return (
            <Link
              key={item.key || `${item.subjectId}_${idx}`}
              href={playUrl || "#"}
              className={styles.card}
              title={`Resume ${displayTitle}`}
            >
              <div className={styles.posterWrap}>
                {item.poster ? (
                  <img
                    src={item.poster}
                    alt={displayTitle}
                    className={styles.poster}
                    loading="lazy"
                  />
                ) : (
                  <div className={styles.fallback}>🎬</div>
                )}

                {ep ? (
                  <span className={styles.badge}>{ep}</span>
                ) : (
                  <span className={styles.badge}>Movie</span>
                )}

                <div className={styles.playOverlay}>
                  <div className={styles.playIcon}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>

                {item.duration > 0 && (
                  <div className={styles.progressBarWrap}>
                    <div
                      className={styles.progressBarFill}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>

              <h3 className={styles.cardTitle}>{displayTitle}</h3>

              <div className={styles.meta}>
                <span>{formatTime(item.position)}</span>
                {pct > 0 && (
                  <span className={styles.progressText}>{pct}%</span>
                )}
              </div>
            </Link>
          );
        })}
      </RowScroller>
    </section>
  );
}
