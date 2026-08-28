"use client";

import Script from "next/script";
import { ADS_CONFIG } from "../../lib/ads";

export default function GlobalAds() {
  if (!ADS_CONFIG.ENABLE_ADS) return null;

  return (
    <>
      {/* Popunder / Social Bar Script */}
      <Script 
        src="https://pl31071010.profitableratecpmnetwork.com/97/9c/e2/979ce29285462e7a3730ae9d7118b858.js" 
        strategy="afterInteractive" 
      />
      {/* Additional Global Script */}
      <Script 
        src="https://pl31071012.profitableratecpmnetwork.com/46/b2/7b/46b27b44863285f004e2888142c8492c.js" 
        strategy="afterInteractive" 
      />
    </>
  );
}
