"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./NavigationProgressBar.module.css";

export default function NavigationProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  // When pathname changes, route change is complete
  useEffect(() => {
    if (visible) {
      setProgress(100);
      const timer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [pathname]);

  useEffect(() => {
    let animInterval = null;

    const startProgress = () => {
      setVisible(true);
      setProgress(25);
      if (animInterval) clearInterval(animInterval);
      animInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) {
            clearInterval(animInterval);
            return prev;
          }
          return prev + Math.max(2, (85 - prev) * 0.2);
        });
      }, 120);
    };

    const handleClick = (e) => {
      // Find nearest anchor tag
      const anchor = e.target?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Ignore external links, downloads, hash links, new tabs
      if (
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // Check if href is internal
      try {
        const url = new URL(href, window.location.href);
        if (url.origin === window.location.origin) {
          // If clicking link to current exact URL, do nothing
          if (url.pathname === window.location.pathname && url.search === window.location.search) {
            return;
          }
          startProgress();
        }
      } catch {
        // invalid URL
      }
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      if (animInterval) clearInterval(animInterval);
    };
  }, []);

  if (!visible && progress === 0) return null;

  return (
    <div
      className={styles.barContainer}
      aria-hidden="true"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className={styles.bar}
        style={{
          width: `${progress}%`,
          transition: progress === 100 ? "width 0.15s ease-out" : "width 0.25s ease",
        }}
      />
    </div>
  );
}
