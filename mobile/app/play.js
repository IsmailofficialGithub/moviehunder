import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEvent } from "expo";
import { NavigationBar } from "expo-navigation-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer } from "expo-video/build/VideoPlayer";
import { VideoView } from "expo-video/build/VideoView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  formatBytes,
  higherQualityIndex,
  lowerQualityIndex,
  pickAutoIndex,
  proxiedMediaUrl,
  watchStreamUrl,
} from "../lib/stream";
import { getCachedStreams, prefetchStreams } from "../lib/streamCache";
import { colors, radii, spacing } from "../lib/theme";
import { toUserMessage } from "../lib/userFacingError";
import { cueAtTime } from "../lib/subtitles";
import {
  getDownloadById,
  hydrateDownloads,
} from "../lib/downloads";
import {
  clearWatchProgress,
  formatResumeTime,
  getWatchProgress,
  isResumable,
  saveWatchProgress,
  watchProgressKey,
} from "../lib/watchProgress";
import {
  isVaultUnlocked,
  prepareVaultPlayUri,
  releaseVaultPlayUri,
} from "../lib/vault";
import SubtitlePanel from "../components/SubtitlePanel";
import * as FileSystem from "expo-file-system/legacy";

const SEEK_STEP = 10;
const AUTO_MAX = 720;
const PRELOAD_BUFFER_SEC = 2;
const PRELOAD_TIMEOUT_MS = 18000;

const DISPLAY_MODES = [
  {
    id: "fit",
    title: "Fit",
    sub: "Full video visible",
    contentFit: "contain",
    scale: 1,
    pan: false,
    icon: "scan-outline",
  },
  {
    id: "stretch",
    title: "Stretch",
    sub: "Fill screen, may distort",
    contentFit: "fill",
    scale: 1,
    pan: false,
    icon: "resize-outline",
  },
  {
    id: "cover",
    title: "Fill",
    sub: "Crop edges — drag to reposition",
    contentFit: "cover",
    scale: 1,
    pan: true,
    icon: "crop-outline",
  },
  {
    id: "zoom",
    title: "100%",
    sub: "Larger view — drag to reposition",
    contentFit: "contain",
    scale: 1.18,
    pan: true,
    icon: "square-outline",
  },
];

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function formatSpeed(rate) {
  const n = Number(rate) || 1;
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}x`;
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function PlayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const [screenSize, setScreenSize] = useState(() => Dimensions.get("screen"));

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ screen }) => {
      setScreenSize(screen);
    });
    return () => sub?.remove();
  }, []);
  const params = useLocalSearchParams();

  const subjectId = String(params.subjectId || "");
  const detailPath = String(params.detail_path || params.slug || "");
  const se = String(params.se ?? "0");
  const ep = String(params.ep ?? "0");
  const title = String(params.title || "Now playing");
  const wantsAutoplay = params.autoplay !== "0";
  const downloadIdRaw = String(params.downloadId || "");
  let downloadId = "";
  try {
    downloadId = downloadIdRaw ? decodeURIComponent(downloadIdRaw) : "";
  } catch {
    downloadId = downloadIdRaw;
  }
  const [offlineUri, setOfflineUri] = useState("");
  const [offlineReady, setOfflineReady] = useState(!downloadId);

  const [sources, setSources] = useState([]);
  const [qualityIndex, setQualityIndex] = useState(0);
  const [qualityMode, setQualityMode] = useState("auto"); // auto | manual
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [useWatchFallback, setUseWatchFallback] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [locked, setLocked] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("quality"); // quality | screen | rotate
  const [displayMode, setDisplayMode] = useState("fit");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoPan, setVideoPan] = useState({ x: 0, y: 0 });
  const [chipHint, setChipHint] = useState("");
  const [orientMode, setOrientMode] = useState("sensor"); // portrait | landscape | sensor
  const [expanded, setExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekHint, setSeekHint] = useState(null); // { side: 'left' | 'right', text }
  const [scrubbing, setScrubbing] = useState(false);
  const [waitingToPlay, setWaitingToPlay] = useState(() => wantsAutoplay);
  const [subtitles, setSubtitles] = useState([]);
  const [activeSubId, setActiveSubId] = useState("off");
  const [cueText, setCueText] = useState("");
  /** Saved progress offer — null once user picks Resume or Start over */
  const [resumeOffer, setResumeOffer] = useState(null);
  const [resumeReady, setResumeReady] = useState(false);

  const resumeAtRef = useRef(0);
  const fallbackTried = useRef(false);
  const hideTimer = useRef(null);
  const singleTapTimer = useRef(null);
  const lastTapRef = useRef({ t: 0, side: "" });
  const barWidthRef = useRef(Dimensions.get("window").width);
  const barLayoutRef = useRef({ x: 0, width: 1 });
  const barRef = useRef(null);
  const stallMsRef = useRef(0);
  const healthyMsRef = useRef(0);
  const scrubbingRef = useRef(false);
  const userWantsPlayRef = useRef(false);
  const preloadTimerRef = useRef(null);
  const preloadPollRef = useRef(null);
  const preloadedRef = useRef(false);
  const videoPanStart = useRef({ x: 0, y: 0 });
  const resumeOfferRef = useRef(null);
  const lastProgressSaveRef = useRef(0);
  const progressKeyRef = useRef("");

  const progressKey = useMemo(
    () =>
      watchProgressKey({
        subjectId,
        se,
        ep,
        downloadId,
      }),
    [subjectId, se, ep, downloadId]
  );
  progressKeyRef.current = progressKey;
  resumeOfferRef.current = resumeOffer;

  const active = sources[qualityIndex] || null;

  const playUri = useMemo(() => {
    if (offlineUri) return offlineUri;
    if (!active) return null;
    if (useWatchFallback && subjectId && detailPath) {
      return watchStreamUrl({
        subjectId,
        detailPath,
        se,
        ep,
        resolution: active.height || 0,
      });
    }
    return proxiedMediaUrl(active.url);
  }, [offlineUri, active, useWatchFallback, subjectId, detailPath, se, ep]);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.5;
  });

  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  const clearPreloadTimers = useCallback(() => {
    clearTimeout(preloadTimerRef.current);
    clearInterval(preloadPollRef.current);
    preloadTimerRef.current = null;
    preloadPollRef.current = null;
  }, []);

  const finishPreload = useCallback(() => {
    clearPreloadTimers();
    preloadedRef.current = true;
    // Wait for Resume / Start over before playing
    if (resumeOfferRef.current) {
      try {
        player.muted = false;
        player.pause();
      } catch {
        /* ignore */
      }
      setWaitingToPlay(false);
      return;
    }
    const go = userWantsPlayRef.current;
    try {
      const at = resumeAtRef.current || 0;
      if (at > 0) player.currentTime = at;
      player.muted = false;
      if (go) {
        userWantsPlayRef.current = false;
        if (!player.playing) player.play();
      } else {
        player.pause();
      }
    } catch {
      /* ignore */
    }
  }, [clearPreloadTimers, player]);

  const isPreloadReady = useCallback(() => {
    try {
      return (
        player.status === "readyToPlay" &&
        ((player.duration || 0) > 0 ||
          (player.bufferedPosition || 0) >= PRELOAD_BUFFER_SEC)
      );
    } catch {
      return false;
    }
  }, [player]);

  const togglePlayPause = useCallback(() => {
    if (resumeOfferRef.current) return;
    try {
      if (player.playing) {
        player.pause();
        setWaitingToPlay(false);
        return;
      }
      userWantsPlayRef.current = true;
      setWaitingToPlay(true);
      player.play();
    } catch {
      /* ignore */
    }
  }, [player]);

  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    if (locked || settingsOpen || scrubbing) return;
    hideTimer.current = setTimeout(() => {
      try {
        if (!player.playing) return;
      } catch {
        /* ignore */
      }
      setControlsVisible(false);
    }, 8000);
  }, [locked, settingsOpen, scrubbing, player]);

  const showControls = useCallback(() => {
    if (locked) return;
    setControlsVisible(true);
    scheduleHide();
  }, [locked, scheduleHide]);

  // Keep a stable ref so stream `load()` is not recreated (and re-run) when
  // opening/closing settings — that was resetting quality back to Auto.
  const showControlsRef = useRef(showControls);
  showControlsRef.current = showControls;
  const streamKeyRef = useRef("");

  useEffect(() => {
    if (status === "ready" && !locked && isPlaying && !waitingToPlay) {
      const t = setTimeout(() => setControlsVisible(false), 2000);
      return () => clearTimeout(t);
    }
  }, [status, locked, isPlaying, waitingToPlay]);

  useEffect(() => {
    if (status === "ready" && !locked) {
      setControlsVisible(true);
      if (isPlaying) {
        setWaitingToPlay(false);
        scheduleHide();
      }
    }
  }, [status, locked, isPlaying, scheduleHide]);

  useEffect(() => {
    const sub = player.addListener("statusChange", (payload) => {
      if (payload?.status === "error" || payload?.error) {
        if (!fallbackTried.current) {
          fallbackTried.current = true;
          setUseWatchFallback(true);
          setError("");
          return;
        }
        setError(
          "Playback failed. Try another quality or check that the server is running."
        );
        setStatus("error");
      }
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    const sub = player.addListener("timeUpdate", () => {
      if (scrubbingRef.current) return;
      try {
        const t = player.currentTime || 0;
        const d = player.duration || 0;
        setCurrentTime(t);
        setDuration(d);
        const now = Date.now();
        if (
          progressKeyRef.current &&
          !resumeOfferRef.current &&
          now - lastProgressSaveRef.current > 5000
        ) {
          lastProgressSaveRef.current = now;
          saveWatchProgress(progressKeyRef.current, {
            position: t,
            duration: d,
            title,
          }).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    });
    return () => sub.remove();
  }, [player, title]);

  // Load saved progress — offer resume for live + downloads
  useEffect(() => {
    let cancelled = false;
    setResumeReady(false);
    setResumeOffer(null);
    resumeAtRef.current = 0;
    (async () => {
      if (!progressKey) {
        if (!cancelled) setResumeReady(true);
        return;
      }
      try {
        const hit = await getWatchProgress(progressKey);
        if (cancelled) return;
        if (isResumable(hit)) {
          setResumeOffer(hit);
          userWantsPlayRef.current = false;
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setResumeReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [progressKey]);

  // Flush progress when leaving the player
  useEffect(() => {
    return () => {
      try {
        const t = player.currentTime || 0;
        const d = player.duration || 0;
        const key = progressKeyRef.current;
        if (key && t > 5) {
          saveWatchProgress(key, { position: t, duration: d, title }).catch(
            () => {}
          );
        }
      } catch {
        /* ignore */
      }
    };
  }, [player, title]);

  const activeSubTrack = useMemo(
    () => subtitles.find((t) => t.id === activeSubId) || null,
    [subtitles, activeSubId]
  );

  useEffect(() => {
    if (!activeSubTrack?.cues?.length) {
      setCueText("");
      return;
    }
    const next = cueAtTime(
      activeSubTrack.cues,
      currentTime,
      activeSubTrack.offset || 0,
      activeSubTrack.rate || 1
    );
    setCueText(next);
  }, [currentTime, activeSubTrack]);

  const seekForSubs = useCallback(
    (time) => {
      try {
        player.currentTime = time;
        setCurrentTime(time);
      } catch {
        /* ignore */
      }
      showControls();
    },
    [player, showControls]
  );

  // Auto quality: drop on stall, climb when buffer is healthy (cap 720p)
  useEffect(() => {
    if (offlineUri || qualityMode !== "auto" || status !== "ready" || !sources.length)
      return;
    const id = setInterval(() => {
      try {
        const t = player.currentTime || 0;
        const buf = player.bufferedPosition;
        const playing = player.playing;
        const ahead =
          typeof buf === "number" && buf >= 0 ? buf - t : 20;

        if (playing && ahead < 2.5) {
          stallMsRef.current += 1000;
          healthyMsRef.current = 0;
          if (stallMsRef.current >= 4000) {
            const next = lowerQualityIndex(sources, qualityIndex);
            if (next !== qualityIndex) {
              resumeAtRef.current = t;
              fallbackTried.current = false;
              setUseWatchFallback(false);
              setQualityIndex(next);
            }
            stallMsRef.current = 0;
          }
        } else if (playing && ahead > 12) {
          healthyMsRef.current += 1000;
          stallMsRef.current = 0;
          if (healthyMsRef.current >= 20000) {
            const next = higherQualityIndex(sources, qualityIndex, AUTO_MAX);
            if (next !== qualityIndex) {
              resumeAtRef.current = t;
              fallbackTried.current = false;
              setUseWatchFallback(false);
              setQualityIndex(next);
            }
            healthyMsRef.current = 0;
          }
        } else {
          stallMsRef.current = 0;
        }
      } catch {
        /* ignore */
      }
    }, 1000);
    return () => clearInterval(id);
  }, [qualityMode, status, sources, qualityIndex, player]);

  // Resolve offline file by download id (route params mangle file:// URIs)
  useEffect(() => {
    if (!downloadId) {
      setOfflineUri("");
      setOfflineReady(true);
      return;
    }
    let cancelled = false;
    const vaultPlayRef = { uri: "" };
    setOfflineReady(false);
    (async () => {
      try {
        await hydrateDownloads();
        const item = getDownloadById(downloadId);
        if (!item?.fileUri) {
          if (!cancelled) {
            setError("Downloaded file not found.");
            setStatus("error");
            setOfflineReady(true);
          }
          return;
        }

        let playFileUri = item.fileUri;
        if (item.inVault) {
          if (!isVaultUnlocked()) {
            if (!cancelled) {
              setError(
                "This file is in Movie Safe. Unlock the vault from Downloads (tap Device storage 5 times), then play again."
              );
              setStatus("error");
              setOfflineReady(true);
            }
            return;
          }
          playFileUri = await prepareVaultPlayUri(item);
          vaultPlayRef.uri = playFileUri;
        }

        const info = await FileSystem.getInfoAsync(playFileUri);
        const minBytes = 256 * 1024;
        if (!info.exists || (info.size != null && info.size < minBytes)) {
          if (!cancelled) {
            setError(
              item.status === "completed"
                ? "Download file is missing or incomplete."
                : "Not enough downloaded yet — wait for at least ~5% or resume the download."
            );
            setStatus("error");
            setOfflineReady(true);
          }
          return;
        }
        if (!cancelled) {
          setOfflineUri(playFileUri);
          setSources([
            {
              url: playFileUri,
              resolution: item.resolution || "Offline",
              height: item.height || 0,
              format: "MP4",
              size_bytes: info.size || item.bytesWritten || null,
            },
          ]);
          setQualityMode("manual");
          setQualityIndex(0);
          userWantsPlayRef.current = wantsAutoplay;
          setWaitingToPlay(false);
          setStatus("ready");
          setOfflineReady(true);
          showControlsRef.current?.();
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            toUserMessage(err, "Couldn't open download. Try again.")
          );
          setStatus("error");
          setOfflineReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (vaultPlayRef.uri) {
        releaseVaultPlayUri(vaultPlayRef.uri).catch(() => {});
      }
    };
  }, [downloadId, wantsAutoplay]);

  const load = useCallback(async () => {
    if (downloadId) return; // handled by offline effect

    if (!subjectId || !detailPath) {
      setError("Missing playback info.");
      setStatus("error");
      return;
    }

    const streamKey = `${subjectId}|${detailPath}|${se}|${ep}`;
    const isNewEpisode = streamKeyRef.current !== streamKey;

    setError("");
    setUseWatchFallback(false);
    fallbackTried.current = false;
    userWantsPlayRef.current = wantsAutoplay;
    preloadedRef.current = false;
    setWaitingToPlay(wantsAutoplay);

    const applySources = (nextSources) => {
      setSources(nextSources);
      // Only reset quality when switching title/episode — never when UI helpers
      // recreate and accidentally re-trigger load (e.g. closing settings).
      if (isNewEpisode) {
        streamKeyRef.current = streamKey;
        setQualityMode("auto");
        setQualityIndex(pickAutoIndex(nextSources, AUTO_MAX));
      }
      setStatus("ready");
      showControlsRef.current?.();
    };

    const streamParams = { subjectId, detailPath, se, ep };
    const cached = getCachedStreams(streamParams);
    if (cached?.sources?.length) {
      applySources(cached.sources);
      return;
    }

    setStatus("loading");
    try {
      const result = await prefetchStreams(streamParams);
      if (!result.sources.length) {
        throw new Error("No streams available for this title.");
      }
      applySources(result.sources);
    } catch (err) {
      setError(
        toUserMessage(
          err,
          "Couldn't load streams. Check your connection and try again."
        )
      );
      setStatus("error");
    }
  }, [downloadId, subjectId, detailPath, se, ep, wantsAutoplay]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setExpanded(false);
    setSubtitles([]);
    setActiveSubId("off");
    setCueText("");
    loadedUriRef.current = "";
  }, [subjectId, detailPath, se, ep, downloadId]);

  const handleFirstFrame = useCallback(() => {
    // Don't reset position after seeks — only finish the initial preload once
    if (preloadedRef.current) return;
    finishPreload();
  }, [finishPreload]);

  // Load / replace media only when the URI actually changes (not on every render)
  const loadedUriRef = useRef("");
  useEffect(() => {
    if (!resumeReady) return;
    if (!playUri || status !== "ready") return;
    if (downloadId && !offlineReady) return;
    if (loadedUriRef.current === playUri) return;

    let cancelled = false;
    preloadedRef.current = false;
    clearPreloadTimers();
    loadedUriRef.current = playUri;

    const isOffline = Boolean(offlineUri);

    if (userWantsPlayRef.current && !isOffline && !resumeOfferRef.current) {
      setWaitingToPlay(true);
    }

    (async () => {
      try {
        if (typeof player.replaceAsync === "function") {
          await player.replaceAsync(playUri);
        } else {
          player.replace(playUri, true);
        }
        if (cancelled) return;

        if (isOffline) {
          try {
            player.muted = false;
            if (resumeOfferRef.current) {
              player.pause();
              setWaitingToPlay(false);
            } else if (wantsAutoplay) {
              player.play();
            }
          } catch {
            /* ignore */
          }
          preloadedRef.current = true;
          if (!resumeOfferRef.current) setWaitingToPlay(false);
          return;
        }

        player.muted = true;
        player.play();

        const done = () => {
          if (cancelled || preloadedRef.current) return;
          finishPreload();
        };

        if (isPreloadReady()) {
          done();
          return;
        }

        preloadPollRef.current = setInterval(() => {
          if (isPreloadReady()) done();
        }, 250);

        preloadTimerRef.current = setTimeout(done, PRELOAD_TIMEOUT_MS);
      } catch {
        if (!cancelled) {
          preloadedRef.current = true;
          setWaitingToPlay(false);
          if (loadedUriRef.current === playUri) loadedUriRef.current = "";
        }
      }
    })();

    return () => {
      cancelled = true;
      clearPreloadTimers();
    };
  }, [
    resumeReady,
    playUri,
    status,
    player,
    clearPreloadTimers,
    finishPreload,
    isPreloadReady,
    offlineUri,
    offlineReady,
    downloadId,
    wantsAutoplay,
  ]);

  useEffect(() => {
    return () => {
      clearTimeout(hideTimer.current);
      clearTimeout(singleTapTimer.current);
      clearPreloadTimers();
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, [clearPreloadTimers]);

  // Lock orientation on the player — expand stays landscape until toggled off.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (expanded || orientMode === "landscape") {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.LANDSCAPE
          );
        } else {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP
          );
        }
      } catch {
        /* Expo Go may limit orientation */
      }
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
  }, [expanded, orientMode]);

  const toggleExpand = useCallback(() => {
    showControls();
    setExpanded((v) => !v);
  }, [showControls]);

  const immersive = expanded || orientMode === "landscape";
  const chromeTop = immersive ? 0 : Math.max(insets.top, 8);
  const chromeBottom = immersive ? 0 : Math.max(insets.bottom, 16);

  const longEdge = Math.max(screenSize.width, screenSize.height);
  const shortEdge = Math.min(screenSize.width, screenSize.height);
  const layoutW = immersive
    ? isLandscape
      ? longEdge
      : winW + insets.left + insets.right
    : winW;
  const layoutH = immersive
    ? isLandscape
      ? shortEdge
      : winH + insets.top + insets.bottom
    : winH;
  const layoutX = immersive && !isLandscape ? -insets.left : 0;
  const layoutY = immersive && !isLandscape ? -insets.top : 0;

  const handleBack = useCallback(() => {
    showControls();
    if (immersive) {
      setExpanded(false);
      if (orientMode === "landscape") {
        setOrientMode("sensor");
      }
      return;
    }
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [immersive, orientMode, showControls, router]);

  // Hide Android nav + status bar in landscape fullscreen.
  useEffect(() => {
    if (Platform.OS === "android") {
      try {
        NavigationBar.setHidden(immersive);
      } catch {
        /* Expo Go may limit system UI APIs */
      }
    }

    if (immersive) {
      RNStatusBar.setHidden(true, "fade");
    } else {
      RNStatusBar.setHidden(false, "fade");
    }

    return () => {
      if (Platform.OS === "android") {
        try {
          NavigationBar.setHidden(false);
        } catch {
          /* ignore */
        }
      }
      RNStatusBar.setHidden(false, "fade");
    };
  }, [immersive]);

  const applyQuality = (mode, index) => {
    try {
      resumeAtRef.current = player.currentTime || 0;
    } catch {
      resumeAtRef.current = 0;
    }
    fallbackTried.current = false;
    setUseWatchFallback(false);
    setQualityMode(mode);
    setQualityIndex(index);
    setSettingsOpen(false);
    showControls();
  };

  const chooseResume = useCallback(() => {
    const pos = Number(resumeOffer?.position) || 0;
    resumeAtRef.current = pos;
    setResumeOffer(null);
    userWantsPlayRef.current = true;
    setWaitingToPlay(true);
    showControls();
    if (!preloadedRef.current) return;
    try {
      player.currentTime = pos;
      player.muted = false;
      player.play();
    } catch {
      /* ignore */
    }
  }, [resumeOffer, player, showControls]);

  const chooseStartOver = useCallback(() => {
    const key = progressKeyRef.current;
    if (key) clearWatchProgress(key).catch(() => {});
    resumeAtRef.current = 0;
    setResumeOffer(null);
    userWantsPlayRef.current = true;
    setWaitingToPlay(true);
    showControls();
    if (!preloadedRef.current) return;
    try {
      player.currentTime = 0;
      player.muted = false;
      player.play();
    } catch {
      /* ignore */
    }
  }, [player, showControls]);

  const applyDisplayMode = (id) => {
    setDisplayMode(id);
    setVideoPan({ x: 0, y: 0 });
    setSettingsOpen(false);
    showControls();
  };

  const flashChipHint = useCallback((text) => {
    setChipHint(text);
    setTimeout(() => setChipHint(""), 900);
  }, []);

  const cycleDisplayMode = useCallback(() => {
    const idx = DISPLAY_MODES.findIndex((m) => m.id === displayMode);
    const next = DISPLAY_MODES[(idx + 1) % DISPLAY_MODES.length];
    setDisplayMode(next.id);
    setVideoPan({ x: 0, y: 0 });
    flashChipHint(next.title);
    showControls();
  }, [displayMode, flashChipHint, showControls]);

  const cyclePlaybackSpeed = useCallback(() => {
    let idx = PLAYBACK_SPEEDS.findIndex(
      (s) => Math.abs(s - playbackRate) < 0.01
    );
    if (idx < 0) idx = PLAYBACK_SPEEDS.indexOf(1);
    const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
    try {
      player.playbackRate = next;
    } catch {
      /* ignore */
    }
    setPlaybackRate(next);
    flashChipHint(formatSpeed(next));
    showControls();
  }, [playbackRate, player, flashChipHint, showControls]);

  const displayActive =
    DISPLAY_MODES.find((m) => m.id === displayMode) || DISPLAY_MODES[0];
  const canPanVideo = displayActive.pan && !locked;

  const seekBy = (delta, side) => {
    try {
      const next = Math.max(
        0,
        Math.min((player.duration || 0) || Infinity, (player.currentTime || 0) + delta)
      );
      player.currentTime = next;
      setCurrentTime(next);
      if (!player.playing) player.play();
      const hintSide = side || (delta > 0 ? "right" : "left");
      setSeekHint({
        side: hintSide,
        text: delta > 0 ? `+${SEEK_STEP}s` : `-${SEEK_STEP}s`,
      });
      setTimeout(() => setSeekHint(null), 700);
    } catch {
      /* ignore */
    }
  };

  const onTapSide = useCallback(
    (side) => {
      if (locked) return;
      const now = Date.now();
      const last = lastTapRef.current;

      if (now - last.t < 320 && last.side === side) {
        clearTimeout(singleTapTimer.current);
        lastTapRef.current = { t: 0, side: "" };
        seekBy(side === "right" ? SEEK_STEP : -SEEK_STEP, side);
        showControls();
        return;
      }

      lastTapRef.current = { t: now, side };
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = setTimeout(() => {
        if (controlsVisible) {
          setControlsVisible(false);
          clearTimeout(hideTimer.current);
        } else {
          showControls();
        }
        lastTapRef.current = { t: 0, side: "" };
      }, 320);
    },
    [locked, controlsVisible, showControls]
  );

  const scrubTo = useCallback(
    (pageX) => {
      // Refresh bar window position in case layout shifted (rotate / immersive)
      try {
        barRef.current?.measureInWindow?.((x, _y, width) => {
          if (width > 0) barLayoutRef.current = { x, width };
        });
      } catch {
        /* ignore */
      }
      const { x, width } = barLayoutRef.current;
      const w = width > 1 ? width : barWidthRef.current || 1;
      const ratio = Math.max(0, Math.min(1, (pageX - x) / w));
      let dur = 0;
      try {
        dur = player.duration || duration || 0;
      } catch {
        dur = duration || 0;
      }
      if (!(dur > 0)) return;
      const t = ratio * dur;
      try {
        player.currentTime = t;
        setCurrentTime(t);
      } catch {
        /* ignore */
      }
    },
    [player, duration]
  );

  const scrubber = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !locked,
        onMoveShouldSetPanResponder: () => !locked,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          scrubbingRef.current = true;
          setScrubbing(true);
          showControls();
          scrubTo(e.nativeEvent.pageX);
        },
        onPanResponderMove: (e) => {
          scrubTo(e.nativeEvent.pageX);
        },
        onPanResponderRelease: (e) => {
          scrubTo(e.nativeEvent.pageX);
          scrubbingRef.current = false;
          setScrubbing(false);
          try {
            if (!player.playing) player.play();
          } catch {
            /* ignore */
          }
          scheduleHide();
        },
        onPanResponderTerminate: () => {
          scrubbingRef.current = false;
          setScrubbing(false);
        },
      }),
    [locked, player, scrubTo, showControls, scheduleHide]
  );

  const videoPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          canPanVideo && (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8),
        onPanResponderGrant: () => {
          videoPanStart.current = { ...videoPan };
          showControls();
        },
        onPanResponderMove: (_, g) => {
          setVideoPan({
            x: videoPanStart.current.x + g.dx,
            y: videoPanStart.current.y + g.dy,
          });
        },
      }),
    [canPanVideo, videoPan, showControls]
  );

  const progress = duration > 0 ? currentTime / duration : 0;
  const qualityLabel =
    qualityMode === "auto"
      ? `Auto (${active?.resolution || "—"})`
      : active?.resolution || "—";

  const episodeLabel =
    Number(se) > 0 || Number(ep) > 0 ? `S${se}E${ep}` : "";

  return (
    <View style={styles.root}>
      <StatusBar hidden={immersive} style="light" />
      {Platform.OS === "android" ? <NavigationBar hidden={immersive} /> : null}
      <View
        style={[
          styles.stage,
          {
            left: layoutX,
            top: layoutY,
            width: layoutW,
            height: layoutH,
          },
        ]}
      >
        {status === "loading" ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.hint}>Loading…</Text>
            <Pressable
              style={[styles.backChip, { top: Math.max(insets.top, 12) + 8 }]}
              onPress={handleBack}
            >
              <Ionicons name="chevron-back" size={20} color={colors.accent} />
              <Text style={styles.backChipText}>Back</Text>
            </Pressable>
          </View>
        ) : status === "error" ? (
          <View style={styles.centerFill}>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
            <Pressable
              style={[styles.backChip, { top: Math.max(insets.top, 12) + 8 }]}
              onPress={handleBack}
            >
              <Ionicons name="chevron-back" size={20} color={colors.accent} />
              <Text style={styles.backChipText}>Back</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={[styles.videoStage, { width: layoutW, height: layoutH }]}>
              <View
                style={[
                  styles.videoTransform,
                  {
                    width: layoutW,
                    height: layoutH,
                    transform: [
                      { translateX: videoPan.x },
                      { translateY: videoPan.y },
                      { scale: displayActive.scale },
                    ],
                  },
                ]}
              >
                <VideoView
                  style={{ width: layoutW, height: layoutH }}
                  player={player}
                  nativeControls={false}
                  surfaceType="textureView"
                  contentFit={displayActive.contentFit}
                  allowsPictureInPicture
                  onFirstFrameRender={handleFirstFrame}
                />
              </View>
            </View>

            {chipHint ? (
              <View style={styles.chipHint} pointerEvents="none">
                <Text style={styles.chipHintText}>{chipHint}</Text>
              </View>
            ) : null}

            {seekHint ? (
              <View
                style={[
                  styles.seekHint,
                  seekHint.side === "left"
                    ? styles.seekHintLeft
                    : styles.seekHintRight,
                ]}
                pointerEvents="none"
              >
                <Text style={styles.seekHintText}>{seekHint.text}</Text>
              </View>
            ) : null}

            {cueText && !locked ? (
              <View
                style={[
                  styles.subOverlay,
                  { bottom: (controlsVisible ? 72 : 24) + (chromeBottom || 0) },
                ]}
                pointerEvents="none"
              >
                <Text style={styles.subText}>{cueText}</Text>
              </View>
            ) : null}

            {locked ? (
              <Pressable
                style={[styles.unlockFab, { bottom: immersive ? 16 : 24 + insets.bottom }]}
                onPress={() => {
                  setLocked(false);
                  setControlsVisible(true);
                  scheduleHide();
                }}
              >
                <Ionicons name="lock-open" size={20} color={colors.accentInk} />
                <Text style={styles.unlockText}>Unlock</Text>
              </Pressable>
            ) : null}

            {!locked ? (
              <View
                style={[styles.tapRow, { width: layoutW, height: layoutH }]}
                pointerEvents="box-none"
                {...(canPanVideo ? videoPanResponder.panHandlers : {})}
              >
                <Pressable
                  style={styles.tapHalf}
                  onPress={() => onTapSide("left")}
                />
                <Pressable
                  style={styles.tapHalf}
                  onPress={() => onTapSide("right")}
                />
              </View>
            ) : null}

            {!locked && controlsVisible ? (
              <View
                style={[styles.controlsLayer, { width: layoutW, height: layoutH }]}
                key={`controls-${layoutW}x${layoutH}`}
                collapsable={false}
                pointerEvents="box-none"
              >
                <View style={[styles.topBar, { paddingTop: chromeTop || 8 }]}>
                  <Pressable onPress={handleBack} style={styles.iconBtn}>
                    <Ionicons
                      name="chevron-back"
                      size={28}
                      color={colors.accent}
                    />
                  </Pressable>
                  <View style={styles.topCopy}>
                    <Text style={styles.title} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {[episodeLabel, qualityLabel].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setLocked(true)}
                    style={styles.iconBtn}
                  >
                    <Ionicons
                      name="lock-closed"
                      size={22}
                      color={colors.text}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setSettingsTab("quality");
                      setSettingsOpen(true);
                    }}
                    style={styles.iconBtn}
                  >
                    <Ionicons
                      name="settings-outline"
                      size={24}
                      color={colors.text}
                    />
                  </Pressable>
                </View>

                <View style={styles.centerPlay} pointerEvents="box-none">
                  <Pressable style={styles.bigPlay} onPress={togglePlayPause}>
                    {waitingToPlay && !isPlaying ? (
                      <ActivityIndicator color="#fff" size="large" />
                    ) : (
                      <Ionicons
                        name={isPlaying ? "pause" : "play"}
                        size={40}
                        color="#fff"
                      />
                    )}
                  </Pressable>
                </View>

                <View
                  style={[
                    styles.bottomBar,
                    { paddingBottom: (chromeBottom || 8) + (immersive ? 6 : 0) },
                  ]}
                >
                  <Text style={styles.time}>{formatTime(currentTime)}</Text>
                  <View
                    ref={barRef}
                    style={styles.barTrack}
                    onLayout={(e) => {
                      const width = e.nativeEvent.layout.width || 1;
                      barWidthRef.current = width;
                      barRef.current?.measureInWindow?.((x, _y, w) => {
                        barLayoutRef.current = { x, width: w > 0 ? w : width };
                      });
                    }}
                    {...scrubber.panHandlers}
                  >
                    <View style={styles.barBg} />
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.barKnob,
                        {
                          left: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.time}>{formatTime(duration)}</Text>
                  <View style={styles.quickActions}>
                    <Pressable
                      onPress={() => {
                        setSettingsTab("subs");
                        setSettingsOpen(true);
                        showControls();
                      }}
                      style={styles.quickBtn}
                      hitSlop={6}
                    >
                      <Ionicons
                        name={activeSubTrack ? "text" : "text-outline"}
                        size={18}
                        color={activeSubTrack ? colors.accent : colors.text}
                      />
                    </Pressable>
                    <Pressable
                      onPress={cycleDisplayMode}
                      style={styles.quickBtn}
                      hitSlop={6}
                    >
                      <Ionicons
                        name={displayActive.icon}
                        size={18}
                        color={colors.accent}
                      />
                    </Pressable>
                    <Pressable
                      onPress={cyclePlaybackSpeed}
                      style={styles.quickBtn}
                      hitSlop={6}
                    >
                      <Text style={styles.speedLabel}>
                        {formatSpeed(playbackRate)}
                      </Text>
                    </Pressable>
                    <Pressable onPress={toggleExpand} style={styles.quickBtn} hitSlop={6}>
                      <Ionicons
                        name={expanded || isLandscape ? "contract" : "expand"}
                        size={20}
                        color={colors.text}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>

      <Modal
        visible={Boolean(resumeOffer)}
        transparent
        animationType="fade"
        onRequestClose={chooseResume}
      >
        <View style={styles.resumeBackdrop}>
          <View style={styles.resumeCard}>
            <Text style={styles.resumeTitle}>Continue watching?</Text>
            <Text style={styles.resumeSub}>
              You left off at {formatResumeTime(resumeOffer?.position || 0)}
              {resumeOffer?.duration
                ? ` of ${formatResumeTime(resumeOffer.duration)}`
                : ""}
            </Text>
            <Pressable style={styles.resumePrimary} onPress={chooseResume}>
              <Ionicons name="play" size={18} color={colors.accentInk} />
              <Text style={styles.resumePrimaryText}>Resume</Text>
            </Pressable>
            <Pressable style={styles.resumeSecondary} onPress={chooseStartOver}>
              <Text style={styles.resumeSecondaryText}>Start from beginning</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSettingsOpen(false)}
        >
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetTabs}>
              <Pressable
                onPress={() => setSettingsTab("quality")}
                style={[
                  styles.sheetTab,
                  settingsTab === "quality" && styles.sheetTabOn,
                ]}
              >
                <Text
                  style={[
                    styles.sheetTabText,
                    settingsTab === "quality" && styles.sheetTabTextOn,
                  ]}
                >
                  Quality
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSettingsTab("screen")}
                style={[
                  styles.sheetTab,
                  settingsTab === "screen" && styles.sheetTabOn,
                ]}
              >
                <Text
                  style={[
                    styles.sheetTabText,
                    settingsTab === "screen" && styles.sheetTabTextOn,
                  ]}
                >
                  Screen
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSettingsTab("rotate")}
                style={[
                  styles.sheetTab,
                  settingsTab === "rotate" && styles.sheetTabOn,
                ]}
              >
                <Text
                  style={[
                    styles.sheetTabText,
                    settingsTab === "rotate" && styles.sheetTabTextOn,
                  ]}
                >
                  Rotate
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSettingsTab("subs")}
                style={[
                  styles.sheetTab,
                  settingsTab === "subs" && styles.sheetTabOn,
                ]}
              >
                <Text
                  style={[
                    styles.sheetTabText,
                    settingsTab === "subs" && styles.sheetTabTextOn,
                  ]}
                >
                  Subs
                </Text>
              </Pressable>
            </View>

            {settingsTab === "quality" ? (
              <View style={styles.sheetBody}>
                <Pressable
                  style={[
                    styles.optRow,
                    qualityMode === "auto" && styles.optRowOn,
                  ]}
                  onPress={() =>
                    applyQuality("auto", pickAutoIndex(sources, AUTO_MAX))
                  }
                >
                  <View>
                    <Text style={styles.optTitle}>Auto</Text>
                    <Text style={styles.optSub}>
                      Adapts to your connection (up to {AUTO_MAX}p)
                    </Text>
                  </View>
                  {qualityMode === "auto" ? (
                    <Ionicons name="checkmark" size={20} color={colors.accent} />
                  ) : null}
                </Pressable>
                {sources.map((s, i) => {
                  const on = qualityMode === "manual" && i === qualityIndex;
                  const size = formatBytes(s.size_bytes);
                  return (
                    <Pressable
                      key={`${s.resolution}-${i}`}
                      style={[styles.optRow, on && styles.optRowOn]}
                      onPress={() => applyQuality("manual", i)}
                    >
                      <View>
                        <Text style={styles.optTitle}>{s.resolution}</Text>
                        {size ? (
                          <Text style={styles.optSub}>{size}</Text>
                        ) : null}
                      </View>
                      {on ? (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={colors.accent}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : settingsTab === "screen" ? (
              <View style={styles.sheetBody}>
                {DISPLAY_MODES.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={[
                      styles.optRow,
                      displayMode === opt.id && styles.optRowOn,
                    ]}
                    onPress={() => applyDisplayMode(opt.id)}
                  >
                    <View style={styles.optCopy}>
                      <Text style={styles.optTitle}>
                        {opt.id === "fit"
                          ? "Fit to screen"
                          : opt.id === "cover"
                            ? "Fill screen"
                            : opt.title}
                      </Text>
                      <Text style={styles.optSub}>{opt.sub}</Text>
                    </View>
                    {displayMode === opt.id ? (
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color={colors.accent}
                      />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : settingsTab === "subs" ? (
              <SubtitlePanel
                title={title}
                detailPath={detailPath}
                se={se}
                ep={ep}
                currentTime={currentTime}
                cueText={cueText}
                subtitles={subtitles}
                activeSubId={activeSubId}
                onSubtitlesChange={setSubtitles}
                onActiveSubIdChange={setActiveSubId}
                onSeek={seekForSubs}
              />
            ) : (
              <View style={styles.sheetBody}>
                {[
                  {
                    id: "sensor",
                    title: "Auto (both)",
                    sub: "Portrait and landscape",
                  },
                  {
                    id: "landscape",
                    title: "Landscape",
                    sub: "Horizontal only",
                  },
                  {
                    id: "portrait",
                    title: "Portrait",
                    sub: "Vertical only",
                  },
                ].map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={[
                      styles.optRow,
                      orientMode === opt.id && styles.optRowOn,
                    ]}
                    onPress={() => {
                      setOrientMode(opt.id);
                      if (opt.id === "landscape") setExpanded(true);
                      if (opt.id === "portrait") setExpanded(false);
                      setSettingsOpen(false);
                      showControls();
                    }}
                  >
                    <View>
                      <Text style={styles.optTitle}>{opt.title}</Text>
                      <Text style={styles.optSub}>{opt.sub}</Text>
                    </View>
                    {orientMode === opt.id ? (
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color={colors.accent}
                      />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  stage: {
    position: "absolute",
    backgroundColor: "#000",
    overflow: "hidden",
  },
  videoStage: {
    overflow: "hidden",
    backgroundColor: "#000",
  },
  videoTransform: {
    alignItems: "center",
    justifyContent: "center",
  },
  controlsLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 10,
    elevation: 10,
  },
  tapRow: {
    position: "absolute",
    top: 0,
    left: 0,
    flexDirection: "row",
    zIndex: 8,
    elevation: 8,
  },
  tapHalf: {
    flex: 1,
    height: "100%",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    gap: 2,
    minHeight: 52,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  topCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  sub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginTop: 2,
  },
  iconBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  centerPlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  bigPlay: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingTop: 10,
    paddingBottom: 6,
    minHeight: 56,
  },
  quickBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  quickActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 2,
  },
  speedLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  chipHint: {
    position: "absolute",
    alignSelf: "center",
    top: "18%",
    zIndex: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  chipHintText: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 14,
  },
  time: {
    color: "#fff",
    fontSize: 10,
    fontVariant: ["tabular-nums"],
    minWidth: 36,
  },
  barTrack: {
    flex: 1,
    height: 28,
    justifyContent: "center",
  },
  barBg: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  barFill: {
    position: "absolute",
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 4,
    elevation: 2,
  },
  barKnob: {
    position: "absolute",
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#fff",
  },
  seekHint: {
    position: "absolute",
    top: "42%",
    zIndex: 12,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.md,
  },
  seekHintLeft: {
    left: "10%",
  },
  seekHintRight: {
    right: "10%",
  },
  seekHintText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 18,
  },
  subOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 11,
    alignItems: "center",
  },
  subText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    overflow: "hidden",
    maxWidth: "100%",
  },
  unlockFab: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  unlockText: {
    color: colors.accentInk,
    fontWeight: "800",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  centerFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: "#000",
    zIndex: 4,
  },
  backChip: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    elevation: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.panel,
  },
  backChipText: {
    color: colors.text,
    fontWeight: "700",
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    textAlign: "center",
    fontSize: 14,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  retryText: {
    color: colors.accentInk,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  resumeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  resumeCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  resumeTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  resumeSub: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  resumePrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 14,
  },
  resumePrimaryText: {
    color: colors.accentInk,
    fontWeight: "800",
    fontSize: 15,
  },
  resumeSecondary: {
    alignItems: "center",
    paddingVertical: 12,
  },
  resumeSecondaryText: {
    color: colors.accentLight,
    fontWeight: "700",
    fontSize: 14,
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    maxHeight: "70%",
  },
  sheetTabs: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
    gap: 6,
    marginBottom: 8,
  },
  sheetTab: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.panel,
    alignItems: "center",
  },
  sheetTabOn: {
    backgroundColor: colors.accent,
  },
  sheetTabText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13,
  },
  sheetTabTextOn: {
    color: colors.accentInk,
  },
  sheetBody: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  optRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  optRowOn: {
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  optCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  optTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  optSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
});
