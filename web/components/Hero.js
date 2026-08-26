"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Hero.module.css";

const MAX_SLIDES = 10;
const AUTO_MS = 5500;

export default function Hero({ items = [] }) {
  const slides = (items || []).filter((m) => m?.slug && m?.name).slice(0, MAX_SLIDES);
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);
  const touchRef = useRef({ x: 0, locked: false });

  const go = useCallback(
    (next) => {
      if (!slides.length) return;
      setIndex(((next % slides.length) + slides.length) % slides.length);
    },
    [slides.length]
  );

  const resetTimer = useCallback(() => {
    clearInterval(timerRef.current);
    if (slides.length < 2) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, AUTO_MS);
  }, [slides.length]);

  useEffect(() => {
    resetTimer();
    return () => clearInterval(timerRef.current);
  }, [resetTimer]);

  if (!slides.length) return null;

  const item = slides[index];

  return (
    <section
      className={styles.hero}
      onMouseEnter={() => clearInterval(timerRef.current)}
      onMouseLeave={resetTimer}
      onTouchStart={(e) => {
        touchRef.current = { x: e.touches[0]?.clientX || 0, locked: true };
        clearInterval(timerRef.current);
      }}
      onTouchEnd={(e) => {
        if (!touchRef.current.locked) return;
        const dx = (e.changedTouches[0]?.clientX || 0) - touchRef.current.x;
        touchRef.current.locked = false;
        if (Math.abs(dx) > 48) go(index + (dx < 0 ? 1 : -1));
        resetTimer();
      }}
    >
      {item.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={item.slug || index}
          src={item.poster_url}
          alt=""
          className={styles.image}
        />
      ) : (
        <div className={styles.imageFallback} />
      )}
      <div className={styles.copy}>
        <p className={styles.eyebrow}>
          Featured{slides.length > 1 ? ` · ${index + 1}/${slides.length}` : ""}
        </p>
        <h1>{item.name}</h1>
        <p>{item.badge || "Featured pick"}</p>
        <Link
          className="play-btn"
          href={`/title/${encodeURIComponent(item.slug)}`}
        >
          View details
        </Link>
      </div>

      {slides.length > 1 ? (
        <>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowPrev}`}
            aria-label="Previous banner"
            onClick={() => {
              go(index - 1);
              resetTimer();
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowNext}`}
            aria-label="Next banner"
            onClick={() => {
              go(index + 1);
              resetTimer();
            }}
          >
            ›
          </button>
          <div className={styles.dots} role="tablist" aria-label="Banners">
            {slides.map((s, i) => (
              <button
                key={s.slug || i}
                type="button"
                role="tab"
                aria-selected={i === index}
                className={`${styles.dot} ${i === index ? styles.dotOn : ""}`}
                onClick={() => {
                  go(i);
                  resetTimer();
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
