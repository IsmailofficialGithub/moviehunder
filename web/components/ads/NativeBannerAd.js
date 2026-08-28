"use client";

import { ADS_CONFIG } from "../../lib/ads";
import { useAdLimiter } from "../../lib/adTracker";

export default function NativeBannerAd() {
  const shouldRender = useAdLimiter();
  if (!ADS_CONFIG.ENABLE_ADS || !shouldRender) return null;

  // Using an iframe to securely sandbox the ad script. 
  // This prevents document.write errors in React and layout shifts.
  const iframeHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>body { margin: 0; padding: 0; display: flex; justify-content: center; }</style>
      </head>
      <body>
        <script async="async" data-cfasync="false" src="https://pl31071011.profitableratecpmnetwork.com/0394f33bf0cafb685aff8d4cda2c24b0/invoke.js"></script>
        <div id="container-0394f33bf0cafb685aff8d4cda2c24b0"></div>
      </body>
    </html>
  `;

  const containerStyle = ADS_CONFIG.ADS_VISIBILITY 
    ? { margin: "16px 0", display: "flex", justifyContent: "center", width: "100%" } // Normal visible mode
    : {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        opacity: 1, // Completely visible to the ad network!
        visibility: "visible",
        pointerEvents: "none", // Cannot be clicked
        zIndex: -9999, // Rendered completely behind the page's dark background
      };

  return (
    <div 
      className="ad-container native-banner-ad"
      style={containerStyle}
      aria-hidden={!ADS_CONFIG.ADS_VISIBILITY ? "true" : undefined}
    >
      <iframe
        title="Native Banner Ad"
        width="100%"
        height="250"
        style={{ border: "none", overflow: "hidden", minHeight: "250px" }}
        srcDoc={iframeHtml}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );
}
