"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Hero.module.css";

const MAX_SLIDES = 6;
const AUTO_MS = 5500;

export default function Hero({ items = [] }) {
  const slides = (items || []).filter((m) => m?.slug && m?.name).slice(0, MAX_SLIDES);
  const [index, setIndex] = useState(0);
  const [imgError, setImgError] = useState(false);
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

  useEffect(() => {
    setImgError(false);
  }, [index]);

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
        <div className={styles.media} key={item.slug || index}>
          {!imgError ? (
            <Image
              src={item.poster_url}
              alt={
                item.name
                  ? `${item.name} - Watch Free on Offstream`
                  : "Featured Movie Poster"
              }
              fill
              priority={index === 0}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 1280px"
              quality={80}
              className={styles.image}
              onError={() => setImgError(true)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.poster_url}
              alt={
                item.name
                  ? `${item.name} - Watch Free on Offstream`
                  : "Featured Movie Poster"
              }
              className={styles.image}
              decoding="async"
            />
          )}
        </div>
      ) : (
        <div className={styles.imageFallback} />
      )}
      <div className={styles.copy}>
        <p className={styles.eyebrow}>
          Featured{slides.length > 1 ? ` · ${index + 1}/${slides.length}` : ""}
        </p>
        <h2 className={styles.heroTitle}>{item.name}</h2>
        <p>{item.badge || "Featured pick"}</p>
        <Link
          className={styles.cta}
          href={`/title/${encodeURIComponent(item.slug)}`}
        >
          View details
          <svg
            className={styles.ctaIcon}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M5 12h14M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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
            <svg
              className={styles.arrowIcon}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
            <svg
              className={styles.arrowIcon}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className={styles.dots} role="tablist" aria-label="Banners">
            {slides.map((s, i) => (
              <button
                key={s.slug || i}
                type="button"
                role="tab"
                aria-label={`Slide ${i + 1}: ${s.name || "Featured"}`}
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
