"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // Register after page load so it never impacts critical path performance
      const register = () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            // Check for updates periodically
            reg.update().catch(() => {});
          })
          .catch(() => {});
      };

      if (document.readyState === "complete") {
        register();
      } else {
        window.addEventListener("load", register, { once: true });
      }
    }
  }, []);

  return null;
}
