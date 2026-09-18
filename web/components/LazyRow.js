"use client";

import styles from "./CatalogRows.module.css";

// Renders row content directly so browser CSS content-visibility handles offscreen rendering natively
export default function LazyRow({ children, minHeight = 280 }) {
  return (
    <div className={styles.lazyRow} style={{ minHeight }}>
      {children}
    </div>
  );
}
