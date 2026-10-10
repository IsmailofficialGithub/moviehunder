import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Hover preview provider and portal implementation", () => {
  const hoverPath = path.join(__dirname, "../components/HoverPreview.js");
  assert.ok(fs.existsSync(hoverPath), "HoverPreview.js must exist");

  const hoverSrc = fs.readFileSync(hoverPath, "utf8");
  assert.ok(
    hoverSrc.includes("HoverPreviewProvider") && hoverSrc.includes("useHoverPreview"),
    "HoverPreview.js must export HoverPreviewProvider and useHoverPreview"
  );
  assert.ok(
    hoverSrc.includes("createPortal"),
    "HoverPreview must render as a singleton portal escaping row scroller overflow"
  );
  assert.ok(
    hoverSrc.includes("previewCache"),
    "HoverPreview must use in-memory stream cache for 0 delay and 0 server load"
  );
  assert.ok(
    hoverSrc.includes("pickPreviewSource"),
    "HoverPreview must select lightweight stream resolution (360p/480p) for ultra-fast buffering"
  );
  assert.ok(
    hoverSrc.includes("setTimeout") && hoverSrc.includes("5000"),
    "HoverPreview must play first 5s from the start before seeking"
  );
  assert.ok(
    hoverSrc.includes("currentTime = randomSpot") || hoverSrc.includes("randomSpot"),
    "HoverPreview must seek to a random spot after initial 5s"
  );
  assert.ok(
    hoverSrc.includes("toggleMute") || hoverSrc.includes("isMuted"),
    "HoverPreview must provide mute/unmute control"
  );
  assert.ok(
    hoverSrc.includes("isTransitioning"),
    "HoverPreview must manage isTransitioning state for seamless scene cuts"
  );
  assert.ok(
    hoverSrc.includes("onSeeked"),
    "HoverPreview must hook onSeeked to dissolve back in without jarring jump"
  );
  assert.ok(
    hoverSrc.includes("1000"),
    "HoverPreview must wait 1.0s (1000ms) of stationary hover before opening the box"
  );
  assert.ok(
    hoverSrc.includes("videoRefA") && hoverSrc.includes("videoRefB") && hoverSrc.includes("activePlayer"),
    "HoverPreview must use dual video elements to preload subsequent chunks with zero lag or stutter"
  );
  assert.ok(
    hoverSrc.includes("crossFadeAudio"),
    "HoverPreview must smoothly cross-fade audio between preview clips to prevent voice cuts"
  );
});

test("TitleCard and RootLayout integrate HoverPreview", () => {
  const cardPath = path.join(__dirname, "../components/TitleCard.js");
  const cardSrc = fs.readFileSync(cardPath, "utf8");
  assert.ok(
    cardSrc.includes("useHoverPreview"),
    "TitleCard must consume useHoverPreview"
  );
  assert.ok(
    cardSrc.includes("onPointerEnter") && cardSrc.includes("onPointerLeave"),
    "TitleCard must bind pointer enter and leave for responsive hover detection"
  );

  const layoutPath = path.join(__dirname, "../app/layout.js");
  const layoutSrc = fs.readFileSync(layoutPath, "utf8");
  assert.ok(
    layoutSrc.includes("<HoverPreviewProvider>"),
    "layout.js must wrap application content with <HoverPreviewProvider>"
  );

  const cssPath = path.join(__dirname, "../components/HoverPreview.module.css");
  assert.ok(fs.existsSync(cssPath), "HoverPreview.module.css must exist");
  const cssSrc = fs.readFileSync(cssPath, "utf8");
  assert.ok(
    cssSrc.includes(".previewContainer") &&
      cssSrc.includes(".videoPlayer") &&
      cssSrc.includes(".videoTransitioning") &&
      cssSrc.includes(".loadingBar") &&
      cssSrc.includes(".muteBtn") &&
      cssSrc.includes(".playBtn") &&
      (cssSrc.includes("popIn 2s") || cssSrc.includes("popIn 1s")),
    "HoverPreview.module.css must define container, video, transition, loadingBar, mute, play button classes, and popIn animation"
  );
  assert.ok(
    cssSrc.includes(".previewClosing") && cssSrc.includes("popOut 1s"),
    "HoverPreview.module.css must define .previewClosing and 1s popOut exit animation"
  );
});
