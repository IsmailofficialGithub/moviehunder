"use client";

import { useState } from "react";
import Image from "next/image";
import styles from "./LazyPoster.module.css";

// Native Next.js image optimization with automatic WebP/AVIF generation and CDN caching.
// Falls back gracefully to native img tag if remote proxy fails.
export default function LazyPoster({
  src,
  alt = "",
  width,
  height,
  className,
  priority = false,
  sizes = "(max-width: 640px) 140px, 200px",
}) {
  const [loaded, setLoaded] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  if (!src) {
    return <div className={`${styles.shell} ${className || ""}`} />;
  }

  const hasExplicitDimensions = Boolean(width && height);

  return (
    <div
      className={`${styles.shell} ${className || ""}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    >
      {!useFallback ? (
        hasExplicitDimensions ? (
          <Image
            src={src}
            alt={alt}
            width={Number(width)}
            height={Number(height)}
            priority={priority}
            quality={75}
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setUseFallback(true)}
            className={`${styles.img} ${loaded ? styles.loaded : ""}`}
          />
        ) : (
          <Image
            src={src}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            quality={75}
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setUseFallback(true)}
            className={`${styles.img} ${loaded ? styles.loaded : ""}`}
          />
        )
      ) : (
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
      )}
    </div>
  );
}
