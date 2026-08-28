"use client";

import { ADS_CONFIG } from "../../lib/ads";
import { useAdLimiter } from "../../lib/adTracker";

export default function BannerAd468x60() {
  const shouldRender = useAdLimiter();
  if (!ADS_CONFIG.ENABLE_ADS || !shouldRender) return null;

  // Using an iframe to securely sandbox the ad script.
  // This prevents document.write from wiping the React DOM.
  const iframeHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: transparent; }</style>
      </head>
      <body>
        <script>
          atOptions = {
            'key' : '8417b3157620135216b059f29af06f81',
            'format' : 'iframe',
            'height' : 60,
            'width' : 468,
            'params' : {}
          };
        </script>
        <script src="https://www.highrevenueformat.com/8417b3157620135216b059f29af06f81/invoke.js"></script>
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
      className="ad-container banner-ad-468x60"
      style={containerStyle}
      aria-hidden={!ADS_CONFIG.ADS_VISIBILITY ? "true" : undefined}
    >
      <iframe
        title="Banner Ad 468x60"
        width="468"
        height="60"
        style={{ border: "none", overflow: "hidden" }}
        srcDoc={iframeHtml}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );
}
