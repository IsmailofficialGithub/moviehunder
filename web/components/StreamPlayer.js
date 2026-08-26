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
  shortSubtitleLabel,
} from "../lib/subtitles";
import BtnSpinner from "./BtnSpinner";
import styles from "./StreamPlayer.module.css";
import { friendlyError, friendlyPlaybackError } from "../lib/errors";
import {
  clearMediaSession,
  setPageTitle,
  updateMediaSession,
} from "../lib/pageMedia";

const DISPLAY_MODES = [
  { id: "fit", label: "Fit", hint: "Full video visible", fit: "contain", scale: 1 },
  { id: "stretch", label: "Stretch", hint: "Fill, may distort", fit: "fill", scale: 1 },
  { id: "cover", label: "Fill", hint: "Crop edges", fit: "cover", scale: 1 },
  { id: "zoom", label: "Zoom", hint: "Larger view", fit: "contain", scale: 1.18 },
];

/** Render overlays inside the fullscreen element so they stay visible when expanded. */
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
  const resumeAtRef = useRef(0);
  const activeTrackRef = useRef(null);
  const cueElRef = useRef(null);
  const lastCueRef = useRef("");
  const lastClockPaintRef = useRef(0);

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
        /* lock not allowed on some browsers until gesture / desktop */
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
        /* ignore */
      }
    };
  }, [mounted]);

  const displayTitle = useMemo(() => {
    const base = cleanSearchTitle(title, detailPath) || title || detailPath || "Player";
    if (Number(se) > 0 || Number(ep) > 0) return `${base} · S${se}E${ep}`;
    return base;
  }, [title, detailPath, se, ep]);

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
          /* ignore */
        }
        return;
      }
      lastPosAt = now;
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
    const resume = resumeAtRef.current;
    video.src = src;
    video.load();
    const onReady = () => {
      if (resume > 0) {
        try {
          video.currentTime = resume;
        } catch {
          /* ignore */
        }
      }
      video.play().catch(() => {});
    };
    video.addEventListener("loadeddata", onReady, { once: true });
    return () => video.removeEventListener("loadeddata", onReady);
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

  const searchQuery = useMemo(
    () => cleanSearchTitle(title, detailPath),
    [title, detailPath]
  );

  const searchSubdl = useCallback(async () => {
    if (!searchQuery) {
      setOsMessage("No title to search");
      return;
    }
    setOsStatus("loading");
    setOsMessage("");
    setOsResults([]);
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
      if (!data.configured) {
        setOsStatus("need_key");
        setOsMessage("Online subtitles aren’t set up yet.");
        return;
      }
      if (!data.ok) throw new Error(data.error || "Search failed");
      setOsResults(data.results || []);
      setOsStatus("ready");
      setOsMessage(
        data.results?.length
          ? `Found ${data.results.length} online — pick one close to your quality (e.g. CAM)`
          : "No matches. Try Upload with a matching .srt"
      );
    } catch (err) {
      setOsStatus("error");
      setOsMessage(friendlyError(err, "Subtitle search didn’t work. Try again."));
      setOsResults([]);
    }
  }, [searchQuery, se, ep]);

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

  /** Pin the current/next subtitle line to the current video time. */
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
          <button
            type="button"
            className={`${styles.settingsBtn} ${styles.settingsBtnTitle}`}
            aria-label="Playback settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.4-2.3.7a7.6 7.6 0 0 0-1.7-1L15 4h-4l-.5 2.1a7.6 7.6 0 0 0-1.7 1l-2.3-.7-2 3.4 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.7a7.6 7.6 0 0 0 1.7 1L11 20h4l.5-2.1a7.6 7.6 0 0 0 1.7-1l2.3.7 2-3.4-2-1.2Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className={styles.actions}>
          <label className={`${styles.selectLabel} ${styles.desktopOnly}`}>
            Quality
            <select
              className={styles.select}
              value={qualityIndex}
              onChange={onQualityChange}
              disabled={!sources.length}
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

          <label className={`${styles.selectLabel} ${styles.desktopOnly}`}>
            Display
            <select
              className={styles.select}
              value={displayMode}
              onChange={(e) => setDisplayMode(e.target.value)}
            >
              {DISPLAY_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={`${styles.subToggle} ${styles.desktopOnly} ${
              subPanelOpen ? styles.subToggleOn : ""
            }`}
            onClick={() => setSubPanelOpen((v) => !v)}
          >
            {subButtonLabel}
          </button>

          {prevEpisode || nextEpisode ? (
            <div className={styles.epNav}>
              {prevEpisode && onPrevEpisode ? (
                <button
                  type="button"
                  className={styles.prevBtn}
                  onClick={goPrev}
                  disabled={busy}
                  aria-busy={navBusy === "prev" || undefined}
                >
                  {navBusy === "prev" ? (
                    <BtnSpinner />
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M15 6l-6 6 6 6"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Prev episode
                    </>
                  )}
                </button>
              ) : null}
              {nextEpisode && onNextEpisode ? (
                <button
                  type="button"
                  className={styles.nextBtn}
                  onClick={goNext}
                  disabled={busy}
                  aria-busy={navBusy === "next" || undefined}
                >
                  {navBusy === "next" ? (
                    <BtnSpinner />
                  ) : (
                    <>
                      Next episode
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M9 6l6 6-6 6"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </>
                  )}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {settingsOpen ? (
        <FullscreenPortal>
        <div className={styles.settingsModal} role="dialog" aria-modal="true">
          <button
            type="button"
            className={styles.subBackdrop}
            aria-label="Close settings"
            onClick={() => setSettingsOpen(false)}
          />
          <section className={styles.settingsPanel}>
            <div className={styles.settingsHead}>
              <h2>Settings</h2>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => setSettingsOpen(false)}
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
                  <button
                    key={m.id}
                    type="button"
                    className={`${styles.displayChip} ${
                      displayMode === m.id ? styles.displayChipOn : ""
                    }`}
                    onClick={() => setDisplayMode(m.id)}
                  >
                    <strong>{m.label}</strong>
                    <span>{m.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className={`${styles.settingsAction} ${
                subPanelOpen ? styles.subToggleOn : ""
              }`}
              onClick={() => {
                setSettingsOpen(false);
                setSubPanelOpen(true);
              }}
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
        <div className={styles.subModal} role="dialog" aria-modal="true">
          <button
            type="button"
            className={styles.subBackdrop}
            aria-label="Close subtitles"
            onClick={() => setSubPanelOpen(false)}
          />
          <section className={styles.subPanel}>
          <div className={styles.subPanelTop}>
            <div>
              <h2>Subtitles</h2>
              <p>
                Subtitles are timestamped lines. This video (often CAM) usually
                starts at a different time than the .srt. Pause on a spoken
                line, then tap <strong>This line is now</strong>.
              </p>
            </div>
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => setSubPanelOpen(false)}
            >
              Close
            </button>
          </div>

          <div className={styles.subActions}>
            <button
              type="button"
              className={
                activeSubId === "off" ? styles.chipActive : styles.chip
              }
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
              className={styles.chip}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload .srt / .vtt
            </button>
            <button
              type="button"
              className={styles.chipPrimary}
              onClick={searchSubdl}
              disabled={osStatus === "loading"}
              aria-busy={osStatus === "loading" || undefined}
            >
              {osStatus === "loading" ? (
                <BtnSpinner />
              ) : (
                "Search online (SubDL)"
              )}
            </button>
          </div>

          {subtitles.length > 0 ? (
            <div className={styles.loadedList}>
              <div className={styles.osHead}>Loaded</div>
              <ul>
                {subtitles.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={
                        t.id === activeSubId ? styles.loadedActive : undefined
                      }
                      onClick={() => setActiveSubId(t.id)}
                    >
                      <span>{t.label}</span>
                      <span className={styles.osMeta}>
                        {t.cues.length} lines
                        {t.offset ? ` · ${formatOffsetLabel(t.offset)}` : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.tinyRemove}
                      onClick={() => removeTrack(t.id)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {activeTrack ? (
            <div className={styles.syncPanel}>
              <div className={styles.syncRow}>
                <span className={styles.syncLabel}>Match to video</span>
                <span className={styles.syncClock}>
                  Video {formatClock(videoTime)} · first line{" "}
                  {formatClock(activeTrack.cues[0]?.start || 0)} · offset{" "}
                  {formatOffsetLabel(activeTrack.offset)}
                </span>
              </div>
              <p className={styles.nowLine}>
                {cueText
                  ? `On screen: “${cueText.replace(/\n/g, " ")}”`
                  : "No line at this time — skip ahead in the movie, then align."}
              </p>
              <div className={styles.syncBtns}>
                <button type="button" onClick={() => jumpToCue(-1)}>
                  ← Prev line
                </button>
                <button
                  type="button"
                  className={styles.alignNow}
                  onClick={alignLineToNow}
                >
                  This line is now
                </button>
                <button type="button" onClick={() => jumpToCue(1)}>
                  Next line →
                </button>
              </div>
              <input
                type="range"
                className={styles.syncSlider}
                min={-180}
                max={180}
                step={0.1}
                value={Math.max(-180, Math.min(180, activeTrack.offset || 0))}
                onChange={(e) => setOffset(Number(e.target.value))}
              />
              <label className={styles.offsetInput}>
                Offset (seconds)
                <input
                  type="number"
                  step={0.1}
                  min={-600}
                  max={600}
                  value={activeTrack.offset || 0}
                  onChange={(e) => setOffset(Number(e.target.value))}
                />
              </label>
              <div className={styles.syncBtns}>
                <button type="button" onClick={() => nudgeOffset(-10)}>
                  −10s
                </button>
                <button type="button" onClick={() => nudgeOffset(-5)}>
                  −5s
                </button>
                <button type="button" onClick={() => nudgeOffset(-1)}>
                  −1s
                </button>
                <button type="button" onClick={() => setOffset(0)}>
                  Reset
                </button>
                <button type="button" onClick={() => nudgeOffset(1)}>
                  +1s
                </button>
                <button type="button" onClick={() => nudgeOffset(5)}>
                  +5s
                </button>
                <button type="button" onClick={() => nudgeOffset(10)}>
                  +10s
                </button>
              </div>
              <div className={styles.rateRow}>
                <span>Speed (if it drifts later in the movie)</span>
                <button
                  type="button"
                  className={
                    Math.abs((activeTrack.rate || 1) - 1) < 0.001
                      ? styles.chipActive
                      : styles.chip
                  }
                  onClick={() => setRate(1)}
                >
                  1.00×
                </button>
                <button
                  type="button"
                  className={styles.chip}
                  onClick={() => setRate(23.976 / 25)}
                >
                  23.98→25
                </button>
                <button
                  type="button"
                  className={styles.chip}
                  onClick={() => setRate(25 / 23.976)}
                >
                  25→23.98
                </button>
              </div>
            </div>
          ) : null}

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
              <div className={styles.osHead}>Online results — tap to use</div>
              <ul>
                {osResults.map((item) => {
                  const label = shortSubtitleLabel(
                    item.release || item.file_name,
                    item.language
                  );
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={osLoadingId === item.file_id}
                        onClick={() => loadOsSubtitle(item)}
                        title={item.release || item.file_name}
                      >
                        <span className={styles.osLang}>
                          {String(item.language || "en").slice(0, 7)}
                        </span>
                        <span className={styles.osName}>{label}</span>
                        <span className={styles.osMeta}>
                          {osLoadingId === item.file_id ? (
                            <BtnSpinner />
                          ) : (
                            "Use"
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>
        </div>
        </FullscreenPortal>
      ) : null}

      {status === "loading" ? (
        <div className={styles.banner} aria-busy="true">
          <BtnSpinner />
        </div>
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
          <MediaController className={styles.controller}>
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
            <div
              ref={cueElRef}
              className={styles.cueOverlay}
              hidden
              aria-live="polite"
            />
            <button
              type="button"
              className={styles.playerSettingsBtn}
              aria-label="Playback settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.4-2.3.7a7.6 7.6 0 0 0-1.7-1L15 4h-4l-.5 2.1a7.6 7.6 0 0 0-1.7 1l-2.3-.7-2 3.4 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.7a7.6 7.6 0 0 0 1.7 1L11 20h4l.5-2.1a7.6 7.6 0 0 0 1.7-1l2.3.7 2-3.4-2-1.2Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className={styles.centerOverlay}>
              <MediaSeekBackwardButton seekOffset={10} />
              <MediaPlayButton />
              <MediaSeekForwardButton seekOffset={10} />
            </div>
            <MediaLoadingIndicator slot="centered-chrome" />
            <MediaErrorDialog />
            <MediaControlBar className={styles.bottomBar}>
              <MediaTimeRange />
              <MediaTimeDisplay showDuration />
              <MediaMuteButton />
              <MediaVolumeRange />
              <MediaPlaybackRateButton rates={[0.5, 0.75, 1, 1.25, 1.5, 2]} />
              <MediaFullscreenButton />
            </MediaControlBar>
          </MediaController>
        ) : (
          <div className={styles.controller} aria-hidden />
        )}
      </div>
    </div>
  );
}
