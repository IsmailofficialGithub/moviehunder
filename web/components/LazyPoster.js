"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./LazyPoster.module.css";

/**
 * Loads poster bytes only when near the viewport (incl. horizontal).
 * Stays loaded once shown to avoid flicker; pair with LazyRow so
 * off-screen sections unmount and free memory.
 */
export default function LazyPoster({
  src,
  alt = "",
  width,
  height,
  className,
}) {
  const ref = useRef(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src || active) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      {
        root: null,
        rootMargin: "80px 160px",
        threshold: 0.01,
      }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src, active]);

  return (
    <div
      ref={ref}
      className={`${styles.shell} ${className || ""}`}
      style={{ width, height }}
    >
      {active && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          decoding="async"
          draggable={false}
        />
      ) : (
        <div className={styles.placeholder} aria-hidden />
      )}
    </div>
  );
}
