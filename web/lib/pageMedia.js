/**
 * Tab title + Media Session (lock screen / notification controls).
 */

const BRAND = "MovieHunter";

export function setPageTitle(parts) {
  if (typeof document === "undefined") return;
  const bits = (Array.isArray(parts) ? parts : [parts])
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  document.title = bits.length ? `${bits.join(" · ")} · ${BRAND}` : BRAND;
}

export function clearPageTitle(fallback = BRAND) {
  if (typeof document === "undefined") return;
  document.title = fallback || BRAND;
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.artist]
 * @param {string} [opts.album]
 * @param {string} [opts.artworkUrl]
 * @param {'music'|'video'|'none'} [opts.kind]
 * @param {() => void} [opts.onPlay]
 * @param {() => void} [opts.onPause]
 * @param {() => void} [opts.onPrevious]
 * @param {() => void} [opts.onNext]
 * @param {(details: { seekTime?: number }) => void} [opts.onSeekTo]
 * @param {number} [opts.duration]
 * @param {number} [opts.position]
 * @param {boolean} [opts.playing]
 */
export function updateMediaSession(opts = {}) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return;
  }
  const ms = navigator.mediaSession;
  const {
    title,
    artist = "",
    album = BRAND,
    artworkUrl = "",
    kind = "music",
    onPlay,
    onPause,
    onPrevious,
    onNext,
    onSeekTo,
    duration,
    position,
    playing,
  } = opts;

  try {
    ms.metadata = new MediaMetadata({
      title: title || BRAND,
      artist: artist || (kind === "video" ? "MovieHunter" : "Unknown artist"),
      album: album || BRAND,
      artwork: artworkUrl
        ? [
            { src: artworkUrl, sizes: "512x512", type: "image/jpeg" },
            { src: artworkUrl, sizes: "256x256", type: "image/jpeg" },
          ]
        : [],
    });
  } catch {
    /* MediaMetadata unsupported */
  }

  const bind = (action, handler) => {
    try {
      if (handler) ms.setActionHandler(action, handler);
      else ms.setActionHandler(action, null);
    } catch {
      /* action not supported */
    }
  };

  bind("play", onPlay || null);
  bind("pause", onPause || null);
  bind("previoustrack", onPrevious || null);
  bind("nexttrack", onNext || null);
  bind("seekto", onSeekTo || null);

  if (typeof playing === "boolean") {
    try {
      ms.playbackState = playing ? "playing" : "paused";
    } catch {
      /* ignore */
    }
  }

  if (
    typeof duration === "number" &&
    duration > 0 &&
    typeof position === "number" &&
    typeof ms.setPositionState === "function"
  ) {
    try {
      ms.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(Math.max(0, position), duration),
      });
    } catch {
      /* ignore */
    }
  }
}

export function clearMediaSession() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return;
  }
  const ms = navigator.mediaSession;
  try {
    ms.metadata = null;
  } catch {
    /* ignore */
  }
  for (const action of [
    "play",
    "pause",
    "previoustrack",
    "nexttrack",
    "seekto",
  ]) {
    try {
      ms.setActionHandler(action, null);
    } catch {
      /* ignore */
    }
  }
  try {
    ms.playbackState = "none";
  } catch {
    /* ignore */
  }
}
