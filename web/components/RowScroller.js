"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./CatalogRows.module.css";

export default function RowScroller({ children }) {
  const ref = useRef(null);
  const animRef = useRef(0);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 4;
    const right = max > 4 && el.scrollLeft < max - 4;
    setCanLeft((v) => (v === left ? v : left));
    setCanRight((v) => (v === right ? v : right));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      cancelAnimationFrame(animRef.current);
    };
  }, [update, children]);

  const scrollBy = (dir) => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(animRef.current);

    const amount = Math.max(320, Math.floor(el.clientWidth * 0.8));
    const start = el.scrollLeft;
    const max = el.scrollWidth - el.clientWidth;
    const target = Math.max(0, Math.min(max, start + dir * amount));
    const dist = target - start;
    if (Math.abs(dist) < 1) return;

    const duration = 420;
    const t0 = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      // ease-out cubic — smooth, no snap bounce
      const eased = 1 - (1 - t) ** 3;
      el.scrollLeft = start + dist * eased;
      if (t < 1) animRef.current = requestAnimationFrame(tick);
      else update();
    };

    animRef.current = requestAnimationFrame(tick);
  };

  return (
    <div className={styles.scrollerWrap}>
      <button
        type="button"
        className={`${styles.rowArrow} ${styles.rowArrowPrev} ${
          canLeft ? styles.rowArrowReady : ""
        }`}
        aria-label="Scroll row left"
        aria-hidden={!canLeft}
        tabIndex={canLeft ? 0 : -1}
        disabled={!canLeft}
        onClick={() => scrollBy(-1)}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
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
        className={`${styles.rowArrow} ${styles.rowArrowNext} ${
          canRight ? styles.rowArrowReady : ""
        }`}
        aria-label="Scroll row right"
        aria-hidden={!canRight}
        tabIndex={canRight ? 0 : -1}
        disabled={!canRight}
        onClick={() => scrollBy(1)}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div ref={ref} className={styles.scroller}>
        {children}
      </div>
    </div>
  );
}
