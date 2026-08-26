"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./CatalogRows.module.css";

/** Mount row content only when near the viewport to cut DOM + image load. */
export default function LazyRow({ children, minHeight = 280 }) {
  const ref = useRef(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={styles.lazyRow}
      style={show ? undefined : { minHeight }}
    >
      {show ? children : null}
    </div>
  );
}
