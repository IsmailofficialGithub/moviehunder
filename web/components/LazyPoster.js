"use client";

import { useState } from "react";
import { isImageCached, markImageCached } from "../lib/imageCache";
import styles from "./LazyPoster.module.css";

// Native off-thread lazy loading with persistent image caching.
// First time: fetches and stores in browser CacheStorage & memory cache.
// Second time: instantly loads from cache with zero latency.
export default function LazyPoster({
  src,
  alt = "",
  width,
  height,
  className,
}) {
  const [failed, setFailed] = useState(false);
  const isCached = isImageCached(src);

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
        loading={isCached ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        onLoad={() => markImageCached(src)}
        onError={() => setFailed(true)}
        className={styles.img}
      />
    </div>
  );
}


