"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Play, Volume2, VolumeX, Star, X, Bookmark } from "lucide-react";
import { useWatchlist } from "../lib/watchlist";
import styles from "./HoverPreview.module.css";

const HoverPreviewContext = createContext({
  onCardPointerEnter: () => {},
  onCardPointerLeave: () => {},
  activeSlug: null,
});

export function useHoverPreview() {
  return useContext(HoverPreviewContext);
}

// In-memory LRU-like cache for stream sources and metadata to guarantee 0 redundant network load
const previewCache = new Map();
const MAX_CACHE_ENTRIES = 80;

function setCachedPreview(slug, data) {
  if (previewCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = previewCache.keys().next().value;
    previewCache.delete(oldestKey);
  }
  previewCache.set(slug, data);
}

// Pick the best lightweight stream for preview: 360p or 480p preferred for zero delay & minimum bandwidth
function pickPreviewSource(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const preferred =
    sources.find((s) => s.height === 360) ||
    sources.find((s) => s.height === 480) ||
    sources.find((s) => s.height === 720) ||
    sources[sources.length - 1]; // lowest resolution available
  const chosen = preferred || sources[0];
  // Use url, not direct_url: the relay rejects ?ticket= (400 JSON → ERR_BLOCKED_BY_ORB)
  return chosen || null;
}

// Equal-power sinusoidal audio cross-fader (prevents abrupt voice/audio cuts between scenes)
function crossFadeAudio(fadeOutVideo, fadeInVideo, durationMs = 500, isMuted = false, rafRef) {
  if (isMuted) return;
  const start = performance.now();

  if (fadeInVideo) {
    try {
      fadeInVideo.muted = false;
      fadeInVideo.volume = 0;
      fadeInVideo.play().catch(() => {});
    } catch {}
  }

  const step = () => {
    const elapsed = performance.now() - start;
    const progress = Math.min(1, elapsed / durationMs);
    // Smooth sinusoidal cross-fade (preserves perceived acoustic power):
    const fadeOutVal = Math.cos(progress * 0.5 * Math.PI); // 1 -> 0
    const fadeInVal = Math.sin(progress * 0.5 * Math.PI);  // 0 -> 1

    if (fadeOutVideo) {
      try {
        fadeOutVideo.volume = Math.max(0, Math.min(1, fadeOutVal));
      } catch {}
    }
    if (fadeInVideo) {
      try {
        fadeInVideo.volume = Math.max(0, Math.min(1, fadeInVal));
      } catch {}
    }

    if (progress < 1) {
      if (rafRef) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        requestAnimationFrame(step);
      }
    } else {
      if (fadeOutVideo) {
        try {
          fadeOutVideo.volume = 0;
          fadeOutVideo.pause();
        } catch {}
      }
      if (fadeInVideo) {
        try {
          fadeInVideo.volume = 1;
        } catch {}
      }
    }
  };

  if (rafRef) {
    rafRef.current = requestAnimationFrame(step);
  } else {
    requestAnimationFrame(step);
  }
}

export function HoverPreviewProvider({ children }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const {
    inWatchlist,
    isSaving: watchlistSaving,
    toggle: toggleWatchlistState,
  } = useWatchlist(activeItem?.id || activeItem?.slug);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 340 });
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoSrcA, setVideoSrcA] = useState("");
  const [videoSrcB, setVideoSrcB] = useState("");
  const rawSourceUrlRef = useRef("");
  const [videoActive, setVideoActive] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [extraMeta, setExtraMeta] = useState(null);

  const [activePlayer, setActivePlayer] = useState("A");
  const cardRefMap = useRef(null);
  const dwellTimerRef = useRef(null);
  const prefetchTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const closingTimerRef = useRef(null);
  const seekTimerRef = useRef(null);
  const loopTimerRef = useRef(null);
  const preloadTimerRef = useRef(null);
  const audioFadeTimerRef = useRef(null);
  const fadeRafRef = useRef(null);
  const transitionFadeTimerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const videoRefA = useRef(null);
  const videoRefB = useRef(null);
  const videoRef = videoRefA;
  const activeSlugRef = useRef(null);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Compute position relative to viewport and clamp within visible bounds
  const updatePosition = useCallback((targetEl) => {
    if (!targetEl || typeof window === "undefined") return;
    const rect = targetEl.getBoundingClientRect();
    const margin = 12;
    const previewWidth = Math.min(340, window.innerWidth - margin * 2);
    const previewHeight = 315;

    // Center horizontally over original card
    let left = rect.left + rect.width / 2 - previewWidth / 2;
    if (left < margin) {
      left = margin;
    } else if (left + previewWidth > window.innerWidth - margin) {
      left = window.innerWidth - margin - previewWidth;
    }

    // Align slightly above top of card to look like smooth expansion
    let top = rect.top - 18;
    if (top < margin) {
      top = margin;
    } else if (top + previewHeight > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - margin - previewHeight);
    }

    setPos({
      top: Math.round(top),
      left: Math.round(left),
      width: Math.round(previewWidth),
    });
  }, []);

  const closePreview = useCallback(() => {
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
    if (seekTimerRef.current) {
      clearTimeout(seekTimerRef.current);
      seekTimerRef.current = null;
    }
    if (audioFadeTimerRef.current) {
      clearTimeout(audioFadeTimerRef.current);
      audioFadeTimerRef.current = null;
    }
    if (fadeRafRef.current) {
      cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = null;
    }
    if (preloadTimerRef.current) {
      clearTimeout(preloadTimerRef.current);
      preloadTimerRef.current = null;
    }
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (transitionFadeTimerRef.current) {
      clearTimeout(transitionFadeTimerRef.current);
      transitionFadeTimerRef.current = null;
    }
    if (closingTimerRef.current) {
      clearTimeout(closingTimerRef.current);
      closingTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (videoRefA.current) {
      try {
        videoRefA.current.pause();
        videoRefA.current.removeAttribute("src");
        videoRefA.current.load();
      } catch {}
    }
    if (videoRefB.current) {
      try {
        videoRefB.current.pause();
        videoRefB.current.removeAttribute("src");
        videoRefB.current.load();
      } catch {}
    }

    setIsClosing(false);
    setIsOpen(false);
    setActiveItem(null);
    setVideoSrcA("");
    setVideoSrcB("");
    rawSourceUrlRef.current = "";
    setVideoActive(false);
    setIsTransitioning(false);
    setActivePlayer("A");
    setExtraMeta(null);
    activeSlugRef.current = null;
  }, []);

  // Close immediately upon user scrolling page or window
  useEffect(() => {
    const handleScroll = () => {
      if (activeSlugRef.current) {
        closePreview();
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [closePreview]);

  // Load stream for active item (cached or fetched)
  const loadStreamForPreview = useCallback(async (item) => {
    if (!item?.slug) return;
    const slug = item.slug;

    // Check memory cache first -> 0 network delay, 0 server load!
    if (previewCache.has(slug)) {
      const cached = previewCache.get(slug);
      if (activeSlugRef.current === slug) {
        setExtraMeta(cached.meta || null);
        if (cached.sourceUrl) {
          rawSourceUrlRef.current = cached.sourceUrl;
          setVideoSrcA(cached.sourceUrl);
          setVideoSrcB("");
        }
      }
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const subjectId = item.subject_id || item.id || "";
      const isTv =
        item.subject_type === 2 ||
        /tv/i.test(String(item.type || "")) ||
        item.seasons > 0;
      const se = isTv ? "1" : "0";
      const ep = isTv ? "1" : "0";
      const url = `/api/stream/resolve?detailPath=${encodeURIComponent(
        slug
      )}&subjectId=${encodeURIComponent(subjectId)}&se=${se}&ep=${ep}`;

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return;

      const data = await res.json();
      if (!data.ok || !Array.isArray(data.sources)) return;

      const chosenSource = pickPreviewSource(data.sources);
      const sourceUrl = chosenSource?.url || "";
      const meta = data.meta || null;

      setCachedPreview(slug, { sourceUrl, meta });

      if (activeSlugRef.current === slug) {
        setExtraMeta(meta);
        if (sourceUrl) {
          rawSourceUrlRef.current = sourceUrl;
          setVideoSrcA(sourceUrl);
          setVideoSrcB("");
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        // Silent catch for preview errors - image fallback continues to show
      }
    }
  }, []);

  // Smooth exit transition when cursor leaves preview card/box
  const startClosing = useCallback(() => {
    if (!isOpen) return;
    setIsClosing(true);
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    closingTimerRef.current = setTimeout(() => {
      closePreview();
    }, 1000);
  }, [closePreview, isOpen]);

  // Handle pointer enter on a TitleCard
  const onCardPointerEnter = useCallback(
    (e, item, cardElement) => {
      // Ignore on touch devices without hover capability
      if (typeof window === "undefined" || !window.matchMedia("(hover: hover)").matches) {
        return;
      }
      if (!item?.slug) return;
      const slug = item.slug;

      // Cancel any pending close or closing animation
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (closingTimerRef.current) {
        clearTimeout(closingTimerRef.current);
        closingTimerRef.current = null;
      }

      // If re-entering the SAME card that is currently open or closing:
      if (activeSlugRef.current === slug && (isOpen || isClosing)) {
        setIsClosing(false);
        return;
      }

      // If moving to a DIFFERENT card, immediately tear down the old card so it doesn't conflict!
      if (activeSlugRef.current && activeSlugRef.current !== slug) {
        closePreview();
      }

      activeSlugRef.current = slug;
      setIsClosing(false);

      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }

      // Instant background stream pre-fetch at 40ms of hover
      prefetchTimerRef.current = setTimeout(() => {
        if (activeSlugRef.current === slug) {
          loadStreamForPreview(item);
        }
      }, 40);

      // 1.0s dwell delay: box only appears after 1.0s of stationary hover
      dwellTimerRef.current = setTimeout(() => {
        if (activeSlugRef.current !== slug) return;
        cardRefMap.current = cardElement;
        setActiveItem(item);
        updatePosition(cardElement);
        setIsOpen(true);
        loadStreamForPreview(item);
      }, 1000);
    },
    [closePreview, isClosing, isOpen, loadStreamForPreview, updatePosition]
  );

  // Handle pointer leave on a TitleCard
  const onCardPointerLeave = useCallback(
    (leavingItem) => {
      const leavingSlug = leavingItem?.slug;

      // Critical fix: If cursor left an old card, but activeSlug is already a different card,
      // ignore this leave event completely so it doesn't kill the new card!
      if (leavingSlug && activeSlugRef.current && activeSlugRef.current !== leavingSlug) {
        return;
      }

      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }

      // If modal was NOT open yet, immediately abort in-flight fetch and reset
      if (!isOpen) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        activeSlugRef.current = null;
        return;
      }

      // Grace period (120ms) allows cursor to smoothly transition into the expanded preview card
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = setTimeout(() => {
        if (leavingSlug && activeSlugRef.current && activeSlugRef.current !== leavingSlug) {
          return;
        }
        startClosing();
      }, 120);
    },
    [isOpen, startClosing]
  );

  // Pointer enters the preview modal itself
  const onPreviewMouseEnter = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (closingTimerRef.current) {
      clearTimeout(closingTimerRef.current);
      closingTimerRef.current = null;
    }
    setIsClosing(false);
  }, []);

  // Pointer leaves the preview modal - triggers 1s exit transition
  const onPreviewMouseLeave = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      startClosing();
    }, 120);
  }, [startClosing]);

  // Video playback sequence logic:
  // Starts from 0s, plays 5s, then jumps to a random spot for 6s, and loops jumps!
  // Seamless dual-player preloaded sequence with audio cross-fading:
  // Chunk 1 plays on Video A (starting at ~75s to skip intro).
  // While Chunk 1 is playing, Chunk 2 is ALREADY preloaded on Video B in the background!
  // 500ms before each switch, audio cross-fades smoothly so voices transition seamlessly.
  // At 5s, Video B plays INSTANTLY with 0 buffering delay or freeze!
  // Ping-pongs smoothly between player A and B.
  const startPreviewSequence = useCallback(() => {
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    if (transitionFadeTimerRef.current) clearTimeout(transitionFadeTimerRef.current);
    if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current);
    if (audioFadeTimerRef.current) clearTimeout(audioFadeTimerRef.current);
    if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current);
    setIsTransitioning(false);

    const vA = videoRefA.current;
    const vB = videoRefB.current;
    if (!vA || !vB) return;

    const dur = vA.duration || 300;
    const minTime = Math.max(75, dur * 0.15); // past 1-min intro
    const maxTime = Math.max(minTime + 30, dur * 0.85);
    const randomSpot = Math.floor(minTime + Math.random() * (maxTime - minTime));

    // PRELOAD CHUNK 2 ON VIDEO B IN THE BACKGROUND WHILE CHUNK 1 IS PLAYING ON VIDEO A
    // Starts 1.2s into Chunk 1 so Chunk 1 has 100% bandwidth to get rolling first
    preloadTimerRef.current = setTimeout(() => {
      if (!rawSourceUrlRef.current) return;
      setVideoSrcB(`${rawSourceUrlRef.current}#t=${randomSpot}`);
      if (videoRefB.current) {
        videoRefB.current.muted = true;
        videoRefB.current.volume = 0;
      }
    }, 1200);

    // 500ms before switch (at 4500ms), start smooth audio cross-fade!
    audioFadeTimerRef.current = setTimeout(() => {
      crossFadeAudio(videoRefA.current, videoRefB.current, 500, isMutedRef.current, fadeRafRef);
    }, 4500);

    // Initiate visual dissolve 250ms before chunk switch
    transitionFadeTimerRef.current = setTimeout(() => {
      setIsTransitioning(true);
    }, 4750);

    // After 5s from the start, switch to preloaded Chunk 2 on Video B
    seekTimerRef.current = setTimeout(() => {
      const currentB = videoRefB.current;
      const currentA = videoRefA.current;
      if (!currentB || !currentA) return;

      currentB.muted = isMutedRef.current;
      currentB.play().catch(() => {});
      setActivePlayer("B");

      setTimeout(() => {
        setIsTransitioning(false);
      }, 400);

      // Now Chunk 2 is playing on Video B!
      // Schedule preloading Chunk 3 on Video A while Chunk 2 plays:
      const scheduleNextLoop = () => {
        preloadTimerRef.current = setTimeout(() => {
          if (!videoRefA.current || !rawSourceUrlRef.current) return;
          const currentDur = videoRefB.current?.duration || dur;
          const minT = Math.max(75, currentDur * 0.15);
          const maxT = Math.max(minT + 30, currentDur * 0.85);
          const nextSpot = Math.floor(minT + Math.random() * (maxT - minT));
          setVideoSrcA(`${rawSourceUrlRef.current}#t=${nextSpot}`);
        }, 1500);

        // 500ms before switch (at 5500ms), start smooth audio cross-fade from B to A!
        audioFadeTimerRef.current = setTimeout(() => {
          crossFadeAudio(videoRefB.current, videoRefA.current, 500, isMutedRef.current, fadeRafRef);
        }, 5500);

        transitionFadeTimerRef.current = setTimeout(() => {
          setIsTransitioning(true);
        }, 5750);

        loopTimerRef.current = setTimeout(() => {
          if (!videoRefA.current || !videoRefB.current) return;
          videoRefA.current.muted = isMutedRef.current;
          videoRefA.current.play().catch(() => {});
          setActivePlayer("A");

          setTimeout(() => {
            setIsTransitioning(false);
          }, 400);

          // Now Chunk 3 is playing on Video A!
          // Preload Chunk 4 on Video B:
          preloadTimerRef.current = setTimeout(() => {
            if (!videoRefB.current || !rawSourceUrlRef.current) return;
            const currentDur = videoRefA.current?.duration || dur;
            const minT = Math.max(75, currentDur * 0.15);
            const maxT = Math.max(minT + 30, currentDur * 0.85);
            const nextSpot = Math.floor(minT + Math.random() * (maxT - minT));
            setVideoSrcB(`${rawSourceUrlRef.current}#t=${nextSpot}`);
          }, 1500);

          // 500ms before switch, cross-fade audio from A to B:
          audioFadeTimerRef.current = setTimeout(() => {
            crossFadeAudio(videoRefA.current, videoRefB.current, 500, isMutedRef.current, fadeRafRef);
          }, 5500);

          transitionFadeTimerRef.current = setTimeout(() => {
            setIsTransitioning(true);
          }, 5750);

          loopTimerRef.current = setTimeout(() => {
            if (!videoRefA.current || !videoRefB.current) return;
            videoRefB.current.muted = isMutedRef.current;
            videoRefB.current.play().catch(() => {});
            setActivePlayer("B");

            setTimeout(() => {
              setIsTransitioning(false);
            }, 400);

            scheduleNextLoop();
          }, 6000);
        }, 6000);
      };

      scheduleNextLoop();
    }, 5000);
  }, []);

  // When videoSrcA updates, Player A begins buffering directly at #t=65 with 0 duplicate requests
  useEffect(() => {
    const videoA = videoRefA.current;
    if (!videoA || !videoSrcA) return;

    let isMounted = true;
    setActivePlayer("A");
    videoA.muted = isMuted;
    videoA.defaultMuted = true;

    const playVideo = () => {
      if (!isMounted || !videoRefA.current) return;
      videoRefA.current.muted = isMuted;
      videoRefA.current.defaultMuted = true;

      const promise = videoRefA.current.play();
      if (promise !== undefined) {
        promise
          .then(() => {
            if (isMounted) {
              setVideoActive(true);
              startPreviewSequence();
            }
          })
          .catch(() => {
            // Autoplay policy fallback: enforce mute and retry immediately
            if (videoRefA.current) {
              videoRefA.current.muted = true;
              videoRefA.current
                .play()
                .then(() => {
                  if (isMounted) {
                    setVideoActive(true);
                    startPreviewSequence();
                  }
                })
                .catch(() => {});
            }
          });
      }
    };

    videoA.addEventListener("loadedmetadata", playVideo, { once: true });
    videoA.addEventListener("canplay", playVideo, { once: true });

    playVideo();

    return () => {
      isMounted = false;
      videoA.removeEventListener("loadedmetadata", playVideo);
      videoA.removeEventListener("canplay", playVideo);
    };
  }, [videoSrcA, isMuted, startPreviewSequence]);

  useEffect(() => {
    const videoB = videoRefB.current;
    if (!videoB || !videoSrcB) return;
    videoB.muted = true;
    videoB.defaultMuted = true;
    videoB.volume = 0;
  }, [videoSrcB]);

  // Sound toggle
  const toggleMute = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      if (videoRefA.current) {
        videoRefA.current.muted = next;
        if (!next) videoRefA.current.volume = activePlayer === "A" ? 1 : 0;
      }
      if (videoRefB.current) {
        videoRefB.current.muted = next;
        if (!next) videoRefB.current.volume = activePlayer === "B" ? 1 : 0;
      }
      return next;
    });
  }, [activePlayer]);

  // Navigate to full Play page directly
  const handlePlayClick = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!activeItem) return;
      const slug = activeItem.slug;
      const subjectId = activeItem.subject_id || slug;
      const title = activeItem.name || "";
      const poster = activeItem.poster_url || "";

      closePreview();

      const params = new URLSearchParams({
        subjectId,
        detail_path: slug,
        title,
        poster,
      });
      router.push(`/play?${params.toString()}`);
    },
    [activeItem, closePreview, router]
  );

  // Navigate to Title detail page
  const handleCardClick = useCallback(
    (e) => {
      e.preventDefault();
      if (!activeItem?.slug) return;
      const slug = activeItem.slug;
      closePreview();
      router.push(`/title/${encodeURIComponent(slug)}`);
    },
    [activeItem, closePreview, router]
  );

  // Format meta attributes (Rating, Year, Country, Genres)
  const ratingVal = activeItem?.rating || extraMeta?.rating;
  const yearVal = activeItem?.year || extraMeta?.year;
  const countryVal = extraMeta?.country || activeItem?.country;
  const rawGenre = extraMeta?.genre || activeItem?.genre;
  const genreVal = Array.isArray(rawGenre)
    ? rawGenre.slice(0, 3).join(", ")
    : typeof rawGenre === "string"
    ? rawGenre
        .split(/[,/|]/)
        .slice(0, 3)
        .map((s) => s.trim())
        .filter(Boolean)
        .join(",")
    : "";

  return (
    <HoverPreviewContext.Provider
      value={{
        onCardPointerEnter,
        onCardPointerLeave,
        activeSlug: activeSlugRef.current,
      }}
    >
      {children}

      {mounted &&
        isOpen &&
        activeItem &&
        createPortal(
          <>
            <div
              className={`${styles.backdrop} ${
                isClosing ? styles.backdropClosing : ""
              }`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closePreview();
              }}
              aria-hidden="true"
            />
            <div
              className={`${styles.previewContainer} ${
                isClosing ? styles.previewClosing : ""
              }`}
              style={{
                top: `${pos.top}px`,
                left: `${pos.left}px`,
                width: `${pos.width}px`,
              }}
              onMouseEnter={onPreviewMouseEnter}
              onMouseLeave={onPreviewMouseLeave}
              onClick={handleCardClick}
              role="dialog"
              aria-label={activeItem.name || "Preview"}
            >
            {/* Top Video / Poster Player */}
            <div className={styles.mediaWrap}>
              {activeItem.poster_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeItem.poster_url}
                  alt={activeItem.name || ""}
                  className={`${styles.posterBackdrop} ${
                    videoActive ? styles.posterHidden : ""
                  }`}
                  loading="eager"
                />
              ) : (
                <div className={styles.posterFallback}>
                  {activeItem.name || "Preview"}
                </div>
              )}

              {videoSrcA ? (
                <>
                  <video
                    ref={videoRefA}
                    src={videoSrcA}
                    autoPlay
                    muted={isMuted}
                    playsInline
                    preload="auto"
                    className={`${styles.videoPlayer} ${
                      videoActive ? styles.videoActive : ""
                    } ${activePlayer === "A" ? styles.videoPlayerVisible : ""} ${
                      isTransitioning ? styles.videoTransitioning : ""
                    }`}
                    onPlaying={() => {
                      setVideoActive(true);
                    }}
                    onSeeked={() => {
                      setTimeout(() => {
                        setIsTransitioning(false);
                      }, 40);
                    }}
                    onTimeUpdate={() => {
                      if (!videoActive && videoRefA.current && videoRefA.current.currentTime > 0) {
                        setVideoActive(true);
                      }
                    }}
                    onEnded={() => {
                      if (videoRefA.current) {
                        videoRefA.current.currentTime = 65;
                        videoRefA.current.play().catch(() => {});
                      }
                    }}
                  />
                  <video
                    ref={videoRefB}
                    src={videoSrcB || undefined}
                    muted={isMuted}
                    playsInline
                    preload={videoSrcB ? "auto" : "none"}
                    className={`${styles.videoPlayer} ${
                      videoActive ? styles.videoActive : ""
                    } ${activePlayer === "B" ? styles.videoPlayerVisible : ""} ${
                      isTransitioning ? styles.videoTransitioning : ""
                    }`}
                    onPlaying={() => {
                      setVideoActive(true);
                    }}
                    onSeeked={() => {
                      setTimeout(() => {
                        setIsTransitioning(false);
                      }, 40);
                    }}
                    onEnded={() => {
                      if (videoRefB.current) {
                        videoRefB.current.currentTime = 65;
                        videoRefB.current.play().catch(() => {});
                      }
                    }}
                  />
                </>
              ) : null}

              {/* Ambient warmup line while initial chunk is connecting */}
              {!videoActive && isOpen ? (
                <div className={styles.loadingBar} />
              ) : null}

              {/* Seamless cinematic scene dissolve overlay */}
              <div
                className={`${styles.transitionFlash} ${
                  isTransitioning ? styles.transitionFlashActive : ""
                }`}
              />

              {/* Close Button on Mobile / Top Left */}
              <button
                type="button"
                className={styles.closeBtn}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  closePreview();
                }}
                title="Close preview"
                aria-label="Close preview"
              >
                <X size={15} strokeWidth={2.4} />
              </button>

              {/* Top Mute / Sound Toggle Button */}
              <button
                type="button"
                className={styles.muteBtn}
                onClick={toggleMute}
                title={isMuted ? "Unmute sound" : "Mute sound"}
                aria-label={isMuted ? "Unmute sound" : "Mute sound"}
              >
                {isMuted ? (
                  <VolumeX size={15} strokeWidth={2.2} />
                ) : (
                  <Volume2 size={15} strokeWidth={2.2} />
                )}
              </button>

              <div className={styles.mediaOverlay} />
            </div>

            {/* Bottom Details Section */}
            <div className={styles.infoWrap}>
              <h4 className={styles.title}>{activeItem.name || "Untitled"}</h4>

              {/* Meta Row: Star rating · Year · Country · Genres */}
              <div className={styles.metaRow}>
                {ratingVal ? (
                  <span className={styles.rating}>
                    <Star
                      size={12}
                      className={styles.starIcon}
                      fill="#eab308"
                    />
                    <span>{Number(ratingVal).toFixed(1)}</span>
                  </span>
                ) : null}

                {ratingVal && (yearVal || countryVal || genreVal) ? (
                  <span className={styles.dot}>·</span>
                ) : null}

                {yearVal ? (
                  <span className={styles.year}>
                    {String(yearVal).slice(0, 4)}
                  </span>
                ) : null}

                {yearVal && (countryVal || genreVal) ? (
                  <span className={styles.dot}>·</span>
                ) : null}

                {countryVal ? (
                  <span className={styles.country}>{countryVal}</span>
                ) : null}

                {countryVal && genreVal ? (
                  <span className={styles.dot}>·</span>
                ) : null}

                {genreVal ? (
                  <span className={styles.genre}>{genreVal}</span>
                ) : null}
              </div>

              {/* Action Buttons */}
              <div className={styles.actionsRow}>
                <button
                  type="button"
                  className={styles.playBtn}
                  onClick={handlePlayClick}
                >
                  <Play size={15} fill="#000" color="#000" />
                  <span>Play</span>
                </button>

                <button
                  type="button"
                  className={`${styles.watchlistActionBtn} ${
                    inWatchlist ? styles.watchlistActionBtnSaved : ""
                  } ${watchlistSaving ? styles.watchlistActionBtnSaving : ""}`}
                  disabled={watchlistSaving}
                  aria-pressed={inWatchlist}
                  aria-busy={watchlistSaving || undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleWatchlistState(activeItem);
                  }}
                  title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
                  aria-label={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
                >
                  <Bookmark
                    size={14}
                    fill={inWatchlist ? "currentColor" : "none"}
                    strokeWidth={inWatchlist ? 0 : 2}
                  />
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </HoverPreviewContext.Provider>
  );
}
