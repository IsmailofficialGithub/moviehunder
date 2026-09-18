"use client";

import { useState } from "react";
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

  if (!src) {
    return <div className={`${styles.shell} ${className || ""}`} />;
  }

  return (
    <div
      className={`${styles.shell} ${className || ""}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    >
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`${styles.img} ${loaded ? styles.loaded : ""}`}
      />
    </div>
  );
}
