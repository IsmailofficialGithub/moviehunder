"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./LazyPoster.module.css";

// Native off-thread lazy loading with smooth image load fade-in.
// Uses browser native loading="lazy" & decoding="async" to eliminate JS state thrashing on scroll.
export default function LazyPoster({
  src,
  alt = "",
  width,
  height,
  className,
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

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
        ref={imgRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`${styles.img} ${loaded ? styles.loaded : ""}`}
      />
    </div>
  );
}

