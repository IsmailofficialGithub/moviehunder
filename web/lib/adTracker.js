"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ADS_CONFIG } from "./ads";

let globalAdCount = 0;
let lastPathname = "";

export function useAdLimiter() {
  const pathname = usePathname();
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    // Reset the counter when the user navigates to a new page
    if (pathname !== lastPathname) {
      globalAdCount = 0;
      lastPathname = pathname;
    }

    if (ADS_CONFIG.MAX_ADS_PER_PAGE === -1) {
      setShouldRender(true);
      return;
    }

    if (globalAdCount < ADS_CONFIG.MAX_ADS_PER_PAGE) {
      globalAdCount++;
      setShouldRender(true);
    }
  }, [pathname]);

  return shouldRender;
}
