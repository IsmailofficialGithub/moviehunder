import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("NavigationProgressBar exists and is mounted in RootLayout", () => {
  const layoutPath = path.join(__dirname, "../app/layout.js");
  const layoutSrc = fs.readFileSync(layoutPath, "utf8");

  assert.ok(
    layoutSrc.includes("import NavigationProgressBar"),
    "layout.js must import NavigationProgressBar"
  );
  assert.ok(
    layoutSrc.includes("<NavigationProgressBar />"),
    "layout.js must render <NavigationProgressBar /> inside body"
  );

  const progPath = path.join(__dirname, "../components/NavigationProgressBar.js");
  assert.ok(fs.existsSync(progPath), "NavigationProgressBar.js must exist");
  const progSrc = fs.readFileSync(progPath, "utf8");
  assert.ok(
    progSrc.includes("usePathname"),
    "NavigationProgressBar must react to route navigation via usePathname"
  );
});

test("TitleCard has prefetch, isNavigating feedback state, and loading spinner", () => {
  const cardPath = path.join(__dirname, "../components/TitleCard.js");
  const cardSrc = fs.readFileSync(cardPath, "utf8");

  assert.ok(
    cardSrc.includes("prefetch={true}"),
    "TitleCard must prefetch route data on hover/view"
  );
  assert.ok(
    cardSrc.includes("isNavigating"),
    "TitleCard must track navigation feedback state"
  );
  assert.ok(
    cardSrc.includes("navLoadingOverlay") && cardSrc.includes("navSpinner"),
    "TitleCard must display spinner overlay while redirecting"
  );

  const cssPath = path.join(__dirname, "../components/TitleCard.module.css");
  const cssSrc = fs.readFileSync(cssPath, "utf8");
  assert.ok(
    cssSrc.includes(".navLoadingOverlay") && cssSrc.includes(".navSpinner"),
    "TitleCard.module.css must define nav overlay and spinner"
  );
});

test("StreamPlayer has 10s double-tap seek, fullscreen settings clickable fix, and mobile layout", () => {
  const playerPath = path.join(__dirname, "../components/StreamPlayer.js");
  const playerSrc = fs.readFileSync(playerPath, "utf8");

  // Double-tap seek
  assert.ok(
    playerSrc.includes("triggerSeek") && playerSrc.includes("seekRipple"),
    "StreamPlayer must implement 10s seek and visual ripple"
  );
  assert.ok(
    playerSrc.includes("onDoubleClick"),
    "StreamPlayer must handle desktop double click"
  );

  // Settings in fullscreen
  assert.ok(
    playerSrc.includes('slot="middle-chrome"'),
    "StreamPlayer modals must have slot middle-chrome for fullscreen MediaController"
  );
  assert.ok(
    playerSrc.includes("onClickCapture") && playerSrc.includes("onPointerDownCapture"),
    "StreamPlayer modals must stop event bubbling to prevent gesture intercept"
  );

  const playerCssPath = path.join(__dirname, "../components/StreamPlayer.module.css");
  const playerCss = fs.readFileSync(playerCssPath, "utf8");

  // CSS pointer-events & z-index
  assert.ok(
    playerCss.includes(".settingsModal") && playerCss.includes("2147483647"),
    "settingsModal must have top z-index in CSS"
  );
  assert.ok(
    playerCss.includes(".subModal") && playerCss.includes("pointer-events: auto !important"),
    "subModal must have pointer-events: auto !important"
  );

  // Center overlay and subtitle mobile separation
  assert.ok(
    playerCss.includes(".seekRippleLeft") && playerCss.includes(".seekRippleRight"),
    "CSS must define seekRipple styles"
  );
  assert.ok(
    playerCss.includes(".centerOverlay"),
    "CSS must define centerOverlay"
  );
});

test("SiteHeader has profile avatar button with dropdown containing profiles, history, and settings", () => {
  const headerPath = path.join(__dirname, "../components/SiteHeader.js");
  const headerSrc = fs.readFileSync(headerPath, "utf8");

  assert.ok(
    headerSrc.includes("avatarBtn") && headerSrc.includes("profileDropdown"),
    "SiteHeader must render avatarBtn and profileDropdown"
  );
  assert.ok(
    headerSrc.includes('href="/profiles"'),
    "Dropdown must contain link to /profiles"
  );
  assert.ok(
    headerSrc.includes('href="/history"'),
    "Dropdown must contain link to /history"
  );
  assert.ok(
    headerSrc.includes('href="/settings"'),
    "Dropdown must contain link to /settings"
  );

  const headerCssPath = path.join(__dirname, "../components/SiteHeader.module.css");
  const headerCss = fs.readFileSync(headerCssPath, "utf8");

  assert.ok(
    headerCss.includes(".avatarBtn") && headerCss.includes(".profileDropdown"),
    "SiteHeader.module.css must style avatarBtn and profileDropdown"
  );
});

test("SiteHeader uses Lucide Download icon, compact pill button, and supports Google OAuth avatar", () => {
  const headerPath = path.join(__dirname, "../components/SiteHeader.js");
  const headerSrc = fs.readFileSync(headerPath, "utf8");

  // Download icon from lucide-react
  assert.ok(
    headerSrc.includes('import { Download } from "lucide-react"') ||
      headerSrc.includes("Download"),
    "SiteHeader must import Download from lucide-react"
  );
  assert.ok(
    headerSrc.includes("<Download"),
    "SiteHeader must render Lucide Download component"
  );

  // Google OAuth avatar support with no-referrer
  assert.ok(
    headerSrc.includes("avatar_url") && headerSrc.includes('referrerPolicy="no-referrer"'),
    "SiteHeader must support user.avatar_url and include referrerPolicy=no-referrer for Google photos"
  );

  // Compact download button CSS
  const headerCssPath = path.join(__dirname, "../components/SiteHeader.module.css");
  const headerCss = fs.readFileSync(headerCssPath, "utf8");

  assert.ok(
    headerCss.includes(".downloadBtn") && headerCss.includes("border-radius: 9999px"),
    "SiteHeader.module.css must style downloadBtn as a sleek compact pill"
  );
});

