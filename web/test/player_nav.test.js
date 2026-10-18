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

test("StreamPlayer resets timestamp on episode change and implements Spacebar 2X speed", () => {
  const playerPath = path.join(__dirname, "../components/StreamPlayer.js");
  const playerSrc = fs.readFileSync(playerPath, "utf8");

  // Spacebar 2X speed & hotkey isolation
  assert.ok(
    playerSrc.includes('hotkeys="nospace"'),
    "MediaController must have hotkeys=\"nospace\" so Spacebar controls 2X speed"
  );
  assert.ok(
    playerSrc.includes('e.code !== "Space" && e.key !== " "') ||
      playerSrc.includes('e.code === "Space"') ||
      playerSrc.includes('e.key === " "'),
    "StreamPlayer must listen for Space key"
  );
  assert.ok(
    playerSrc.includes("playbackRate = 2") && playerSrc.includes("hold2xActive"),
    "StreamPlayer must set playbackRate to 2 on Spacebar and toggle hold2xActive"
  );

  // Episode change timestamp reset to prevent 99% bleed
  assert.ok(
    playerSrc.includes("activeEpKeyRef") && playerSrc.includes("lastEpKeyRef"),
    "StreamPlayer must track activeEpKeyRef and lastEpKeyRef"
  );
  assert.ok(
    playerSrc.includes("video.currentTime = Math.max(0, resume)"),
    "StreamPlayer must explicitly reset currentTime on ready to prevent timestamp bleed"
  );
  assert.ok(
    playerSrc.includes("video.currentTime / dur >= 0.90") ||
      playerSrc.includes("isFinished"),
    "StreamPlayer must treat nearly-completed episodes as finished instead of resuming at 99%"
  );
});

test("DetailClient handles multi-season series selection and season-specific episode labelling", () => {
  const detailPath = path.join(__dirname, "../components/DetailClient.js");
  const detailSrc = fs.readFileSync(detailPath, "utf8");

  // Season normalization and fallback to detail metadata
  assert.ok(
    detailSrc.includes("detail?.metadata?.seasons"),
    "DetailClient must fall back to detail.metadata.seasons when episodes API is pending or empty"
  );
  assert.ok(
    detailSrc.includes("s.season ?? s.se"),
    "DetailClient must normalize seasons supporting both s.season and s.se"
  );

  // Active season matching and select value binding
  assert.ok(
    detailSrc.includes("String(s.season) === String(selectedSe) ||") &&
      detailSrc.includes("String(s.se) === String(selectedSe)"),
    "DetailClient must match active season by both s.season and s.se"
  );
  assert.ok(
    detailSrc.includes("value={String(activeSeason?.season ?? selectedSe)}"),
    "Season dropdown value must stay bound to activeSeason.season"
  );

  // Episode title includes season number
  assert.ok(
    detailSrc.includes("curSeasonNum") && detailSrc.includes("`S${curSeasonNum}"),
    "Episode cards must explicitly prefix season number in the title (e.g. S3 E1)"
  );
});

test("StreamPlayer supports iPhone inline playback, mediapaused play button, and unlocked vertical view", () => {
  const playerPath = path.join(__dirname, "../components/StreamPlayer.js");
  const playerSrc = fs.readFileSync(playerPath, "utf8");

  assert.ok(
    playerSrc.includes('webkit-playsinline="true"'),
    "StreamPlayer video elements must include webkit-playsinline for iOS Safari"
  );

  assert.ok(
    !playerSrc.includes('orientation.lock("landscape")'),
    "StreamPlayer must not forcibly lock orientation to landscape so vertical view works on iPhones"
  );

  const cssPath = path.join(__dirname, "../components/StreamPlayer.module.css");
  const cssSrc = fs.readFileSync(cssPath, "utf8");

  assert.ok(
    cssSrc.includes(".controller[mediapaused] .centerOverlay > media-play-button") &&
      cssSrc.includes("pointer-events: auto !important"),
    "StreamPlayer CSS must ensure play button is interactive and visible when paused"
  );
});



