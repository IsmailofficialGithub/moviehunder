"use client";

import { useEffect } from "react";
import Lenis from "lenis";

export default function SmoothScroll() {
  useEffect(() => {
    const wrapper = document.querySelector(".appMain");
    const content = document.querySelector(".appScrollContent") || wrapper;
    if (!wrapper) return;

    const lenis = new Lenis({
      wrapper,
      content,
      duration: 0.85,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      touchMultiplier: 1.2,
      wheelMultiplier: 1.0,
      autoResize: true,
    });

    // Automatically recalculate scroll limit whenever content height changes
    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined" && content) {
      resizeObserver = new ResizeObserver(() => {
        lenis.resize();
      });
      resizeObserver.observe(content);
    }

    const onWindowResize = () => lenis.resize();
    window.addEventListener("resize", onWindowResize);

    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onWindowResize);
      if (resizeObserver) resizeObserver.disconnect();
      lenis.destroy();
    };
  }, []);

  return null;
}
