"use client";

import { useEffect, useRef } from "react";
import styles from "./CatalogRows.module.css";

export default function RowScroller({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 1) return;
      const next = el.scrollLeft + e.deltaY;
      if (next <= 0 && el.scrollLeft <= 0) return;
      if (next >= max && el.scrollLeft >= max - 1) return;
      e.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div ref={ref} className={styles.scroller}>
      {children}
    </div>
  );
}
