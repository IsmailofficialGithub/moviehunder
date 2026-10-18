"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Hls from "hls.js";
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

const ISO_LANG_MAP = {
  hi: "Hindi", hin: "Hindi",
  en: "English", eng: "English",
  te: "Telugu", tel: "Telugu",
  ta: "Tamil", tam: "Tamil",
  ur: "Urdu", urd: "Urdu",
  es: "Spanish", spa: "Spanish",
  ja: "Japanese", jpn: "Japanese",
  fr: "French", fra: "French", fre: "French",
  de: "German", deu: "German", ger: "German",
  ko: "Korean", kor: "Korean",
  zh: "Chinese", zho: "Chinese", chi: "Chinese",
  ar: "Arabic", ara: "Arabic",
  ru: "Russian", rus: "Russian",
  pt: "Portuguese", por: "Portuguese",
  it: "Italian", ita: "Italian",
  bn: "Bengali", ben: "Bengali",
  mr: "Marathi", mar: "Marathi",
  ml: "Malayalam", mal: "Malayalam",
  kn: "Kannada", kan: "Kannada",
  pa: "Punjabi", pan: "Punjabi",
  tr: "Turkish", tur: "Turkish",
};

function normalizeLangLabel(lang, label, idx) {
  const code = String(lang || "").trim().toLowerCase();
  const rawLbl = String(label || "").trim();
  const mapped = ISO_LANG_MAP[code];
  if (mapped && (!rawLbl || rawLbl.toLowerCase().startsWith("track"))) {
    return mapped;
  }
  if (rawLbl) return rawLbl;
  if (mapped) return mapped;
  if (code) return code.toUpperCase();
  return `Track ${idx + 1}`;
}

function isTrackLanguageMatch(track, targetLanguage) {
  if (!track || !targetLanguage) return false;
  const target = String(targetLanguage).trim().toLowerCase();
  const lang = String(track.language || "").trim().toLowerCase();
  const label = String(track.label || "").trim().toLowerCase();
  const mapped = (ISO_LANG_MAP[lang] || "").toLowerCase();

  if (String(track.id).toLowerCase() === target) return true;
  if (label === target || lang === target || mapped === target) return true;
  if (target === "original" || target === "default") return false;

  if (label && (label.includes(target) || target.includes(label))) return true;
  if (mapped && (mapped.includes(target) || target.includes(mapped))) return true;
  if (lang && (target.includes(lang) || lang.includes(target))) return true;

  return false;
}

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
  poster = "",
  initialTime = 0,
  prevEpisode = null,
  nextEpisode = null,
  onPrevEpisode = null,
  onNextEpisode = null,
  onStreamMeta = null,
  qualityIndex: externalQualityIndex = null,
  onQualityChange: externalOnQualityChange = null,
  audioLanguage = "Original",
  onAvailableAudioLanguages = null,
  server = "1",
  onStatusChange = null,
}) {
  const videoRefA = useRef(null);
  const videoRefB = useRef(null);
  const activeSlotRef = useRef("A");
  const [activeSlot, setActiveSlot] = useState("A");
  const videoRef = useRef(null);
  videoRef.current = (activeSlot === "A" ? videoRefA.current : videoRefB.current) || videoRefA.current || videoRefB.current;
  const controllerRef = useRef(null);
  const canvasRef = useRef(null);
  const hlsRef = useRef(null);
  const fileInputRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [sources, setSources] = useState([]);
  const [internalQualityIndex, setInternalQualityIndex] = useState(0);
  const qualityIndex = externalQualityIndex !== null ? externalQualityIndex : internalQualityIndex;
  const setQualityIndex = (idx) => {
    setInternalQualityIndex(idx);
    if (typeof externalOnQualityChange === "function") {
      externalOnQualityChange(idx);
    }
  };
  const [status, setStatusInternal] = useState("idle");
  const setStatus = (st) => {
    setStatusInternal(st);
    if (typeof onStatusChange === "function") {
      onStatusChange(st);
    }
  };
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

  // --- Netflix Concurrency & Anti-Sharing State ---
  const [streamBlockError, setStreamBlockError] = useState(null); // holds the { code, userFriendly, action } error obj
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyStatus, setVerifyStatus] = useState("idle"); // idle | sending | sent | verifying | success

  // Start Playback Session
  useEffect(() => {
    if (!mounted || !videoRef.current) return;
    let isActive = true;
    let heartbeatTimer = null;

    const startPlaybackSession = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return; // Only applies to logged-in users

        // We use a mock device ID stored in localStorage or generate one
        let deviceId = localStorage.getItem("device_id");
        if (!deviceId) {
          deviceId = "dev_" + Math.random().toString(36).substr(2, 9);
          localStorage.setItem("device_id", deviceId);
        }

        const res = await fetch("/api/playback/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ deviceId })
        });
        
        const data = await res.json();
        
        if (!res.ok && data.error) {
          if (isActive) setStreamBlockError(data.error);
          return;
        }

        // Start 60s heartbeats if start was successful
        heartbeatTimer = setInterval(async () => {
          await fetch("/api/playback/heartbeat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ deviceId })
          }).catch(console.error);
        }, 60000);

      } catch (err) {
        console.error("Failed to start playback session", err);
      }
    };

    startPlaybackSession();

    return () => {
      isActive = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      // Graceful stop
      const token = localStorage.getItem("token");
      const deviceId = localStorage.getItem("device_id");
      if (token && deviceId) {
        fetch("/api/playback/stop", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ deviceId })
        }).catch(() => {});
      }
    };
  }, [mounted, subjectId, se, ep]);

  const handleRequestCode = async () => {
    setVerifyStatus("sending");
    try {
      const token = localStorage.getItem("token");
      const deviceId = localStorage.getItem("device_id");
      const res = await fetch("/api/household/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ deviceId, accountId: "auto" }) 
      });
      if (res.ok) {
        setVerifyStatus("sent");
      } else {
        alert("Too many requests. Please wait.");
        setVerifyStatus("idle");
      }
    } catch {
      setVerifyStatus("idle");
    }
  };

  const handleVerifyCodeSubmit = async () => {
    setVerifyStatus("verifying");
    try {
      const token = localStorage.getItem("token");
      const deviceId = localStorage.getItem("device_id");
      const res = await fetch("/api/household/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ deviceId, accountId: "auto", code: verifyCode })
      });
      const data = await res.json();
      if (res.ok) {
        setVerifyStatus("success");
        setStreamBlockError(null); // Unblock player!
      } else {
        alert(data.error?.userFriendly || "Invalid code");
        setVerifyStatus("sent");
      }
    } catch {
      setVerifyStatus("sent");
    }
  };
  // --- End Netflix Anti-Sharing ---

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
  const lastEpKeyRef = useRef(`${subjectId}_${se}_${ep}`);
  const activeEpKeyRef = useRef(`${subjectId}_${se}_${ep}`);

  // Immediately pause and reset playback state on episode change so previous episode's timestamp doesn't bleed
  useEffect(() => {
    const key = `${subjectId}_${se}_${ep}`;
    if (activeEpKeyRef.current !== key) {
      activeEpKeyRef.current = key;
      resumeAtRef.current = 0;
      setVideoTime(0);
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        } catch {}
      }
    }
  }, [subjectId, se, ep]);

  // Double-tap / double-click 10s seek
  const [seekRipple, setSeekRipple] = useState(null);
  const seekRippleTimerRef = useRef(null);
  const tapStateRef = useRef({ lastTapTime: 0, lastX: 0, lastY: 0 });

  const triggerSeek = useCallback((side) => {
    if (!videoRef.current) return;
    const delta = side === "left" ? -10 : 10;
    const current = videoRef.current.currentTime || 0;
    const duration = videoRef.current.duration || Infinity;
    const target = Math.max(0, Math.min(duration, current + delta));
    videoRef.current.currentTime = target;
    setVideoTime(target);

    if (seekRippleTimerRef.current) clearTimeout(seekRippleTimerRef.current);
    setSeekRipple((prev) => {
      const sameSide = prev && prev.side === side;
      return {
        side,
        amount: sameSide ? prev.amount + 10 : 10,
        id: Date.now(),
      };
    });
    seekRippleTimerRef.current = setTimeout(() => {
      setSeekRipple(null);
    }, 750);
  }, []);

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
    // If pointer is inside modals or dialogs, let it pass cleanly
    if (
      e.target?.closest?.(
        `.${styles.settingsModal}, .${styles.subModal}, .${styles.settingsPanel}, .${styles.subPanel}`
      )
    ) {
      return;
    }

    // Only primary mouse button or touch/pen
    if (e.pointerType === "mouse" && e.button !== 0) return;

    // Ignore interactive controls, buttons, sliders, dialogs
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    const isInteractive = Boolean(
      e.target?.closest?.(
        `button, a, input, select, textarea, media-play-button, media-time-range, media-volume-range, media-playback-rate-button, media-fullscreen-button, media-mute-button, media-seek-backward-button, media-seek-forward-button, [role="button"], .${styles.controlsWrapper}, .${styles.centerNavBtn}, .${styles.centerOverlay}, .${styles.settingsPanel}, .${styles.subPanel}, .${styles.retry}`
      ) ||
        path.some(
          (el) =>
            el.matches?.(
              `button, a, input, select, textarea, media-play-button, media-time-range, media-volume-range, media-playback-rate-button, media-fullscreen-button, media-mute-button, media-seek-backward-button, media-seek-forward-button, [role="button"], .${styles.controlsWrapper}, .${styles.centerNavBtn}, .${styles.centerOverlay}, .${styles.settingsPanel}, .${styles.subPanel}, .${styles.retry}`
            )
        )
    );
    if (isInteractive) return;

    // Detect double-tap on mobile/touch
    const now = Date.now();
    const prevTime = tapStateRef.current.lastTapTime;
    const prevX = tapStateRef.current.lastX;
    const prevY = tapStateRef.current.lastY;
    const dt = now - prevTime;
    const dx = Math.abs(e.clientX - prevX);
    const dy = Math.abs(e.clientY - prevY);

    const controllerEl = e.currentTarget || videoRef.current;
    const rect = controllerEl?.getBoundingClientRect
      ? controllerEl.getBoundingClientRect()
      : { left: 0, width: window.innerWidth };
    const isLeft = e.clientX < rect.left + rect.width / 2;
    const tapSide = isLeft ? "left" : "right";

    if (dt < 320 && dx < 60 && dy < 60) {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      suppressClickRef.current = true;
      tapStateRef.current = { lastTapTime: 0, lastX: 0, lastY: 0 };
      triggerSeek(tapSide);
      return;
    }

    tapStateRef.current = { lastTapTime: now, lastX: e.clientX, lastY: e.clientY };
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
    }, 450);

    const onWindowPointerMove = (moveEvt) => {
      if (pointerDownPosRef.current && !isHolding2xRef.current) {
        const moveDx = moveEvt.clientX - pointerDownPosRef.current.x;
        const moveDy = moveEvt.clientY - pointerDownPosRef.current.y;
        if (Math.hypot(moveDx, moveDy) > 20) {
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
  }, [endHoldSpeed, triggerSeek]);

  const handlePointerUp = useCallback(() => {
    endHoldSpeed();
  }, [endHoldSpeed]);

  const handleClickCapture = useCallback((e) => {
    // If click is on interactive controls, settings, or modals, never suppress!
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    if (
      e.target?.closest?.(
        `.${styles.settingsModal}, .${styles.subModal}, .${styles.settingsPanel}, .${styles.subPanel}, media-play-button, button, .${styles.centerOverlay}, .${styles.controlsWrapper}`
      ) ||
      path.some((el) =>
        el.matches?.(
          `button, media-play-button, media-fullscreen-button, .${styles.settingsModal}, .${styles.subModal}, .${styles.settingsPanel}, .${styles.subPanel}, .${styles.centerOverlay}, .${styles.controlsWrapper}`
        )
      )
    ) {
      suppressClickRef.current = false;
      return;
    }
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  }, []);

  const handleDoubleClick = useCallback(
    (e) => {
      if (
        e.target?.closest?.(
          `button, a, input, select, textarea, media-play-button, media-time-range, media-volume-range, media-playback-rate-button, media-fullscreen-button, media-mute-button, [role="button"], .${styles.settingsModal}, .${styles.subModal}, .${styles.controlsWrapper}, .${styles.centerNavBtn}`
        )
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = true;
      const controllerEl = e.currentTarget || videoRef.current;
      const rect = controllerEl?.getBoundingClientRect
        ? controllerEl.getBoundingClientRect()
        : { left: 0, width: window.innerWidth };
      const isLeft = e.clientX < rect.left + rect.width / 2;
      triggerSeek(isLeft ? "left" : "right");
    },
    [triggerSeek]
  );

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

  // On fullscreen enter, lock orientation to landscape so video plays in widescreen; unlock on exit
  useEffect(() => {
    if (!mounted) return;

    const onFullscreen = () => {
      const v = videoRef.current || (activeSlot === "A" ? videoRefA.current : videoRefB.current);
      const isFs = Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        v?.webkitDisplayingFullscreen ||
        controllerRef.current?.hasAttribute("mediafullscreen")
      );

      try {
        if (!isFs && screen.orientation?.unlock) {
          screen.orientation.unlock();
        }
      } catch {
        // ignore
      }
    };

    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);

    const vidA = videoRefA.current;
    const vidB = videoRefB.current;
    vidA?.addEventListener("webkitbeginfullscreen", onFullscreen);
    vidA?.addEventListener("webkitendfullscreen", onFullscreen);
    vidB?.addEventListener("webkitbeginfullscreen", onFullscreen);
    vidB?.addEventListener("webkitendfullscreen", onFullscreen);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
      vidA?.removeEventListener("webkitbeginfullscreen", onFullscreen);
      vidA?.removeEventListener("webkitendfullscreen", onFullscreen);
      vidB?.removeEventListener("webkitbeginfullscreen", onFullscreen);
      vidB?.removeEventListener("webkitendfullscreen", onFullscreen);
      try {
        screen.orientation?.unlock?.();
      } catch {
        // ignore
      }
    };
  }, [mounted, activeSlot]);

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
      if (activeEpKeyRef.current !== `${subjectId}_${se}_${ep}`) return;

      if (video.currentTime > 2 && !video.ended) {
        try {
          const nowTs = Date.now();
          const seStr = String(se || "0");
          const epStr = String(ep || "0");
          const dur = video.duration || 0;
          let pId = "1";
          try {
            const stored = localStorage.getItem("active_profile");
            if (stored) {
              const p = JSON.parse(stored);
              if (p?.id) pId = String(p.id);
            }
          } catch {}
          const pPrefix = pId === "1" ? "" : `p${pId}_`;
          const mainKey = `history_${pPrefix}${subjectId}_${seStr}_${epStr}`;
          const timeKey = `history_time_${pPrefix}${subjectId}_${seStr}_${epStr}`;
          const metaKey = `history_meta_${pPrefix}${subjectId}`;

          const isFinished = dur > 60 && (video.currentTime / dur >= 0.90 || dur - video.currentTime <= 30);
          if (isFinished) {
            localStorage.removeItem(mainKey);
            if (pId === "1") localStorage.removeItem(`history_${subjectId}_${seStr}_${epStr}`);
          } else {
            localStorage.setItem(mainKey, video.currentTime.toString());
          }
          localStorage.setItem(timeKey, nowTs.toString());
          if (title || poster) {
            let prevMeta = {};
            try {
              prevMeta = JSON.parse(
                localStorage.getItem(metaKey) ||
                (pId === "1" ? localStorage.getItem(`history_meta_${subjectId}`) : "{}") ||
                "{}"
              );
            } catch {}
            localStorage.setItem(
              metaKey,
              JSON.stringify({
                title: title || prevMeta.title || null,
                poster: poster || prevMeta.poster || null,
                detailPath: detailPath || prevMeta.detailPath || null,
                duration: video.duration || prevMeta.duration || 0,
                lastSe: seStr,
                lastEp: epStr,
                updatedAt: nowTs,
              })
            );
            if (seStr !== "0" || epStr !== "0") {
              localStorage.setItem(`history_last_${subjectId}`, JSON.stringify({ se: seStr, ep: epStr }));
            }
          }

          const watchItem = {
            key: `t:${subjectId}:s${seStr}:e${epStr}`,
            profileId: pId,
            subjectId,
            se: seStr,
            ep: epStr,
            position: video.currentTime,
            duration: video.duration || 0,
            title: title || null,
            poster: poster || null,
            detailPath: detailPath || subjectId,
            updatedAt: nowTs,
            completed: Boolean(video.duration > 0 && video.currentTime >= video.duration - 45),
          };

          import("../lib/sync")
            .then((m) => m.syncPlaybackProgress?.(watchItem, { immediate: forcePos, profileId: pId }))
            .catch(() => {});
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
    const onLeave = () => syncSession(true);
    syncSession(true);
    video.addEventListener("play", onPlayPause);
    video.addEventListener("pause", onPlayPause);
    video.addEventListener("seeked", onPlayPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onPlayPause);
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onLeave);
    return () => {
      onLeave();
      video.removeEventListener("play", onPlayPause);
      video.removeEventListener("pause", onPlayPause);
      video.removeEventListener("seeked", onPlayPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onPlayPause);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onLeave);
    };
  }, [mounted, displayTitle, onPrevEpisode, onNextEpisode, activeSlot]);

  useEffect(() => {
    return () => {
      clearMediaSession();
      [videoRefA.current, videoRefB.current].forEach((v) => {
        if (v) {
          try {
            v.pause();
            v.removeAttribute("src");
            v.load();
          } catch {}
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!subPanelOpen && !settingsOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setSubPanelOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subPanelOpen, settingsOpen]);

  const handleFullscreenClick = useCallback((e) => {
    const v = videoRef.current || (activeSlot === "A" ? videoRefA.current : videoRefB.current);

    // On iOS (iPhone/iPod) WebKit where element fullscreen is restricted or doesn't rotate,
    // trigger native video fullscreen directly
    const isIOS =
      typeof navigator !== "undefined" &&
      (/iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1 && window.screen.width < 768));

    if (isIOS && v?.webkitEnterFullscreen) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      try {
        if (v.webkitDisplayingFullscreen) {
          v.webkitExitFullscreen?.();
        } else {
          v.webkitEnterFullscreen();
        }
      } catch {}
    }
  }, [activeSlot]);

  // Re-synchronize MediaController when active video slot or server changes
  useEffect(() => {
    const controller = controllerRef.current;
    const activeVid = activeSlot === "A" ? videoRefA.current : videoRefB.current;
    if (!controller || !activeVid) return;
    if (typeof controller.handleMediaUpdated === "function") {
      controller.handleMediaUpdated(activeVid);
    } else if (typeof controller.mediaSetCallback === "function") {
      controller.mediaSetCallback(activeVid);
    }
  }, [activeSlot, server]);

  // Spacebar: hold > 1s triggers 2X speed (releasing restores speed), press <= 1s toggles play/pause
  useEffect(() => {
    if (!mounted) return;
    let spaceHoldTimer = null;

    const onKeyDown = (e) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) {
        return;
      }
      e.preventDefault();
      if (e.repeat) return;

      const video = videoRef.current;
      if (!video) return;

      clearTimeout(spaceHoldTimer);
      spaceHoldTimer = setTimeout(() => {
        prevRateRef.current = video.playbackRate === 2 ? 1 : (video.playbackRate || 1);
        isHolding2xRef.current = true;
        setHold2xActive(true);
        video.playbackRate = 2;
        if (video.paused) {
          video.play().catch(() => {});
        }
      }, 1000);
    };

    const onKeyUp = (e) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) {
        return;
      }
      e.preventDefault();

      clearTimeout(spaceHoldTimer);
      const video = videoRef.current;
      if (!video) return;

      if (isHolding2xRef.current) {
        isHolding2xRef.current = false;
        setHold2xActive(false);
        video.playbackRate = prevRateRef.current || 1;
      } else {
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      clearTimeout(spaceHoldTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [mounted]);

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
        server,
        title,
        lang: audioLanguage,
      });
      if (!result.sources.length) {
        throw new Error("No playable streams returned");
      }
      setSources(result.sources);
      setQualityIndex(pickDefaultIndex(result.sources));
      setStatus("ready");
      if (typeof onStreamMeta === "function") {
        onStreamMeta({ host: result.host, sources: result.sources, via: result.via });
      }
    } catch (err) {
      setError(friendlyPlaybackError(err));
      setStatus("error");
    }
  }, [subjectId, detailPath, se, ep, server, title, audioLanguage]);

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
  const targetSrc = useMemo(
    () => (active ? proxiedMediaUrl(active.url) : ""),
    [active]
  );
  const [appliedSrc, setAppliedSrc] = useState("");
  const preloaderRef = useRef(null);
  const preloaderTimerRef = useRef(null);

  // Seamless quality switching:
  // 1. If HLS master playlist with multiple bitrate levels: switch hls.nextLevel so current chunk finishes at current quality and next chunk loads at new quality with zero reload/stall.
  // 2. If separate stream/MP4 URLs: keep current video playing while background preloader buffers the chunk at currentTime, then switch appliedSrc seamlessly without getting stuck.
  useEffect(() => {
    if (!targetSrc) {
      setAppliedSrc("");
      return;
    }
    if (!appliedSrc) {
      setAppliedSrc(targetSrc);
      return;
    }
    if (targetSrc === appliedSrc) return;

    const currentKey = `${subjectId}_${se}_${ep}`;
    const isNewEp = lastEpKeyRef.current !== currentKey;
    if (isNewEp) {
      setAppliedSrc(targetSrc);
      return;
    }

    // Check if current HLS instance supports internal nextLevel switching
    if (hlsRef.current && hlsRef.current.levels && hlsRef.current.levels.length > 1) {
      const targetLevel = qualityIndex < hlsRef.current.levels.length ? qualityIndex : -1;
      hlsRef.current.nextLevel = targetLevel;
      return;
    }

    const currentVid = activeSlotRef.current === "A" ? videoRefA.current : videoRefB.current;
    const standbyVid = activeSlotRef.current === "A" ? videoRefB.current : videoRefA.current;

    if (!currentVid || !standbyVid) {
      setAppliedSrc(targetSrc);
      return;
    }

    const isPlaying = !currentVid.paused && !currentVid.ended && (currentVid.currentTime || 0) > 0;

    if (!isPlaying) {
      standbyVid.src = targetSrc;
      try {
        standbyVid.currentTime = currentVid.currentTime || 0;
      } catch {}
      standbyVid.load();
      const nextSlot = activeSlotRef.current === "A" ? "B" : "A";
      activeSlotRef.current = nextSlot;
      setActiveSlot(nextSlot);
      videoRef.current = standbyVid;
      setAppliedSrc(targetSrc);
      return;
    }

    // Video is actively playing: pre-buffer standbyVid in background while currentVid keeps playing with audio!
    if (preloaderTimerRef.current) clearTimeout(preloaderTimerRef.current);

    standbyVid.src = targetSrc;
    standbyVid.muted = true;
    standbyVid.playbackRate = currentVid.playbackRate || 1;
    standbyVid.load();

    let swapped = false;
    const doSwap = () => {
      if (swapped) return;
      swapped = true;
      if (preloaderTimerRef.current) clearTimeout(preloaderTimerRef.current);

      // Instant seamless handoff: unmute standby, mute & pause old video.
      // Do NOT seek standbyVid here - re-seeking an actively playing video forces a buffer flush & audio jerk!
      standbyVid.muted = currentVid.muted;
      standbyVid.volume = currentVid.volume;
      standbyVid.playbackRate = currentVid.playbackRate || 1;

      currentVid.muted = true;
      currentVid.pause();

      const nextSlot = activeSlotRef.current === "A" ? "B" : "A";
      activeSlotRef.current = nextSlot;
      setActiveSlot(nextSlot);
      videoRef.current = standbyVid;
      setAppliedSrc(targetSrc);
    };

    const onStandbyMetadata = () => {
      try {
        standbyVid.currentTime = currentVid.currentTime || 0;
      } catch {}
    };

    const onStandbyCanPlay = () => {
      try {
        const drift = Math.abs((currentVid.currentTime || 0) - (standbyVid.currentTime || 0));
        if (drift > 0.4) {
          standbyVid.currentTime = currentVid.currentTime || 0;
        }
      } catch {}
      standbyVid.play().catch(() => {});
    };

    const onStandbyPlaying = () => {
      doSwap();
    };

    standbyVid.addEventListener("loadedmetadata", onStandbyMetadata, { once: true });
    standbyVid.addEventListener("canplay", onStandbyCanPlay, { once: true });
    standbyVid.addEventListener("playing", onStandbyPlaying, { once: true });

    // Safety fallback: generous window so background preloading completes without rushing
    preloaderTimerRef.current = setTimeout(doSwap, 6000);

    return () => {
      if (preloaderTimerRef.current) clearTimeout(preloaderTimerRef.current);
      standbyVid.removeEventListener("loadedmetadata", onStandbyMetadata);
      standbyVid.removeEventListener("canplay", onStandbyCanPlay);
      standbyVid.removeEventListener("playing", onStandbyPlaying);
    };
  }, [targetSrc, qualityIndex, appliedSrc, subjectId, se, ep]);

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
    const video = activeSlot === "A" ? videoRefA.current : videoRefB.current;
    if (!video || !appliedSrc) return;
    const currentKey = `${subjectId}_${se}_${ep}`;
    const isNewEp = lastEpKeyRef.current !== currentKey;
    lastEpKeyRef.current = currentKey;

    const curTime = video.currentTime || 0;
    const wasPlaying = !video.paused && !video.ended;

    let resume = 0;
    if (!isNewEp) {
      if (resumeAtRef.current > 0) {
        resume = resumeAtRef.current;
      } else if (curTime > 0) {
        resume = curTime;
      } else if (Number(initialTime) > 0) {
        resume = Number(initialTime);
      }
    }
    resumeAtRef.current = 0;

    // Reset retry counter every time the appliedSrc changes (new episode or quality change)
    videoRetryCount.current = 0;
    clearTimeout(videoRetryTimer.current);

    if (resume === 0) {
      try {
        const seStr = String(se || "0");
        const epStr = String(ep || "0");
        let pId = "1";
        try {
          const stored = localStorage.getItem("active_profile");
          if (stored) {
            const p = JSON.parse(stored);
            if (p?.id) pId = String(p.id);
          }
        } catch {}
        const pPrefix = pId === "1" ? "" : `p${pId}_`;
        let saved = localStorage.getItem(`history_${pPrefix}${subjectId}_${seStr}_${epStr}`);
        if (!saved && pId === "1") {
          saved = localStorage.getItem(`history_${subjectId}_${seStr}_${epStr}`);
        }
        if (saved && !isNaN(Number(saved))) {
          const savedNum = Number(saved);
          if (savedNum > 2) {
            resume = savedNum;
          }
        }
      } catch {}
    }

    try {
      video.currentTime = Math.max(0, resume);
    } catch {}

    const syncAudioTracks = () => {
      const available = [];
      const hlsTracks = hlsRef.current?.audioTracks || [];

      if (hlsTracks.length > 0) {
        for (let i = 0; i < hlsTracks.length; i++) {
          const t = hlsTracks[i];
          const displayLabel = normalizeLangLabel(t.lang || t.language, t.name || t.label, i);
          available.push({
            id: String(t.id ?? i),
            label: displayLabel,
            language: t.lang || t.language || "",
            enabled: hlsRef.current.audioTrack === i,
          });
        }
      } else if (video.audioTracks && video.audioTracks.length > 0) {
        for (let i = 0; i < video.audioTracks.length; i++) {
          const t = video.audioTracks[i];
          const displayLabel = normalizeLangLabel(t.language, t.label, i);
          available.push({
            id: String(t.id ?? i),
            label: displayLabel,
            language: t.language || "",
            enabled: !!t.enabled,
          });
        }
      }

      if (available.length > 0 && typeof onAvailableAudioLanguages === "function") {
        onAvailableAudioLanguages(available);
      }

      if (audioLanguage) {
        if (hlsTracks.length > 0) {
          let matchedIdx = -1;
          for (let i = 0; i < hlsTracks.length; i++) {
            const t = hlsTracks[i];
            if (isTrackLanguageMatch({ id: t.id, language: t.lang || t.language, label: t.name || t.label }, audioLanguage)) {
              matchedIdx = i;
              break;
            }
          }
          if (matchedIdx >= 0) {
            hlsRef.current.audioTrack = matchedIdx;
          }
        } else if (video.audioTracks && video.audioTracks.length > 0) {
          let matched = false;
          for (let i = 0; i < video.audioTracks.length; i++) {
            const t = video.audioTracks[i];
            if (isTrackLanguageMatch(t, audioLanguage)) {
              t.enabled = true;
              matched = true;
            } else {
              t.enabled = false;
            }
          }
          if (!matched && (audioLanguage === "Original" || !video.audioTracks.some((x) => x.enabled))) {
            if (video.audioTracks[0]) video.audioTracks[0].enabled = true;
          }
        }
      }
    };

    const isHls = typeof appliedSrc === "string" && (appliedSrc.includes(".m3u8") || appliedSrc.includes("/mpd/"));

    const isAlreadyLoaded =
      !isNewEp &&
      video.readyState >= 2 &&
      (video.src === appliedSrc || (video.currentSrc && video.currentSrc.includes(appliedSrc)));

    if (!isAlreadyLoaded) {
      if (isHls && Hls.isSupported()) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
        }
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 60,
        });
        hlsRef.current = hls;
        hls.loadSource(appliedSrc);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          try {
            if (resume > 0) video.currentTime = resume;
          } catch {}
          syncAudioTracks();
          if (wasPlaying || isNewEp) {
            video.play().catch(() => {});
          }
        });

        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
          syncAudioTracks();
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                break;
            }
          }
        });
      } else {
        video.src = appliedSrc;
        video.load();
      }
    } else {
      syncAudioTracks();
    }

    let readyHandled = isAlreadyLoaded;
    const onReady = () => {
      if (readyHandled) return;
      readyHandled = true;
      if (resume > 0) {
        try {
          video.currentTime = resume;
        } catch {
          // ignore
        }
      }
      syncAudioTracks();
      if (video.audioTracks) {
        video.audioTracks.addEventListener?.("addtrack", syncAudioTracks);
        video.audioTracks.addEventListener?.("removetrack", syncAudioTracks);
        video.audioTracks.addEventListener?.("change", syncAudioTracks);
      }
      if (wasPlaying || isNewEp) {
        video.play().catch(() => {});
      }
    };

    if (!isAlreadyLoaded) {
      video.addEventListener("loadedmetadata", onReady, { once: true });
      video.addEventListener("loadeddata", onReady, { once: true });
    }

    // Auto-retry on network errors (e.g. 429 rate-limit from CDN proxy).
    const MAX_RETRIES = 4;
    const onVideoError = () => {
      const err = video.error;
      if (!err || err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return;
      if (videoRetryCount.current >= MAX_RETRIES) return;

      const attempt = videoRetryCount.current + 1;
      videoRetryCount.current = attempt;
      const savedTime = video.currentTime || 0;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);

      videoRetryTimer.current = setTimeout(() => {
        const v = activeSlotRef.current === "A" ? videoRefA.current : videoRefB.current;
        if (!v) return;
        v.src = appliedSrc;
        v.load();
        const onRetryReady = () => {
          if (savedTime > 0) {
            try { v.currentTime = savedTime; } catch {}
          }
          v.play().catch(() => {});
        };
        v.addEventListener("loadeddata", onRetryReady, { once: true });
      }, delay);
    };

    video.addEventListener("error", onVideoError);
    if (video.audioTracks) {
      video.audioTracks.addEventListener?.("addtrack", syncAudioTracks);
      video.audioTracks.addEventListener?.("removetrack", syncAudioTracks);
      video.audioTracks.addEventListener?.("change", syncAudioTracks);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onVideoError);
      if (video.audioTracks) {
        video.audioTracks.removeEventListener?.("addtrack", syncAudioTracks);
        video.audioTracks.removeEventListener?.("removetrack", syncAudioTracks);
        video.audioTracks.removeEventListener?.("change", syncAudioTracks);
      }
      clearTimeout(videoRetryTimer.current);
    };
  }, [mounted, appliedSrc, activeSlot]);

  // Reactively switch audio track when audioLanguage prop changes
  useEffect(() => {
    if (hlsRef.current && hlsRef.current.audioTracks?.length > 1 && audioLanguage) {
      const tracks = hlsRef.current.audioTracks;
      let matchedIdx = -1;
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (isTrackLanguageMatch({ id: t.id, language: t.lang || t.language, label: t.name || t.label }, audioLanguage)) {
          matchedIdx = i;
          break;
        }
      }
      if (matchedIdx >= 0) {
        hlsRef.current.audioTrack = matchedIdx;
        return;
      }
    }

    const video = videoRef.current;
    if (!video || !video.audioTracks || video.audioTracks.length <= 1 || !audioLanguage) return;
    let matched = false;
    for (let i = 0; i < video.audioTracks.length; i++) {
      const t = video.audioTracks[i];
      if (isTrackLanguageMatch(t, audioLanguage)) {
        t.enabled = true;
        matched = true;
      } else {
        t.enabled = false;
      }
    }
    if (!matched && audioLanguage === "Original" && video.audioTracks[0]) {
      video.audioTracks[0].enabled = true;
    }
  }, [audioLanguage]);

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
  }, [mounted, activeSubId, activeTrack?.id, activeTrack?.offset, activeTrack?.rate, activeSlot]);


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
      {settingsOpen ? (
        <FullscreenPortal>
        <div
          slot="middle-chrome"
          className={styles.settingsModal}
          role="dialog"
          aria-modal="true"
          onClickCapture={(e) => {
            if (e.target === e.currentTarget) e.stopPropagation();
          }}
          onPointerDownCapture={(e) => {
            if (e.target === e.currentTarget) e.stopPropagation();
          }}
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
                className={styles.iconCloseBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setSettingsOpen(false);
                }}
                title="Close settings"
                aria-label="Close settings"
              >
                <X size={15} />
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
          slot="middle-chrome"
          className={styles.subModal}
          role="dialog"
          aria-modal="true"
          onClickCapture={(e) => {
            if (e.target === e.currentTarget) e.stopPropagation();
          }}
          onPointerDownCapture={(e) => {
            if (e.target === e.currentTarget) e.stopPropagation();
          }}
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
        {streamBlockError && (
          <div className={styles.streamBlockOverlay}>
            <div className={styles.streamBlockModal}>
              <h2>{streamBlockError.code === "STREAM_LIMIT_REACHED" ? "Too Many Streams" : "Device Not Verified"}</h2>
              <p>{streamBlockError.userFriendly}</p>
              
              {streamBlockError.action === "SHOW_VERIFICATION_PROMPT" && (
                <div className={styles.verificationBox}>
                  {verifyStatus === "idle" && (
                    <button onClick={handleRequestCode} className={styles.primaryBtn}>
                      Email Code to Primary Account
                    </button>
                  )}
                  {verifyStatus === "sending" && <p>Sending code...</p>}
                  {(verifyStatus === "sent" || verifyStatus === "verifying") && (
                    <div className={styles.codeInputBox}>
                      <input 
                        type="text" 
                        maxLength={4} 
                        placeholder="0000"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value)}
                        className={styles.codeInput}
                      />
                      <button 
                        onClick={handleVerifyCodeSubmit}
                        disabled={verifyStatus === "verifying" || verifyCode.length < 4}
                        className={styles.primaryBtn}
                      >
                        {verifyStatus === "verifying" ? "Verifying..." : "Verify"}
                      </button>
                    </div>
                  )}
                  {verifyStatus === "success" && <p className={styles.successText}>Success! Resuming playback...</p>}
                </div>
              )}
              
              {streamBlockError.action === "SHOW_UPGRADE_PROMPT" && (
                <button className={styles.primaryBtn} onClick={() => alert('Upgrade Flow Mock')}>
                  Upgrade Plan
                </button>
              )}
            </div>
          </div>
        )}

        {mounted ? (
          <MediaController
            ref={controllerRef}
            className={styles.controller}
            hotkeys="nospace"
            autohide="5"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClickCapture={handleClickCapture}
            onDoubleClick={handleDoubleClick}
          >
            <video
              ref={videoRefA}
              slot={activeSlot === "A" ? "media" : undefined}
              playsInline
              webkit-playsinline="true"
              preload="metadata"
              crossOrigin="anonymous"
              suppressHydrationWarning
              className={`${styles.video} ${
                activeSlot === "A" ? styles.videoActive : styles.videoHidden
              }`}
              style={{
                objectFit: displayActive.fit,
                transform:
                  displayActive.scale !== 1
                    ? `scale(${displayActive.scale})`
                    : undefined,
              }}
            />
            <video
              ref={videoRefB}
              slot={activeSlot === "B" ? "media" : undefined}
              playsInline
              webkit-playsinline="true"
              preload="metadata"
              crossOrigin="anonymous"
              suppressHydrationWarning
              className={`${styles.video} ${
                activeSlot === "B" ? styles.videoActive : styles.videoHidden
              }`}
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
            {seekRipple ? (
              <div
                className={
                  seekRipple.side === "left"
                    ? styles.seekRippleLeft
                    : styles.seekRippleRight
                }
                key={seekRipple.id}
                aria-live="polite"
              >
                <div className={styles.seekRippleArc} />
                <div className={styles.seekRippleBadge}>
                  <RotateCcw
                    size={28}
                    className={`${styles.seekRippleIcon} ${
                      seekRipple.side === "right" ? styles.flipIcon : ""
                    }`}
                  />
                  <span className={styles.seekRippleText}>
                    {seekRipple.side === "left" ? `-${seekRipple.amount}s` : `+${seekRipple.amount}s`}
                  </span>
                </div>
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
                {prevEpisode && onPrevEpisode ? (
                  <button
                    type="button"
                    className={styles.bottomIconBtn}
                    onClick={goPrev}
                    disabled={busy}
                    title="Previous Episode"
                    aria-label="Previous episode"
                  >
                    <SkipBack size={20} fill="currentColor" strokeWidth={2} />
                  </button>
                ) : null}
                <MediaPlayButton />
                {nextEpisode && onNextEpisode ? (
                  <button
                    type="button"
                    className={styles.bottomIconBtn}
                    onClick={goNext}
                    disabled={busy}
                    title="Next Episode"
                    aria-label="Next episode"
                  >
                    <SkipForward size={20} fill="currentColor" strokeWidth={2} />
                  </button>
                ) : null}
                <div className={styles.volumeGroup}>
                  <MediaMuteButton />
                  <MediaVolumeRange className={styles.volumeSlider} />
                </div>
                <MediaTimeDisplay showDuration />
                <span className={styles.spacer} />
                <button
                  type="button"
                  className={styles.bottomIconBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSubPanelOpen((v) => !v);
                    setSettingsOpen(false);
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
                    setSettingsOpen((v) => !v);
                    setSubPanelOpen(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  title="Settings"
                >
                  <Settings size={20} strokeWidth={2} />
                </button>
                <MediaPlaybackRateButton rates={[0.5, 0.75, 1, 1.25, 1.5, 2]} />
                <MediaFullscreenButton onClick={handleFullscreenClick} />
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
