"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MediaController,
  MediaControlBar,
  MediaTimeRange,
  MediaTimeDisplay,
  MediaVolumeRange,
  MediaPlaybackRateButton,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaMuteButton,
  MediaFullscreenButton,
  MediaLoadingIndicator,
  MediaErrorDialog,
} from "media-chrome/react";
import {
  formatBytes,
  pickDefaultIndex,
  proxiedMediaUrl,
  resolveStreams,
} from "../lib/stream";
import {
  applySyncToTrack,
  cleanSearchTitle,
  cueAtTime,
  fileToSubtitleTrack,
  formatClock,
  formatOffsetLabel,
  makeSubtitleTrack,
  referenceCue,
  searchCuesByDialogue,
  shortSubtitleLabel,
} from "../lib/subtitles";
import BtnSpinner from "./BtnSpinner";
import CustomSelect from "./CustomSelect";
import {
  Settings,
  Subtitles,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Search,
  MessageSquare,
  Sparkles,
  Wand2,
  Upload,
  RotateCcw,
  X,
  Check,
  Palette,
  Globe,
  Download,
  FastForward,
} from "lucide-react";

import styles from "./StreamPlayer.module.css";
import { friendlyError, friendlyPlaybackError } from "../lib/errors";
import {
  clearMediaSession,
  setPageTitle,
  updateMediaSession,
} from "../lib/pageMedia";

const SUB_SETTINGS_KEY = "@moviehunter_subtitle_settings";
const DEFAULT_SUB_SETTINGS = {
  fontSize: 18,
  bgColor: "rgba(0,0,0,0.65)",
  textColor: "#ffffff",
  elevation: 0,
};

const SUB_LANGUAGES = [
  { id: "en", label: "EN" },
  { id: "hi", label: "HI" },
  { id: "ur", label: "UR" },
  { id: "ar", label: "AR" },
  { id: "es", label: "ES" },
  { id: "fr", label: "FR" },
  { id: "all", label: "ALL" },
];

const FONT_SIZES = [
  { id: "sm", label: "Small", size: 14 },
  { id: "md", label: "Normal", size: 18 },
  { id: "lg", label: "Large", size: 22 },
  { id: "xl", label: "Extra", size: 28 },
];

const BG_STYLES = [
  { id: "translucent", label: "Translucent", bg: "rgba(0,0,0,0.65)" },
  { id: "solid", label: "Solid Black", bg: "rgba(0,0,0,0.95)" },
  { id: "clear", label: "Clear Outline", bg: "transparent" },
];

const TEXT_COLORS = [
  { id: "white", label: "White", color: "#ffffff" },
  { id: "yellow", label: "Yellow", color: "#f6c443" },
  { id: "cyan", label: "Cyan", color: "#38bdf8" },
];

const POSITIONS = [
  { id: "bottom", label: "Bottom", elevation: 0 },
  { id: "elevated", label: "Elevated", elevation: 32 },
];

const DISPLAY_MODES = [
  { id: "fit", label: "Fit", hint: "Full video visible", fit: "contain", scale: 1 },
  { id: "stretch", label: "Stretch", hint: "Fill, may distort", fit: "fill", scale: 1 },
  { id: "cover", label: "Fill", hint: "Crop edges", fit: "cover", scale: 1 },
  { id: "zoom", label: "Zoom", hint: "Larger view", fit: "contain", scale: 1.18 },
];

// Render overlays inside the fullscreen element so they stay visible when expanded.
function FullscreenPortal({ children }) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    const sync = () => {
      setTarget(
        document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.body
      );
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  if (!target) return null;
  return createPortal(children, target);
}

export default function StreamPlayer({
  subjectId,
  detailPath,
  se = "0",
  ep = "0",
  title = "",
  prevEpisode = null,
  nextEpisode = null,
  onPrevEpisode = null,
  onNextEpisode = null,
}) {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [sources, setSources] = useState([]);
  const [qualityIndex, setQualityIndex] = useState(0);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [navBusy, setNavBusy] = useState(null);
  const [subtitles, setSubtitles] = useState([]);
  const [activeSubId, setActiveSubId] = useState("off");
  const [subPanelOpen, setSubPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState("fit");
  const [subError, setSubError] = useState("");
  const [cueText, setCueText] = useState("");
  const [videoTime, setVideoTime] = useState(0);
  const [osResults, setOsResults] = useState([]);
  const [osStatus, setOsStatus] = useState("idle");
  const [osMessage, setOsMessage] = useState("");
  const [osLoadingId, setOsLoadingId] = useState(null);
  const [dialogueQuery, setDialogueQuery] = useState("");
  const [dialogueSyncToast, setDialogueSyncToast] = useState("");
  const [syncTab, setSyncTab] = useState("smart");
  const [subPanelTab, setSubPanelTab] = useState("search"); // "search" | "sync" | "style"
  const [keywordQuery, setKeywordQuery] = useState("");
  const [selectedLang, setSelectedLang] = useState("en");
  const [subSettings, setSubSettings] = useState(DEFAULT_SUB_SETTINGS);

  // Load saved subtitle appearance preferences
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SUB_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          setSubSettings((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {}
  }, []);

  const updateSubSetting = (key, val) => {
    setSubSettings((prev) => {
      const updated = { ...prev, [key]: val };
      try {
        localStorage.setItem(SUB_SETTINGS_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const resumeAtRef = useRef(0);
  const activeTrackRef = useRef(null);
  const cueElRef = useRef(null);
  const lastCueRef = useRef("");
  const lastClockPaintRef = useRef(0);
  const videoRetryCount = useRef(0);
  const videoRetryTimer = useRef(null);

  // Hold-to-2x playback states and refs
  const [hold2xActive, setHold2xActive] = useState(false);
  const isHolding2xRef = useRef(false);
  const holdTimerRef = useRef(null);
  const prevRateRef = useRef(1);
  const suppressClickRef = useRef(false);
  const pointerDownPosRef = useRef(null);

  const endHoldSpeed = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (isHolding2xRef.current) {
      isHolding2xRef.current = false;
      setHold2xActive(false);
      if (videoRef.current) {
        videoRef.current.playbackRate = prevRateRef.current || 1;
      }
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 120);
    }
  }, []);

  const handlePointerDown = useCallback((e) => {
    // Only primary mouse button or touch/pen
    if (e.pointerType === "mouse" && e.button !== 0) return;

    // Ignore interactive controls, buttons, sliders, dialogs
    const isInteractive = Boolean(
      e.target?.closest?.(
        `button, a, input, select, textarea, media-play-button, media-time-range, media-volume-range, media-playback-rate-button, media-fullscreen-button, media-mute-button, media-seek-backward-button, media-seek-forward-button, [role="button"], .${styles.controlsWrapper}, .${styles.centerNavBtn}, .${styles.settingsPanel}, .${styles.subPanel}, .${styles.retry}`
      )
    );
    if (isInteractive) return;

    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };

    if (!videoRef.current) return;
    prevRateRef.current = videoRef.current.playbackRate || 1;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }

    holdTimerRef.current = setTimeout(() => {
      if (!videoRef.current) return;
      isHolding2xRef.current = true;
      suppressClickRef.current = true;
      setHold2xActive(true);
      videoRef.current.playbackRate = 2;
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
    }, 220);

    const onWindowPointerMove = (moveEvt) => {
      if (pointerDownPosRef.current && !isHolding2xRef.current) {
        const dx = moveEvt.clientX - pointerDownPosRef.current.x;
        const dy = moveEvt.clientY - pointerDownPosRef.current.y;
        if (Math.hypot(dx, dy) > 20) {
          if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
          }
        }
      }
    };

    const onWindowPointerUp = () => {
      endHoldSpeed();
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerUp);
    };

    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);
  }, [endHoldSpeed]);

  const handlePointerUp = useCallback(() => {
    endHoldSpeed();
  }, [endHoldSpeed]);

  const handleClickCapture = useCallback((e) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  }, []);

  // Cleanup hold timer on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Mobile expand → prefer landscape while fullscreen
  useEffect(() => {
    if (!mounted) return;

    const onFullscreen = async () => {
      const fsEl =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        null;
      try {
        if (fsEl && screen.orientation?.lock) {
          await screen.orientation.lock("landscape");
        } else if (!fsEl && screen.orientation?.unlock) {
          screen.orientation.unlock();
        }
      } catch {
        // lock not allowed on some browsers until gesture / desktop
      }
    };

    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
      try {
        screen.orientation?.unlock?.();
      } catch {
        // ignore
      }
    };
  }, [mounted]);

  const displayTitle = useMemo(() => {
    const base = cleanSearchTitle(title, detailPath) || title || detailPath || "Player";
    if (Number(se) > 0 || Number(ep) > 0) return `${base} · S${se}E${ep}`;
    return base;
  }, [title, detailPath, se, ep]);

  const searchQuery = useMemo(
    () => cleanSearchTitle(title, detailPath),
    [title, detailPath]
  );

  useEffect(() => {
    setPageTitle(displayTitle);
  }, [displayTitle]);

  useEffect(() => {
    const video = videoRef.current;
    if (!mounted || !video) return;

    let lastPosAt = 0;
    const syncSession = (forcePos = false) => {
      const now = Date.now();

      if (!forcePos && now - lastPosAt < 900) {
        try {
          navigator.mediaSession.playbackState =
            !video.paused && !video.ended ? "playing" : "paused";
        } catch {
          // ignore
        }
        return;
      }
      lastPosAt = now;

      if (video.currentTime > 5 && !video.ended) {
        try {
          localStorage.setItem(`history_${subjectId}_${se}_${ep}`, video.currentTime.toString());
        } catch {}
      }
      updateMediaSession({
        title: displayTitle,
        artist: "MovieHunter",
        album: "Now playing",
        kind: "video",
        playing: !video.paused && !video.ended,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
        position: video.currentTime || 0,
        onPlay: () => {
          video.play().catch(() => {});
        },
        onPause: () => {
          video.pause();
        },
        onPrevious: onPrevEpisode || null,
        onNext: onNextEpisode || null,
        onSeekTo: (details) => {
          if (details?.seekTime == null) return;
          video.currentTime = details.seekTime;
        },
      });
    };

    const onPlayPause = () => syncSession(true);
    const onTime = () => syncSession(false);
    syncSession(true);
    video.addEventListener("play", onPlayPause);
    video.addEventListener("pause", onPlayPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onPlayPause);
    return () => {
      video.removeEventListener("play", onPlayPause);
      video.removeEventListener("pause", onPlayPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onPlayPause);
    };
  }, [mounted, displayTitle, onPrevEpisode, onNextEpisode]);

  useEffect(() => {
    return () => {
      clearMediaSession();
    };
  }, []);

  useEffect(() => {
    if (!subPanelOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSubPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subPanelOpen]);

  const load = useCallback(async () => {
    if (!subjectId || !detailPath) {
      setError("Missing subjectId or detail_path");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setError("");
    setActiveSubId("off");
    setCueText("");
    try {
      const result = await resolveStreams({
        subjectId,
        detailPath,
        se,
        ep,
      });
      if (!result.sources.length) {
        throw new Error("No playable streams returned");
      }
      setSources(result.sources);
      setQualityIndex(pickDefaultIndex(result.sources));
      setStatus("ready");
    } catch (err) {
      setError(friendlyPlaybackError(err));
      setStatus("error");
    }
  }, [subjectId, detailPath, se, ep]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (status === "ready" || status === "error") setNavBusy(null);
  }, [status, se, ep]);

  // Auto-search and auto-activate subtitles for every video/episode played
  useEffect(() => {
    if (status !== "ready" || !searchQuery) return;

    let cancelled = false;

    const autoFetchSubtitle = async () => {
      try {
        const params = new URLSearchParams({
          query: searchQuery,
          languages: "en",
        });
        if (Number(se) > 0) params.set("season", String(se));
        if (Number(ep) > 0) params.set("episode", String(ep));
        if (Number(se) > 0 || Number(ep) > 0) params.set("type", "episode");
        else params.set("type", "movie");

        const res = await fetch(`/api/subtitles/search?${params}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled || !data.ok || !data.results?.length) return;

        // Auto-select the top subtitle result
        const topItem = data.results[0];
        if (!topItem?.file_id) return;

        const dlRes = await fetch("/api/subtitles/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_id: topItem.file_id }),
        });
        const dlData = await dlRes.json().catch(() => ({}));
        if (cancelled || !dlData.ok || !dlData.vtt) return;

        const track = makeSubtitleTrack({
          vttText: dlData.vtt,
          label: dlData.label || topItem.file_name,
          srclang: String(topItem.language || "en").slice(0, 8),
          source: "subdl",
          fileId: topItem.file_id,
        });

        if (cancelled) return;
        setSubtitles((prev) => {
          const exists = prev.some((t) => t.fileId === topItem.file_id);
          return exists ? prev : [...prev, track];
        });
        setActiveSubId(track.id);
      } catch (err) {
        // Ignore auto-fetch failure silently
      }
    };

    autoFetchSubtitle();

    return () => {
      cancelled = true;
    };
  }, [status, searchQuery, se, ep]);

  const busy = status === "loading" || Boolean(navBusy);

  const goPrev = () => {
    if (busy || !onPrevEpisode) return;
    setNavBusy("prev");
    onPrevEpisode();
  };

  const goNext = () => {
    if (busy || !onNextEpisode) return;
    setNavBusy("next");
    onNextEpisode();
  };

  const active = sources[qualityIndex] || null;
  const src = useMemo(
    () => (active ? proxiedMediaUrl(active.url) : ""),
    [active]
  );

  const activeTrack = useMemo(
    () => subtitles.find((t) => t.id === activeSubId) || null,
    [subtitles, activeSubId]
  );

  useEffect(() => {
    activeTrackRef.current = activeTrack;
    if (!activeTrack) setCueText("");
  }, [activeTrack]);

  useEffect(() => {
    if (!mounted) return;
    const video = videoRef.current;
    if (!video || !src) return;
    let resume = resumeAtRef.current;

    // Reset retry counter every time the src changes (new episode or quality change)
    videoRetryCount.current = 0;
    clearTimeout(videoRetryTimer.current);

    if (resume === 0) {
      try {
        const saved = localStorage.getItem(`history_${subjectId}_${se}_${ep}`);
        if (saved && !isNaN(Number(saved))) {
          resume = Number(saved);
        }
      } catch {}
    }

    video.src = src;
    video.load();
    const onReady = () => {
      if (resume > 0) {
        try {
          video.currentTime = resume;
        } catch {
          // ignore
        }
      }
      video.play().catch(() => {});
    };
    video.addEventListener("loadeddata", onReady, { once: true });

    // Auto-retry on network errors (e.g. 429 rate-limit from CDN proxy).
    // Saves current position, waits with exponential backoff, then reloads src.
    const MAX_RETRIES = 4;
    const onVideoError = () => {
      const err = video.error;
      // Only retry on network errors (code 2) or decode errors (code 3).
      // Don't retry on src-not-found (code 4) which is a config error.
      if (!err || err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return;
      if (videoRetryCount.current >= MAX_RETRIES) return;

      const attempt = videoRetryCount.current + 1;
      videoRetryCount.current = attempt;
      // Save position before reloading so we can resume at the same spot
      const savedTime = video.currentTime || 0;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 10000); // 1s, 2s, 4s, 8s

      videoRetryTimer.current = setTimeout(() => {
        if (!videoRef.current) return;
        videoRef.current.src = src;
        videoRef.current.load();
        const onRetryReady = () => {
          if (savedTime > 0) {
            try { videoRef.current.currentTime = savedTime; } catch { // ignore
            }
          }
          videoRef.current.play().catch(() => {});
        };
        videoRef.current.addEventListener("loadeddata", onRetryReady, { once: true });
      }, delay);
    };

    video.addEventListener("error", onVideoError);
    return () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onVideoError);
      clearTimeout(videoRetryTimer.current);
    };
  }, [mounted, src]);

  // Tie subtitle lines to video.currentTime (+ sync offset)
  useEffect(() => {
    if (!mounted) return;
    const video = videoRef.current;
    if (!video) return;

    lastCueRef.current = "\0";
    let raf = 0;
    let looping = false;

    const paintCue = (text) => {
      lastCueRef.current = text;
      if (cueElRef.current) {
        cueElRef.current.textContent = text;
        cueElRef.current.hidden = !text;
      }
    };

    const update = () => {
      const t = video.currentTime || 0;
      const now = performance.now();
      if (now - lastClockPaintRef.current > 200) {
        lastClockPaintRef.current = now;
        setVideoTime(t);
      }
      const track = activeTrackRef.current;
      if (!track?.cues?.length) {
        if (lastCueRef.current) {
          paintCue("");
          setCueText("");
        }
        return;
      }
      const next = cueAtTime(
        track.cues,
        t,
        track.offset || 0,
        track.rate || 1
      );
      if (next !== lastCueRef.current) {
        paintCue(next);
        setCueText(next);
      }
    };

    const loop = () => {
      update();
      if (!video.paused && !video.ended) {
        raf = requestAnimationFrame(loop);
      } else {
        looping = false;
      }
    };

    const ensureLoop = () => {
      update();
      if (!looping && !video.paused && !video.ended) {
        looping = true;
        raf = requestAnimationFrame(loop);
      }
    };

    update();
    video.addEventListener("play", ensureLoop);
    video.addEventListener("playing", ensureLoop);
    video.addEventListener("pause", update);
    video.addEventListener("seeked", update);
    video.addEventListener("timeupdate", update);
    if (!video.paused) ensureLoop();

    return () => {
      cancelAnimationFrame(raf);
      looping = false;
      video.removeEventListener("play", ensureLoop);
      video.removeEventListener("playing", ensureLoop);
      video.removeEventListener("pause", update);
      video.removeEventListener("seeked", update);
      video.removeEventListener("timeupdate", update);
    };
  }, [mounted, activeSubId, activeTrack?.id, activeTrack?.offset, activeTrack?.rate]);


  useEffect(() => {
    setKeywordQuery(searchQuery || "");
  }, [searchQuery]);

  const searchSubdl = useCallback(async () => {
    const q = (keywordQuery || searchQuery || "").trim();
    if (!q) {
      setOsMessage("Please enter a title or keyword to search");
      return;
    }
    setOsStatus("loading");
    setOsMessage("");
    setOsResults([]);
    try {
      const langParam = selectedLang === "all" ? "en,hi,ur,ar,es,fr,de,tr" : selectedLang;
      const params = new URLSearchParams({
        query: q,
        languages: langParam,
      });
      if (Number(se) > 0) params.set("season", String(se));
      if (Number(ep) > 0) params.set("episode", String(ep));
      if (Number(se) > 0 || Number(ep) > 0) params.set("type", "episode");
      else params.set("type", "movie");

      const res = await fetch(`/api/subtitles/search?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!data.configured) {
        setOsStatus("need_key");
        setOsMessage("Online subtitles aren't set up yet.");
        return;
      }
      if (!data.ok) throw new Error(data.error || "Search failed");
      const list = Array.isArray(data.results) ? data.results : [];
      setOsResults(list);
      setOsStatus("ready");
      setOsMessage(
        list.length
          ? `Found ${list.length} subtitles · click any to download and activate`
          : "No subtitles found. Try different keywords or select ALL languages."
      );
    } catch (err) {
      setOsStatus("error");
      setOsMessage(friendlyError(err, "Subtitle search didn't work. Try again."));
      setOsResults([]);
    }
  }, [keywordQuery, searchQuery, selectedLang, se, ep]);

  const onQualityChange = (e) => {
    const video = videoRef.current;
    resumeAtRef.current = video?.currentTime || 0;
    setQualityIndex(Number(e.target.value));
  };

  const onUploadSubtitle = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubError("");
    try {
      const track = await fileToSubtitleTrack(file);
      setSubtitles((prev) => [...prev, track]);
      setActiveSubId(track.id);
      setSubPanelOpen(true);
      setOsMessage(
        `Uploaded ${track.cues.length} lines. Use Sync to match the video clock.`
      );
    } catch (err) {
      setSubError(friendlyError(err, "Couldn’t load that subtitle file."));
    }
  };

  const setOffset = (value) => {
    if (!activeTrack) return;
    setSubtitles((prev) =>
      prev.map((t) =>
        t.id === activeTrack.id
          ? applySyncToTrack(t, { offset: value })
          : t
      )
    );
  };

  const setRate = (value) => {
    if (!activeTrack) return;
    setSubtitles((prev) =>
      prev.map((t) =>
        t.id === activeTrack.id ? applySyncToTrack(t, { rate: value }) : t
      )
    );
  };

  const nudgeOffset = (delta) => {
    if (!activeTrack) return;
    setOffset(Math.round((activeTrack.offset + delta) * 10) / 10);
  };

  // Pin the current/next subtitle line to the current video time.
  const alignLineToNow = () => {
    if (!activeTrack?.cues?.length) return;
    const t = videoRef.current?.currentTime ?? videoTime;
    const { cue } = referenceCue(
      activeTrack.cues,
      t,
      activeTrack.offset || 0,
      activeTrack.rate || 1
    );
    if (!cue) return;
    const rate = activeTrack.rate || 1;
    const nextOffset = t - cue.start * rate;
    setOffset(Math.round(nextOffset * 10) / 10);
  };

  const jumpToCue = (dir) => {
    if (!activeTrack?.cues?.length) return;
    const { index } = referenceCue(
      activeTrack.cues,
      videoTime,
      activeTrack.offset || 0,
      activeTrack.rate || 1
    );
    const next = Math.max(0, Math.min(activeTrack.cues.length - 1, index + dir));
    const cue = activeTrack.cues[next];
    const video = videoRef.current;
    if (!video || !cue) return;
    const rate = activeTrack.rate || 1;
    video.currentTime = cue.start * rate + (activeTrack.offset || 0);
  };

  const removeTrack = (id) => {
    setSubtitles((prev) => prev.filter((t) => t.id !== id));
    if (activeSubId === id) {
      setActiveSubId("off");
      setCueText("");
    }
  };

  const dialogueMatches = useMemo(() => {
    if (!activeTrack?.cues?.length || !dialogueQuery.trim()) return [];
    return searchCuesByDialogue(activeTrack.cues, dialogueQuery, {
      currentTime: videoTime,
      rate: activeTrack.rate || 1,
      maxResults: 8,
    });
  }, [activeTrack, dialogueQuery, videoTime]);

  const syncDialogueCue = (item) => {
    if (!activeTrack || item?.suggestedOffset == null) return;
    setOffset(item.suggestedOffset);
    const snippet = item.text.length > 28 ? `${item.text.slice(0, 28)}…` : item.text;
    setDialogueSyncToast(
      `Synced! Shifted by ${formatOffsetLabel(item.suggestedOffset)} for “${snippet}”`
    );
    setTimeout(() => setDialogueSyncToast(""), 4500);
  };


  const loadOsSubtitle = async (item) => {
    setOsLoadingId(item.file_id);
    setSubError("");
    try {
      const res = await fetch("/api/subtitles/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: item.file_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || "Download failed");
      const track = makeSubtitleTrack({
        vttText: data.vtt,
        label: data.label || item.file_name,
        srclang: String(item.language || "en").slice(0, 8),
        source: "subdl",
        fileId: item.file_id,
      });
      setSubtitles((prev) => [...prev, track]);
      setActiveSubId(track.id);
      setOsMessage(
        `On · ${track.label} (${track.cues.length} lines). Drag Sync if text is early/late.`
      );
      setOsResults([]);
    } catch (err) {
      setSubError(friendlyError(err, "Couldn’t download that subtitle."));
    } finally {
      setOsLoadingId(null);
    }
  };

  const subButtonLabel =
    activeTrack == null
      ? "Subtitles · Off"
      : `Subtitles · ${activeTrack.label}${
          activeTrack.offset
            ? ` ${formatOffsetLabel(activeTrack.offset)}`
            : ""
        }`;

  const displayActive =
    DISPLAY_MODES.find((m) => m.id === displayMode) || DISPLAY_MODES[0];

  return (
    <div className={styles.wrap}>
      <header className={styles.toolbar}>
        <div className={styles.titleRow}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{displayTitle}</h1>
            <p className={styles.meta}>
              {Number(se) > 0 || Number(ep) > 0 ? `S${se}E${ep}` : "Movie"}
              {active ? ` · ${active.resolution}` : ""}
            </p>
          </div>
        </div>
      </header>

      {settingsOpen ? (
        <FullscreenPortal>
        <div
          className={styles.settingsModal}
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={styles.subBackdrop}
            aria-label="Close settings"
            onClick={(e) => {
              e.stopPropagation();
              setSettingsOpen(false);
            }}
          />
          <section
            className={styles.settingsPanel}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <div className={styles.settingsHead}>
              <h2>Settings</h2>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setSettingsOpen(false);
                }}
              >
                Close
              </button>
            </div>

            <label className={styles.settingsField}>
              <span>Quality</span>
              <select
                className={styles.select}
                value={qualityIndex}
                onChange={onQualityChange}
                disabled={!sources.length}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {sources.map((s, i) => {
                  const size = formatBytes(s.size_bytes);
                  return (
                    <option key={s.id || s.url} value={i}>
                      {s.resolution}
                      {size ? ` · ${size}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>

            <div className={styles.settingsField}>
              <span>Display</span>
              <div className={styles.displayGrid}>
                {DISPLAY_MODES.map((m) => (
                  <div
                    key={m.id}
                    role="button"
                    tabIndex={0}
                    className={`${styles.displayChip} ${
                      displayMode === m.id ? styles.displayChipOn : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDisplayMode(m.id);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setDisplayMode(m.id);
                      }
                    }}
                  >
                    <strong>{m.label}</strong>
                    <span>{m.hint}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              className={`${styles.settingsAction} ${
                subPanelOpen ? styles.subToggleOn : ""
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setSettingsOpen(false);
                setSubPanelOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span>Subtitles</span>
              <span className={styles.settingsActionMeta}>{subButtonLabel}</span>
            </button>
          </section>
        </div>
        </FullscreenPortal>
      ) : null}

      {subPanelOpen ? (
        <FullscreenPortal>
        <div
          className={styles.subModal}
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={styles.subBackdrop}
            aria-label="Close subtitles"
            onClick={(e) => {
              e.stopPropagation();
              setSubPanelOpen(false);
            }}
          />
          <section
            className={styles.subPanel}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
          <div className={styles.subPanelHeader}>
            <div className={styles.subPanelTitleGroup}>
              <div className={styles.aiBadge}>
                <Sparkles size={13} className={styles.aiSparkleIcon} />
                <span>AI SUBTITLES</span>
              </div>
              {activeTrack ? (
                <span className={styles.activeTrackBadge} title={activeTrack.label}>
                  <span className={styles.activeDot} />
                  {activeTrack.label}
                </span>
              ) : (
                <span className={styles.inactiveTrackBadge}>Off</span>
              )}
            </div>
            <button
              type="button"
              className={styles.iconCloseBtn}
              onClick={() => setSubPanelOpen(false)}
              title="Close subtitles"
            >
              <X size={15} />
            </button>
          </div>

          <div className={styles.mainNav}>
            <button
              type="button"
              className={subPanelTab === "search" ? styles.mainNavBtnActive : styles.mainNavBtn}
              onClick={() => setSubPanelTab("search")}
            >
              <Search size={13} />
              <span>Search & Tracks</span>
            </button>
            <button
              type="button"
              className={subPanelTab === "sync" ? styles.mainNavBtnActive : styles.mainNavBtn}
              onClick={() => setSubPanelTab("sync")}
            >
              <Sparkles size={13} />
              <span>AI Sync & Timing</span>
            </button>
            <button
              type="button"
              className={subPanelTab === "style" ? styles.mainNavBtnActive : styles.mainNavBtn}
              onClick={() => setSubPanelTab("style")}
            >
              <Palette size={13} />
              <span>Appearance</span>
            </button>
          </div>

          {subPanelTab === "search" ? (
            <div className={styles.tabContent}>
              <div className={styles.subActionRow}>
                <button
                  type="button"
                  className={activeSubId === "off" ? styles.miniChipActive : styles.miniChip}
                  onClick={() => {
                    setActiveSubId("off");
                    setCueText("");
                  }}
                >
                  Off
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".srt,.vtt,.txt,.ass,.ssa,text/vtt,application/x-subrip"
                  className={styles.fileInput}
                  onChange={onUploadSubtitle}
                />
                <button
                  type="button"
                  className={styles.miniChip}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={12} />
                  <span>Upload File</span>
                </button>
              </div>

              <div className={styles.searchCard}>
                <div className={styles.searchHeader}>
                  <Globe size={13} />
                  <span className={styles.searchCardTitle}>Search Online Subtitles (SubDL)</span>
                </div>

                <div className={styles.keywordInputWrap}>
                  <Search size={13} className={styles.inputIcon} />
                  <input
                    type="text"
                    className={styles.keywordInput}
                    placeholder="Search title, movie, series, or keywords..."
                    value={keywordQuery}
                    onChange={(e) => setKeywordQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchSubdl();
                      }
                    }}
                  />
                  {keywordQuery ? (
                    <button
                      type="button"
                      className={styles.keywordClearBtn}
                      onClick={() => setKeywordQuery("")}
                      title="Clear keyword"
                    >
                      <X size={13} />
                    </button>
                  ) : null}
                </div>

                <div className={styles.langRow}>
                  <span className={styles.langLabel}>Lang:</span>
                  <div className={styles.langScroll}>
                    {SUB_LANGUAGES.map((lang) => (
                      <button
                        key={lang.id}
                        type="button"
                        className={selectedLang === lang.id ? styles.langChipActive : styles.langChip}
                        onClick={() => setSelectedLang(lang.id)}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.searchSubmitBtn}
                  onClick={searchSubdl}
                  disabled={osStatus === "loading"}
                >
                  {osStatus === "loading" ? (
                    <BtnSpinner />
                  ) : (
                    <>
                      <Search size={13} />
                      <span>Search SubDL</span>
                    </>
                  )}
                </button>
              </div>

              {subError ? <div className={styles.subError}>{subError}</div> : null}
              {osMessage ? (
                <div
                  className={
                    osStatus === "need_key" || osStatus === "error"
                      ? styles.subError
                      : styles.banner
                  }
                >
                  {osMessage}
                </div>
              ) : null}

              {osResults.length > 0 ? (
                <div className={styles.osList}>
                  <div className={styles.osHead}>Online results ({osResults.length}) — click to use</div>
                  <ul>
                    {osResults.map((item) => {
                      const label = shortSubtitleLabel(
                        item.release || item.file_name,
                        item.language
                      );
                      const loading = osLoadingId === item.file_id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => loadOsSubtitle(item)}
                            title={item.release || item.file_name}
                          >
                            <span className={styles.osLang}>
                              {String(item.language || "en").slice(0, 7)}
                            </span>
                            <span className={styles.osName}>{label}</span>
                            <span className={styles.osMeta}>
                              {loading ? (
                                <BtnSpinner />
                              ) : (
                                `${item.download_count ? `${item.download_count} dl` : "Use"}`
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {subtitles.length > 0 ? (
                <div className={styles.loadedSection}>
                  <div className={styles.sectionHeader}>Loaded Subtitles</div>
                  <div className={styles.loadedStrip}>
                    {subtitles.map((t) => (
                      <div
                        key={t.id}
                        className={t.id === activeSubId ? styles.loadedPillActive : styles.loadedPill}
                      >
                        <button
                          type="button"
                          className={styles.loadedSelectBtn}
                          onClick={() => setActiveSubId(t.id)}
                        >
                          <span className={styles.loadedLabel}>{t.label}</span>
                          <span className={styles.loadedCount}>{t.cues.length} lines</span>
                        </button>
                        <button
                          type="button"
                          className={styles.loadedRemoveBtn}
                          onClick={() => removeTrack(t.id)}
                          title="Remove track"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {subPanelTab === "sync" ? (
            <div className={styles.tabContent}>
              {!activeTrack ? (
                <div className={styles.emptyCard}>
                  <p className={styles.emptyCardTitle}>No Subtitle Track Selected</p>
                  <p className={styles.emptyCardText}>
                    Search online or select a loaded subtitle track in &quot;Search &amp; Tracks&quot; to adjust sync timing.
                  </p>
                </div>
              ) : (
                <div className={styles.syncCard}>
                  <div className={styles.segmentedTabs}>
                    <button
                      type="button"
                      className={syncTab === "smart" ? styles.segmentActive : styles.segmentBtn}
                      onClick={() => setSyncTab("smart")}
                    >
                      <Sparkles size={12} />
                      <span>AI Dialogue Sync</span>
                    </button>
                    <button
                      type="button"
                      className={syncTab === "manual" ? styles.segmentActive : styles.segmentBtn}
                      onClick={() => setSyncTab("manual")}
                    >
                      <SlidersHorizontal size={12} />
                      <span>Manual Timing</span>
                    </button>
                  </div>

                  {syncTab === "smart" ? (
                    <div className={styles.smartTabContent}>
                      <div className={styles.dialoguePromptBox}>
                        <div className={styles.dialoguePromptHeader}>
                          <MessageSquare size={13} className={styles.aiGlowIcon} />
                          <span>Heard words out of sync? Type them to auto-align:</span>
                        </div>
                        <div className={styles.dialogueInputWrap}>
                          <Search size={13} className={styles.dialogueSearchIcon} />
                          <input
                            type="text"
                            className={styles.dialogueInput}
                            placeholder="e.g. hello brother, wait for me..."
                            value={dialogueQuery}
                            onChange={(e) => setDialogueQuery(e.target.value)}
                          />
                          {dialogueQuery ? (
                            <button
                              type="button"
                              className={styles.dialogueClearBtn}
                              onClick={() => setDialogueQuery("")}
                              title="Clear search"
                            >
                              <X size={12} />
                            </button>
                          ) : null}
                        </div>

                        {dialogueSyncToast ? (
                          <div className={styles.dialogueToast}>
                            <Check size={13} />
                            <span>{dialogueSyncToast}</span>
                          </div>
                        ) : null}

                        {dialogueMatches.length > 0 ? (
                          <div className={styles.dialogueList}>
                            {dialogueMatches.map((m) => (
                              <div key={m.index} className={styles.dialogueItem}>
                                <div className={styles.dialogueInfo}>
                                  <p className={styles.dialogueText}>&quot;{m.text}&quot;</p>
                                  <span className={styles.dialogueMeta}>
                                    Subtitle clock: {formatClock(m.start)} · Needed: {formatOffsetLabel(m.suggestedOffset)}
                                  </span>
                                </div>
                                <div className={styles.dialogueActions}>
                                  <button
                                    type="button"
                                    className={styles.dialogueSyncBtn}
                                    onClick={() => syncDialogueCue(m)}
                                  >
                                    <Sparkles size={11} />
                                    <span>Sync Here</span>
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.dialogueJumpBtn}
                                    onClick={() => {
                                      if (videoRef.current) {
                                        videoRef.current.currentTime =
                                          m.start * (activeTrack.rate || 1) + (activeTrack.offset || 0);
                                      }
                                    }}
                                  >
                                    Jump
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : dialogueQuery.trim().length > 1 ? (
                          <p className={styles.dialogueEmpty}>No matching dialogue found in this subtitle track.</p>
                        ) : null}
                      </div>

                      <div className={styles.currentSpeechBox}>
                        <div className={styles.currentSpeechTop}>
                          <span className={styles.microLabel}>CURRENT TIMELINE CUE</span>
                          <span className={styles.clockTag}>Video {formatClock(videoTime)}</span>
                        </div>
                        <p className={styles.currentSpeechText}>
                          {cueText ? `"${cueText.replace(/\n/g, " ")}"` : "Silence / no line at this timestamp"}
                        </p>
                        <div className={styles.quickAlignRow}>
                          <button
                            type="button"
                            className={styles.navCueBtn}
                            onClick={() => jumpToCue(-1)}
                            title="Previous line"
                          >
                            <SkipBack size={12} />
                            <span>Prev</span>
                          </button>
                          <button
                            type="button"
                            className={styles.aiSyncNowBtn}
                            onClick={alignLineToNow}
                            title="Align current line to now"
                          >
                            <Wand2 size={12} />
                            <span>Align this line to now</span>
                          </button>
                          <button
                            type="button"
                            className={styles.navCueBtn}
                            onClick={() => jumpToCue(1)}
                            title="Next line"
                          >
                            <span>Next</span>
                            <SkipForward size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.manualTabContent}>
                      <div className={styles.offsetControlBox}>
                        <div className={styles.stepperTop}>
                          <span className={styles.microLabel}>SYNC OFFSET</span>
                          <span className={styles.offsetReadout}>
                            {formatOffsetLabel(activeTrack.offset)}
                          </span>
                        </div>
                        <div className={styles.stepperRow}>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => nudgeOffset(-5)}
                          >
                            -5s
                          </button>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => nudgeOffset(-1)}
                          >
                            -1s
                          </button>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => nudgeOffset(-0.5)}
                          >
                            -0.5s
                          </button>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => nudgeOffset(-0.2)}
                          >
                            -0.2s
                          </button>
                          <button
                            type="button"
                            className={styles.resetBtn}
                            onClick={() => setOffset(0)}
                            title="Reset to 0"
                          >
                            <RotateCcw size={12} />
                            <span>0s</span>
                          </button>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => nudgeOffset(0.2)}
                          >
                            +0.2s
                          </button>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => nudgeOffset(0.5)}
                          >
                            +0.5s
                          </button>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => nudgeOffset(1)}
                          >
                            +1s
                          </button>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => nudgeOffset(5)}
                          >
                            +5s
                          </button>
                        </div>
                        <input
                          type="range"
                          className={styles.compactSlider}
                          min={-120}
                          max={120}
                          step={0.1}
                          value={Math.max(-120, Math.min(120, activeTrack.offset || 0))}
                          onChange={(e) => setOffset(Number(e.target.value))}
                        />
                      </div>

                      <div className={styles.speedBox}>
                        <span className={styles.microLabel}>DRIFT CORRECTION (FRAME RATE)</span>
                        <div className={styles.speedBtnRow}>
                          <button
                            type="button"
                            className={
                              Math.abs((activeTrack.rate || 1) - 1) < 0.001
                                ? styles.miniSpeedActive
                                : styles.miniSpeedBtn
                            }
                            onClick={() => setRate(1)}
                          >
                            1.00x Normal
                          </button>
                          <button
                            type="button"
                            className={
                              Math.abs((activeTrack.rate || 1) - (23.976 / 25)) < 0.001
                                ? styles.miniSpeedActive
                                : styles.miniSpeedBtn
                            }
                            onClick={() => setRate(23.976 / 25)}
                          >
                            23.98 &rarr; 25 fps
                          </button>
                          <button
                            type="button"
                            className={
                              Math.abs((activeTrack.rate || 1) - (25 / 23.976)) < 0.001
                                ? styles.miniSpeedActive
                                : styles.miniSpeedBtn
                            }
                            onClick={() => setRate(25 / 23.976)}
                          >
                            25 &rarr; 23.98 fps
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {subPanelTab === "style" ? (
            <div className={styles.tabContent}>
              <div className={styles.previewBox}>
                <span className={styles.microLabel}>LIVE PREVIEW</span>
                <div className={styles.previewStage}>
                  <div
                    className={`${styles.previewSubWrap} ${subSettings.bgColor === "transparent" ? styles.cueOutline : ""}`}
                    style={{
                      fontSize: `${subSettings.fontSize || 18}px`,
                      color: subSettings.textColor || "#ffffff",
                      backgroundColor: subSettings.bgColor || "rgba(0,0,0,0.65)",
                    }}
                  >
                    &ldquo;The quick brown fox jumps over the lazy dog&rdquo;
                  </div>
                </div>
              </div>

              <div className={styles.settingGroup}>
                <span className={styles.settingGroupTitle}>FONT SIZE</span>
                <div className={styles.settingOptionsRow}>
                  {FONT_SIZES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={subSettings.fontSize === item.size ? styles.settingPillActive : styles.settingPill}
                      onClick={() => updateSubSetting("fontSize", item.size)}
                    >
                      {item.label} ({item.size}px)
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingGroup}>
                <span className={styles.settingGroupTitle}>BACKGROUND STYLE</span>
                <div className={styles.settingOptionsRow}>
                  {BG_STYLES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={subSettings.bgColor === item.bg ? styles.settingPillActive : styles.settingPill}
                      onClick={() => updateSubSetting("bgColor", item.bg)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingGroup}>
                <span className={styles.settingGroupTitle}>TEXT COLOR</span>
                <div className={styles.settingOptionsRow}>
                  {TEXT_COLORS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={subSettings.textColor === item.color ? styles.settingPillActive : styles.settingPill}
                      onClick={() => updateSubSetting("textColor", item.color)}
                    >
                      <span className={styles.colorDot} style={{ backgroundColor: item.color }} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingGroup}>
                <span className={styles.settingGroupTitle}>VERTICAL POSITION</span>
                <div className={styles.settingOptionsRow}>
                  {POSITIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={(subSettings.elevation || 0) === item.elevation ? styles.settingPillActive : styles.settingPill}
                      onClick={() => updateSubSetting("elevation", item.elevation)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </section>
        </div>
        </FullscreenPortal>
      ) : null}

      {status === "error" ? (
        <div className={styles.error}>
          {error}
          <button
            type="button"
            className={styles.retry}
            onClick={load}
            disabled={status === "loading"}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className={styles.playerShell}>
        {mounted ? (
          <MediaController
            className={styles.controller}
            autohide="5"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClickCapture={handleClickCapture}
          >
            <video
              ref={videoRef}
              slot="media"
              playsInline
              preload="metadata"
              crossOrigin="anonymous"
              suppressHydrationWarning
              className={styles.video}
              style={{
                objectFit: displayActive.fit,
                transform:
                  displayActive.scale !== 1
                    ? `scale(${displayActive.scale})`
                    : undefined,
              }}
            />
            {hold2xActive ? (
              <div className={styles.speed2xBanner} aria-live="polite">
                <FastForward size={16} className={styles.speed2xIcon} />
                <span>2X Speed</span>
              </div>
            ) : null}
            <div
              ref={cueElRef}
              className={`${styles.cueOverlay} ${subSettings.bgColor === "transparent" ? styles.cueOutline : ""}`}
              style={{
                fontSize: `${subSettings.fontSize || 18}px`,
                color: subSettings.textColor || "#ffffff",
                backgroundColor: subSettings.bgColor || "rgba(0, 0, 0, 0.75)",
                transform: subSettings.elevation
                  ? `translateX(-50%) translateY(-${subSettings.elevation}px)`
                  : "translateX(-50%)",
              }}
              hidden
            />
            <div className={styles.centerOverlay}>
              {status === "loading" || busy ? (
                <div className={styles.bufferingLoader} style={{ display: "block" }} />
              ) : (
                <>
                  <div className={styles.bufferingLoader} />
                  {prevEpisode && onPrevEpisode ? (
                    <button
                      type="button"
                      className={styles.centerNavBtn}
                      onClick={goPrev}
                      disabled={busy}
                      aria-label="Previous episode"
                    >
                      <SkipBack size={32} fill="currentColor" strokeWidth={2} />
                    </button>
                  ) : null}
                  <MediaPlayButton />
                  {nextEpisode && onNextEpisode ? (
                    <button
                      type="button"
                      className={styles.centerNavBtn}
                      onClick={goNext}
                      disabled={busy}
                      aria-label="Next episode"
                    >
                      <SkipForward size={32} fill="currentColor" strokeWidth={2} />
                    </button>
                  ) : null}
                </>
              )}
            </div>
            <MediaErrorDialog />
            <div className={styles.controlsWrapper}>
              <MediaControlBar className={styles.timelineBar}>
                <MediaTimeRange />
              </MediaControlBar>
              <MediaControlBar className={styles.bottomBar}>
                <MediaPlayButton />
                <MediaMuteButton />
                <MediaVolumeRange />
                <MediaTimeDisplay showDuration />
                <span className={styles.spacer} />
                <button
                  type="button"
                  className={styles.bottomIconBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSubPanelOpen(true);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  title="Subtitles"
                >
                  <Subtitles size={20} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className={styles.bottomIconBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSettingsOpen(true);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  title="Settings"
                >
                  <Settings size={20} strokeWidth={2} />
                </button>
                <MediaPlaybackRateButton rates={[0.5, 0.75, 1, 1.25, 1.5, 2]} />
                <MediaFullscreenButton />
              </MediaControlBar>
            </div>
          </MediaController>
        ) : (
          <div className={styles.controller} aria-hidden />
        )}
      </div>
    </div>
  );
}
