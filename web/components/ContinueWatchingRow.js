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
        setItems(cached.filter((i) => (Number(i.position) || 0) > 2));
      } else {
        const local = listLocalWatch().filter((i) => (Number(i.position) || 0) > 2);
        setItems(local);
      }

      // 2. Background refresh if signed in
      if (isSignedIn) {
        pullWatchProgress()
          .then((remote) => {
            const filtered = (remote || []).filter(
              (i) => (Number(i.position) || 0) > 2
            );
            if (filtered.length > 0) {
              setItems(
                filtered.sort(
                  (a, b) =>
                    parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt)
                )
              );
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
          const displayTitle = item.title || item.subjectId || "Continue Watching";

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
