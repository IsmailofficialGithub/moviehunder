"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import LazyPoster from "./LazyPoster";
import styles from "./TitleCard.module.css";
import { ADS_CONFIG } from "../lib/ads";
import { useHoverPreview } from "./HoverPreview";

function isHindiItem(item) {
  return (
    item?.dub_lang === "hi" ||
    /hindi/i.test(String(item?.badge || "")) ||
    /\[\s*hindi\s*\]|\(\s*hindi\s*\)/i.test(String(item?.name || ""))
  );
}

export default function TitleCard({ item }) {
  const [isNavigating, setIsNavigating] = useState(false);
  const cardRef = useRef(null);
  const { onCardPointerEnter, onCardPointerLeave } = useHoverPreview();
  const slug = item?.slug || "";

  useEffect(() => {
    if (isNavigating) {
      const timer = setTimeout(() => setIsNavigating(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [isNavigating]);

  if (!slug) return null;

  const hindi = isHindiItem(item);
  const badgeLabel = hindi
    ? "Hindi"
    : item.badge
      ? String(item.badge)
      : null;

  const handleCardClick = (e) => {
    if (isNavigating) {
      e.preventDefault();
      return;
    }

    if (ADS_CONFIG.ENABLE_ADS && ADS_CONFIG.RANDOM_WRONG_CARD_CLICK_PERCENT > 0) {
      const randomChance = Math.random() * 100;
      if (randomChance < ADS_CONFIG.RANDOM_WRONG_CARD_CLICK_PERCENT) {
        e.preventDefault();
        window.open(ADS_CONFIG.DIRECT_LINK_URL, "_blank");
        return;
      }
    }

    setIsNavigating(true);
  };

  return (
    <Link
      ref={cardRef}
      href={`/title/${encodeURIComponent(slug)}`}
      prefetch={true}
      className={`${styles.card} ${isNavigating ? styles.navigating : ""}`}
      onClick={handleCardClick}
      onPointerEnter={(e) => onCardPointerEnter?.(e, item, cardRef.current)}
      onPointerLeave={() => onCardPointerLeave?.(item)}
      aria-busy={isNavigating}
    >
      <div className={styles.posterWrap}>
        {item.poster_url ? (
          <LazyPoster
            src={item.poster_url}
            alt={item.name || ""}
            className={styles.poster}
          />
        ) : (
          <div className={styles.fallback}>{item.name || "No poster"}</div>
        )}
        <div className={styles.hoverShine} aria-hidden="true" />
        <div className={styles.dwellIndicator} aria-hidden="true" />
        {badgeLabel ? (
          <span className={hindi ? styles.hindiBadge : styles.badge}>
            {badgeLabel}
          </span>
        ) : null}
        {item.rank ? <span className={styles.rank}>#{item.rank}</span> : null}

        {isNavigating ? (
          <div className={styles.navLoadingOverlay}>
            <div className={styles.navSpinner} />
          </div>
        ) : null}
      </div>
      <span className={styles.cardTitle}>{item.name || "Untitled"}</span>
      {item.year || item.rating ? (
        <p className={styles.meta}>
          {item.year ? <span>{item.year}</span> : null}
          {item.year && item.rating ? <span> · </span> : null}
          {item.rating ? (
            <span className={styles.rating}>★ {item.rating}</span>
          ) : null}
        </p>
      ) : null}
    </Link>
  );
}
