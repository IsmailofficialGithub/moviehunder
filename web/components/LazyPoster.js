"use client";

import { useState } from "react";
import styles from "./LazyPoster.module.css";

// Native off-thread lazy loading with zero JS state thrashing on scroll.
// Uses browser native loading="lazy" & decoding="async" for instant, hardware-accelerated rendering.
export default function LazyPoster({
  src,
  alt = "",
  width,
  height,
  className,
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`${styles.shell} ${className || ""}`}>
        <div className={styles.fallbackText}>{alt || "Movie"}</div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.shell} ${className || ""}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    >
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className={styles.img}
      />
    </div>
  );
}


