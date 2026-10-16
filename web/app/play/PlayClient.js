"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  Smartphone,
  User,
  ChevronDown,
  ChevronLeft,
  Flag,
  Check,
  X,
  AlertCircle,
  Loader2,
  Bookmark,
  Star,
  Clock,
  Film,
  LayoutGrid,
  List,
} from "lucide-react";
import StreamPlayer from "../../components/StreamPlayer";
import { getDetail, getEpisodes, getRecommendations, searchTitles } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { addHistoryItem } from "../../lib/guestHistory";
import { getActiveProfile } from "../../lib/profiles";
import { formatBytes } from "../../lib/stream";
import { useWatchlist } from "../../lib/watchlist";
import styles from "./play.module.css";

function formatDuration(val) {
  if (!val) return null;
  if (typeof val === "number" || /^\d+$/.test(String(val).trim())) {
    const totalMin = Math.round(Number(val) / 60);
    if (totalMin <= 0) return null;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }
  return String(val);
}

function normalizeSeasons(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s, idx) => {
      const seasonNum = s.season ?? s.se ?? s.season_number ?? idx + 1;
      const count = Number(s.episode_count ?? s.maxEp ?? (s.episodes || []).length ?? 0);
      let epList = s.episodes || [];
      if (!epList.length && count > 0) {
        epList = Array.from({ length: count }, (_, i) => ({
          ep: i + 1,
          se: seasonNum,
        }));
      }
      return {
        season: seasonNum,
        se: String(seasonNum),
        episode_count: count || epList.length,
        episodes: epList.map((e, i) => ({
          se: String(e.se ?? seasonNum),
          ep: String(e.ep ?? i + 1),
        })),
      };
    })
    .filter((s) => s.episodes.length > 0 || s.episode_count > 0);
}

function flattenEpisodes(seasons = []) {
  const flat = [];
  for (const s of seasons) {
    for (const e of s.episodes || []) {
      flat.push({
        se: String(e.se),
        ep: String(e.ep),
      });
    }
  }
  return flat;
}

function playQuery({ subjectId, detailPath, se, ep, title, poster }) {
  const q = {
    subjectId,
    detail_path: detailPath,
    se: String(se),
    ep: String(ep),
    title: title || "",
  };
  if (poster) q.poster = poster;
  return new URLSearchParams(q).toString();
}

function getRootTitle(titleText, detailPathText) {
  let s = String(titleText || "");
  if (!s || /^\d+$/.test(s.trim())) {
    s = String(detailPathText || "")
      .replace(/^.*\/detail\//, "")
      .replace(/^\/+/, "")
      .replace(/-[A-Za-z0-9]{8,16}$/, "")
      .replace(/-/g, " ");
  }
  return s
    .replace(/\[\s*[^\]]*\]|\(\s*[^)]*\)/g, " ")
    .replace(/\bhindi\b|\bdubbed\b|\bdub\b/gi, " ")
    .replace(/\bs\d+(?:-s\d+)?\b/gi, " ")
    .replace(/\bseason\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLanguageTag(titleText, slugText, badgeText) {
  const combined = `${titleText || ""} ${slugText || ""} ${badgeText || ""}`;
  const m =
    combined.match(
      /\[\s*(Hindi|English|Telugu|Tamil|Japanese|Spanish|Korean|Chinese|Urdu|Punjabi|French|German|Russian|Arabic|Multi[- ]?Audio)\s*(?:Dub)?\s*\]/i
    ) ||
    combined.match(
      /\(\s*(Hindi|English|Telugu|Tamil|Japanese|Spanish|Korean|Chinese|Urdu|Punjabi|French|German|Russian|Arabic|Multi[- ]?Audio)\s*(?:Dub)?\s*\)/i
    ) ||
    combined.match(
      /\b(Hindi|Telugu|Tamil|Japanese|Spanish|Korean|Urdu)\s+(?:Dub|Dubbed)\b/i
    ) ||
    combined.match(
      /\b(Hindi|English|Telugu|Tamil|Japanese|Spanish|Korean|Urdu)\b/i
    );
  if (m) {
    const raw = m[1].toLowerCase().replace(/[- ]/g, " ");
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return null;
}

export default function PlayClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, isSignedIn } = useAuth();
  const [activeProfile, setActiveProfile] = useState(() => getActiveProfile(user));
  useEffect(() => {
    setActiveProfile(getActiveProfile(user));
  }, [user]);

  useEffect(() => {
    const onProfileChange = (e) => setActiveProfile(e.detail || getActiveProfile(user));
    window.addEventListener("mh:profile:change", onProfileChange);
    return () => window.removeEventListener("mh:profile:change", onProfileChange);
  }, [user]);


  let subjectId = params.get("subjectId") || params.get("id") || "";
  let detailPath = params.get("detail_path") || "";
  const se = params.get("se") || "0";
  const ep = params.get("ep") || "0";
  let title = params.get("title") || "";
  let poster = params.get("poster") || "";
  const initialTime = Number(params.get("t") || params.get("start") || params.get("position") || 0);
  const requestedLang = params.get("lang") || "";
  const s1HasNativeHindi = /\[\s*hindi\s*\]|\(\s*hindi\s*\)|-hindi-|\bhindi\b/i.test(`${title} ${detailPath}`);
  const initialServer =
    params.get("server") ||
    (requestedLang.toLowerCase().includes("hindi") && !s1HasNativeHindi ? "2" : "1");

  // Restore cached metadata before defaulting detailPath to subjectId
  if (subjectId && typeof window !== "undefined") {
    try {
      const meta = JSON.parse(localStorage.getItem(`history_meta_${subjectId}`) || "{}");
      if ((!detailPath || detailPath === subjectId || /^\d+$/.test(detailPath)) && meta.detailPath) {
        detailPath = meta.detailPath;
      }
      if ((!title || /^\d+$/.test(String(title).trim())) && meta.title && !/^\d+$/.test(String(meta.title).trim())) {
        title = meta.title;
      }
      if (!poster && meta.poster) poster = meta.poster;
    } catch { }
  }

  if (!subjectId && detailPath) subjectId = detailPath;
  if (!detailPath && subjectId) detailPath = subjectId;

  // Derive human-readable title from detailPath slug if numeric or empty
  if ((!title || /^\d+$/.test(String(title).trim())) && detailPath) {
    let slug = String(detailPath).replace(/^.*\/detail\//, "").replace(/^\/+/, "");
    slug = slug.replace(/-[A-Za-z0-9]{8,16}$/, "");
    if (slug && !/^\d+$/.test(slug)) {
      title = slug
        .split("-")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }

  // Persist resolved title and poster
  if (subjectId && typeof window !== "undefined" && (title || poster)) {
    try {
      const meta = JSON.parse(localStorage.getItem(`history_meta_${subjectId}`) || "{}");
      if (title && !/^\d+$/.test(String(title).trim())) meta.title = title;
      if (poster) meta.poster = poster;
      if (detailPath) meta.detailPath = detailPath;
      meta.lastSe = String(se);
      meta.lastEp = String(ep);
      localStorage.setItem(`history_meta_${subjectId}`, JSON.stringify(meta));
      if (String(se) !== "0" || String(ep) !== "0") {
        localStorage.setItem(`history_last_${subjectId}`, JSON.stringify({ se: String(se), ep: String(ep) }));
      }
    } catch { }
  }

  useEffect(() => {
    if (isSignedIn === false && subjectId) {
      addHistoryItem(subjectId, { detailPath, title, poster, se, ep });
    }
  }, [isSignedIn, subjectId, detailPath, title, poster, se, ep]);

  const [seasons, setSeasons] = useState([]);
  const [episodesLoading, setEpisodesLoading] = useState(
    Number(se) > 0 || Number(ep) > 0 || String(detailPath || "").includes("episode") || String(detailPath || "").includes("-season-")
  );
  const isSeries = Number(se) > 0 || Number(ep) > 0 || seasons.length > 0 || episodesLoading;
  const [activeSeason, setActiveSeason] = useState(String(Number(se) > 0 ? se : "1"));
  const [videoDetail, setVideoDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [mobileTab, setMobileTab] = useState("overview"); // overview, episodes, quality, recommended
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const initialLang = useMemo(() => {
    return requestedLang || extractLanguageTag(title, detailPath) || "Original";
  }, [requestedLang, title, detailPath]);

  const [selectedAudioLang, setSelectedAudioLang] = useState(initialLang);
  const [availableDubs, setAvailableDubs] = useState([]);
  const [formatMode, setFormatMode] = useState("dash"); // "dash" | "mp4"
  const [streamMeta, setStreamMeta] = useState(null);
  const [selectedQuality, setSelectedQuality] = useState(0);
  const [activeServer, setActiveServer] = useState(initialServer);
  const [availableAudioLanguages, setAvailableAudioLanguages] = useState([]);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("buffering");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const {
    inWatchlist,
    isSaving: watchlistSaving,
    toggle: toggleWatchlistState,
  } = useWatchlist(subjectId || detailPath);
  const [recViewMode, setRecViewMode] = useState("grid");
  const [isSwitching, setIsSwitching] = useState(false);
  const switchingTimerRef = useRef(null);

  const startSwitching = useCallback(() => {
    setIsSwitching(true);
    if (switchingTimerRef.current) clearTimeout(switchingTimerRef.current);
    switchingTimerRef.current = setTimeout(() => {
      setIsSwitching(false);
    }, 3500);
  }, []);

  const stopSwitching = useCallback(() => {
    if (switchingTimerRef.current) clearTimeout(switchingTimerRef.current);
    setIsSwitching(false);
  }, []);

  useEffect(() => {
    return () => {
      if (switchingTimerRef.current) clearTimeout(switchingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (Number(se) > 0) {
      setActiveSeason(String(se));
    }
  }, [se]);

  useEffect(() => {
    let slugToFetch = String(detailPath || "")
      .replace(/^\/?detail\//, "")
      .replace(/^\/+/, "")
      .trim();

    if (!slugToFetch && !subjectId && !title) {
      setSeasons([]);
      setEpisodesLoading(false);
      setDetailLoading(false);
      setRecsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadData() {
      setEpisodesLoading(true);
      setDetailLoading(true);
      setRecsLoading(true);
      try {
        let detailData = null;
        let epData = null;

        if (slugToFetch && !/^\d+$/.test(slugToFetch)) {
          try {
            detailData = await getDetail(slugToFetch);
          } catch {}
        }

        // Search title to find real slug and alternate CDN dubs (e.g. [Hindi], [English])
        const queryTerm = getRootTitle(title, slugToFetch);
        if (queryTerm) {
          try {
            const searchRes = await searchTitles(queryTerm);
            const rootClean = queryTerm.toLowerCase();
            const matching = (searchRes?.movies || []).filter((m) => {
              const mRoot = getRootTitle(m.name, m.slug).toLowerCase();
              return mRoot === rootClean || mRoot.includes(rootClean) || rootClean.includes(mRoot);
            });

            if (matching.length > 0) {
              const dubs = matching.map((m) => {
                const lang = extractLanguageTag(m.name, m.slug, m.badge) || "Original";
                return {
                  label: lang,
                  title: m.name,
                  slug: String(m.slug || "").replace(/^\/?detail\//, "").replace(/^\/+/, ""),
                  subjectId: m.subject_id ? String(m.subject_id) : "",
                  poster: m.poster_url || "",
                };
              });
              const seenL = new Set();
              const uniqueDubs = dubs.filter((d) => {
                if (seenL.has(d.label)) return false;
                seenL.add(d.label);
                return true;
              });
              if (!cancelled) setAvailableDubs(uniqueDubs);
            }

            if (!detailData?.metadata && (!epData?.seasons || epData.seasons.length === 0)) {
              const found =
                matching.find(
                  (m) =>
                    (subjectId && String(m.subject_id) === String(subjectId)) ||
                    (m.name && m.name.toLowerCase() === title.toLowerCase()) ||
                    (m.slug && m.slug.toLowerCase().includes(rootClean.replace(/\s+/g, "-")))
                ) || searchRes?.movies?.[0];
              if (found?.slug) {
                const resSlug = String(found.slug).replace(/^\/?detail\//, "").replace(/^\/+/, "");
                slugToFetch = resSlug;
                try {
                  detailData = await getDetail(resSlug);
                } catch {
                  epData = await getEpisodes(resSlug).catch(() => null);
                }
              }
            }
          } catch {}
        }

        if (cancelled) return;

        const meta = detailData?.metadata || null;
        if (meta) {
          setVideoDetail(meta);
        }

        const rawSeasons = meta?.seasons || epData?.seasons || [];
        const normalized = normalizeSeasons(rawSeasons);
        setSeasons(normalized);
        if (normalized.length > 0 && Number(se) <= 0) {
          setActiveSeason(String(normalized[0].season));
        }

        // Determine content type for recommended items
        const genreStr = String(meta?.genre || "").toLowerCase();
        let derivedType = "movie";
        if (genreStr.includes("anime") || genreStr.includes("animation")) {
          derivedType = "anime";
        } else if (
          Number(se) > 0 ||
          Number(ep) > 0 ||
          normalized.length > 0 ||
          String(detailPath || "").includes("episode") ||
          String(detailPath || "").includes("-season-")
        ) {
          derivedType = "series";
        }

        // Fetch type-aware recommendations
        try {
          const recsRes = await getRecommendations({
            type: derivedType,
            exclude: slugToFetch,
            limit: 16,
          });
          const recList = Array.isArray(recsRes)
            ? recsRes
            : (recsRes?.recommendations || recsRes?.items || []);
          if (!cancelled) {
            if (recList.length > 0) {
              setRecommendations(recList);
            } else if (meta?.related?.length) {
              setRecommendations(meta.related);
            }
          }
        } catch {
          if (!cancelled && meta?.related?.length) {
            setRecommendations(meta.related);
          }
        }
      } catch {
        if (!cancelled) setSeasons([]);
      } finally {
        if (!cancelled) {
          setEpisodesLoading(false);
          setDetailLoading(false);
          setRecsLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [detailPath, subjectId, title, se]);

  const flatEpisodeList = useMemo(() => flattenEpisodes(seasons), [seasons]);

  const { prevEpisode, nextEpisode } = useMemo(() => {
    if (!isSeries) {
      return { prevEpisode: null, nextEpisode: null };
    }
    if (flatEpisodeList?.length) {
      const idx = flatEpisodeList.findIndex(
        (item) => String(item.se) === String(se) && String(item.ep) === String(ep)
      );
      if (idx >= 0) {
        return {
          prevEpisode: idx > 0 ? flatEpisodeList[idx - 1] : null,
          nextEpisode: idx < flatEpisodeList.length - 1 ? flatEpisodeList[idx + 1] : null,
        };
      }
    }
    const curEp = Number(ep) || 1;
    const curSe = Number(se) || 1;
    return {
      prevEpisode: curEp > 1 ? { se: String(curSe), ep: String(curEp - 1) } : null,
      nextEpisode: { se: String(curSe), ep: String(curEp + 1) },
    };
  }, [flatEpisodeList, se, ep, isSeries]);

  const goTo = (target) => {
    if (!target) return;
    router.push(
      `/play?${playQuery({
        subjectId,
        detailPath,
        se: target.se,
        ep: target.ep,
        title,
        poster,
      })}`
    );
  };

  const cleanSlug = String(detailPath || "")
    .replace(/^\/?(?:detail|title)\//, "")
    .replace(/^\/+/, "");

  const backHref = cleanSlug
    ? `/title/${encodeURIComponent(cleanSlug)}${isSeries ? `?se=${encodeURIComponent(se)}&ep=${encodeURIComponent(ep)}` : ""}`
    : "/";

  // Build Season Range label e.g. "S1-S4"
  const seasonRangeText = useMemo(() => {
    if (!seasons.length) return "";
    if (seasons.length === 1) return `S${seasons[0].season}`;
    const minS = seasons[0].season;
    const maxS = seasons[seasons.length - 1].season;
    return `S${minS}-S${maxS}`;
  }, [seasons]);

  // Episodes for active season
  const currentSeasonEpisodes = useMemo(() => {
    const s = seasons.find((item) => String(item.season) === String(activeSeason));
    if (s?.episodes?.length) return s.episodes;
    if (seasons.length === 0 && Number(ep) > 0) {
      return [{ se: String(activeSeason || "1"), ep: String(ep) }];
    }
    return [];
  }, [seasons, activeSeason, ep]);

  const handleServerChange = (srv) => {
    if (srv === activeServer || isSwitching) return;
    startSwitching();
    setActiveServer(srv);
    setSelectedAudioLang(srv === "1" ? "Audio 1" : "Audio 2");
  };

  const combinedAudioOptions = useMemo(() => {
    const list = [
      {
        id: "audio_1",
        server: "1",
        label: "Audio 1",
      },
      {
        id: "audio_2",
        server: "2",
        label: "Audio 2",
      },
    ];

    // Any other available dubs/alternate streams from search (Audio 3, Audio 4, etc.)
    let idx = 3;
    for (const d of availableDubs) {
      list.push({
        id: `dub_${d.slug || idx}`,
        server: "1",
        label: `Audio ${idx}`,
        dub: d,
      });
      idx++;
    }

    return list;
  }, [availableDubs]);

  const activeAudioOptionId = useMemo(() => {
    if (activeServer === "2") return "audio_2";
    if (activeServer === "1") return "audio_1";
    return combinedAudioOptions[0]?.id || "audio_1";
  }, [activeServer, combinedAudioOptions]);

  const currentLanguageTag = useMemo(() => {
    return activeServer === "2" ? "Audio 2" : "Audio 1";
  }, [activeServer]);

  const handleAudioOptionChange = (optId) => {
    if (optId === activeAudioOptionId || isSwitching) return;
    const opt = combinedAudioOptions.find((o) => o.id === optId);
    if (!opt) return;

    startSwitching();
    setActiveServer(opt.server);
    setSelectedAudioLang(opt.label);

    if (opt.dub) {
      const targetSlug = opt.dub.slug;
      const targetSub = opt.dub.subjectId;
      if ((targetSlug && targetSlug !== detailPath) || (targetSub && targetSub !== subjectId)) {
        router.push(
          `/play?${playQuery({
            subjectId: targetSub || subjectId,
            detailPath: targetSlug || detailPath,
            se,
            ep,
            title: opt.dub.title || title,
            poster: opt.dub.poster || poster,
          })}`
        );
      }
    }
  };

  const handleReportSubmit = (e) => {
    e.preventDefault();
    setReportSubmitted(true);
    setTimeout(() => {
      setReportModalOpen(false);
      setReportSubmitted(false);
    }, 1600);
  };

  const renderDetailsBlock = () => {
    const dTitle = videoDetail?.title || title || "Video";
    const year = videoDetail?.release_date ? String(videoDetail.release_date).slice(0, 4) : null;
    const rating = videoDetail?.imdb_rating ? Number(videoDetail.imdb_rating).toFixed(1) : null;
    const duration = formatDuration(videoDetail?.duration);
    const badge = videoDetail?.badge || (activeServer === "2" ? "Direct CDN" : "HD");
    const country = videoDetail?.country || null;
    const genres = videoDetail?.genre
      ? videoDetail.genre.split(/[,/|]/).map((g) => g.trim()).filter(Boolean)
      : [];
    const topCast = Array.isArray(videoDetail?.top_cast) ? videoDetail.top_cast : [];
    const directors = topCast.filter((c) => c?.staffType === 2).map((c) => c?.name || c);
    const actors = topCast.filter((c) => c?.staffType !== 2).map((c) => c?.name || c);
    const rawDesc = videoDetail?.description || "";
    const isLongDesc = rawDesc.length > 200;
    const displayDesc = !synopsisExpanded && isLongDesc ? `${rawDesc.slice(0, 200)}...` : rawDesc;

    return (
      <div className={styles.detailsBlock}>
        <div className={styles.detailsHeader}>
          <div className={styles.detailsTitleRow}>
            <h2 className={styles.detailsTitle}>{dTitle}</h2>
          </div>

          <div className={styles.detailsPillsRow}>
            {rating && (
              <span className={`${styles.pillItem} ${styles.ratingPill}`}>
                <Star size={13} fill="currentColor" />
                <span>{rating}</span>
              </span>
            )}
            {year && <span className={styles.pillItem}>{year}</span>}
            {duration && (
              <span className={styles.pillItem}>
                <Clock size={12} />
                <span>{duration}</span>
              </span>
            )}
            {badge && <span className={`${styles.pillItem} ${styles.badgePill}`}>{badge}</span>}
            {country && <span className={styles.pillItem}>{country}</span>}
          </div>

          {genres.length > 0 && (
            <div className={styles.genreTagsRow}>
              {genres.map((g, i) => (
                <span key={`genre-${i}`} className={styles.genreTag}>
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>

        {rawDesc && (
          <p className={styles.detailsSynopsis}>
            {displayDesc}
            {isLongDesc && (
              <button
                type="button"
                className={styles.synopsisToggle}
                onClick={() => setSynopsisExpanded((prev) => !prev)}
              >
                {synopsisExpanded ? "Show less" : "Show more"}
              </button>
            )}
          </p>
        )}

        {(directors.length > 0 || actors.length > 0) && (
          <div className={styles.creditsList}>
            {directors.length > 0 && (
              <div className={styles.creditRow}>
                <span className={styles.creditLabel}>Director</span>
                <span className={styles.creditValue}>{directors.join(", ")}</span>
              </div>
            )}
            {actors.length > 0 && (
              <div className={styles.creditRow}>
                <span className={styles.creditLabel}>Cast</span>
                <span className={styles.creditValue}>
                  {actors.slice(0, 6).map((a) => (typeof a === "object" ? a?.name : a)).join(", ")}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderEpisodesPanel = () => (
    <div className={styles.panelCard}>
      <div className={styles.panelHeaderRow}>
        <div className={styles.panelTitleWithCount}>
          <span className={styles.panelTitle}>Episodes</span>
          {episodesLoading ? (
            <div className={styles.skeletonBadge} />
          ) : currentSeasonEpisodes.length > 0 ? (
            <span className={styles.countBadge}>
              {currentSeasonEpisodes.length} eps
            </span>
          ) : null}
        </div>

        {episodesLoading ? (
          <div className={styles.skeletonSeasonSelect} />
        ) : seasons.length > 0 ? (
          <div className={styles.seasonSelectWrap}>
            <select
              className={styles.seasonSelect}
              value={activeSeason}
              onChange={(e) => {
                const newSe = e.target.value;
                setActiveSeason(newSe);
                const targetSeason = seasons.find((s) => String(s.season) === String(newSe));
                if (targetSeason?.episodes?.[0]) {
                  goTo(targetSeason.episodes[0]);
                }
              }}
            >
              {seasons.map((s) => (
                <option key={s.season} value={String(s.season)}>
                  Season {String(s.season).padStart(2, "0")}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className={styles.seasonChevron} />
          </div>
        ) : null}
      </div>

      {episodesLoading ? (
        <div className={styles.episodeGrid}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={`ep-skel-${i}`} className={styles.skeletonEpisodeBtn} />
          ))}
        </div>
      ) : currentSeasonEpisodes.length > 0 ? (
        <div className={styles.episodeGrid}>
          {currentSeasonEpisodes.map((item) => {
            const isPlaying = String(item.se) === String(se) && String(item.ep) === String(ep);
            return (
              <button
                key={`${item.se}-${item.ep}`}
                type="button"
                className={`${styles.episodeBtn} ${isPlaying ? styles.episodeBtnPlaying : ""}`}
                onClick={() => goTo(item)}
                title={`Season ${item.se} Episode ${item.ep}`}
              >
                <span className={styles.episodeNum}>
                  {String(item.ep).padStart(2, "0")}
                </span>
                {isPlaying && (
                  <span className={styles.equalizerIcon} aria-hidden="true">
                    <span className={styles.eqBar1}></span>
                    <span className={styles.eqBar2}></span>
                    <span className={styles.eqBar3}></span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className={styles.singleMovieInfo}>
          <p>No episodes available</p>
        </div>
      )}
    </div>
  );

  const renderQualityPanel = () => (
    <div className={styles.panelCard}>
      <div className={styles.panelHeaderRow}>
        <span className={styles.panelTitle}>Stream Quality</span>
        <span className={styles.countBadge}>{streamMeta?.host || (activeServer === "2" ? "Server 2" : "Server 1")}</span>
      </div>

      <div className={styles.settingRow}>
        <span className={styles.settingLabel}>Server</span>
        <div className={styles.serverToggleRow}>
          <button
            type="button"
            className={`${styles.serverToggleBtn} ${activeServer === "1" ? styles.serverToggleBtnActive : ""}`}
            onClick={() => handleServerChange("1")}
            disabled={isSwitching}
          >
            {isSwitching && activeServer === "1" && <Loader2 size={12} className={styles.spinnerIcon} />}
            <span>Server 1</span>
          </button>
          <button
            type="button"
            className={`${styles.serverToggleBtn} ${activeServer === "2" ? styles.serverToggleBtnActive : ""}`}
            onClick={() => handleServerChange("2")}
            disabled={isSwitching}
          >
            {isSwitching && activeServer === "2" && <Loader2 size={12} className={styles.spinnerIcon} />}
            <span>Server 2</span>
          </button>
        </div>
      </div>

      <div className={styles.settingRow}>
        <span className={styles.settingLabel}>Quality</span>
        {streamMeta?.sources?.length > 0 ? (
          <div className={styles.streamSourcesGrid}>
            {streamMeta.sources.map((s, idx) => {
              const isSelected = selectedQuality === idx;
              const size = formatBytes(s.size_bytes);
              return (
                <button
                  key={s.id || s.url || idx}
                  type="button"
                  className={`${styles.streamSourceBtn} ${
                    isSelected ? styles.streamSourceBtnActive : ""
                  }`}
                  onClick={() => setSelectedQuality(idx)}
                  disabled={isSwitching}
                >
                  <span className={styles.sourceRes}>{s.resolution}</span>
                  {size && <span className={styles.sourceSize}>{size}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className={styles.streamSourcesGrid}>
            <div className={styles.skeletonQualityBtn} />
            <div className={styles.skeletonQualityBtn} />
            <div className={styles.skeletonQualityBtn} />
          </div>
        )}
      </div>

      <div className={styles.settingRow}>
        <div className={styles.settingLabelRow}>
          <span className={styles.settingLabel}>Audio Track</span>
          {isSwitching && (
            <span className={styles.switchingBadge}>
              <Loader2 size={11} className={styles.spinnerIcon} />
              <span>Switching...</span>
            </span>
          )}
        </div>
        {combinedAudioOptions.length > 1 ? (
          <div className={styles.selectWrapper}>
            <select
              className={`${styles.customSelect} ${isSwitching ? styles.customSelectLoading : ""}`}
              value={activeAudioOptionId}
              onChange={(e) => handleAudioOptionChange(e.target.value)}
              disabled={isSwitching}
            >
              {combinedAudioOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            {isSwitching ? (
              <span className={styles.selectSpinner}>
                <Loader2 size={14} />
              </span>
            ) : (
              <ChevronDown size={14} className={styles.selectChevron} />
            )}
          </div>
        ) : !streamMeta ? (
          <div className={styles.skeletonSelect} />
        ) : (
          <div className={styles.audioPill}>
            <span className={styles.audioPillDot}></span>
            <span>{currentLanguageTag}</span>
            {isSwitching && <Loader2 size={12} className={styles.spinnerIcon} />}
          </div>
        )}
      </div>

      <div className={styles.formatRow}>
        <div className={styles.formatInfo}>
          <span className={styles.settingLabel}>Format</span>
          <span className={styles.formatDesc}>
            {activeServer === "2"
              ? "Direct CDN Stream (MP4)"
              : streamMeta?.sources?.[0]?.format
                ? `Secure Native (${streamMeta.sources[0].format})`
                : "High Efficiency Native"}
          </span>
        </div>
      </div>
    </div>
  );

  const renderRecommendedPanel = () => (
    <div className={styles.recommendedPanel}>
      <div className={styles.panelHeaderRow}>
        <div className={styles.panelTitleWithCount}>
          <span className={styles.panelTitle}>Recommended</span>
          {recommendations.length > 0 && (
            <span className={styles.countBadge}>{recommendations.length}</span>
          )}
        </div>
        <div className={styles.viewToggleGroup}>
          <button
            type="button"
            className={`${styles.viewToggleBtn} ${recViewMode === "grid" ? styles.viewToggleBtnActive : ""}`}
            onClick={() => setRecViewMode("grid")}
            title="Grid View"
            aria-label="Grid View"
          >
            <LayoutGrid size={13} />
          </button>
          <button
            type="button"
            className={`${styles.viewToggleBtn} ${recViewMode === "list" ? styles.viewToggleBtnActive : ""}`}
            onClick={() => setRecViewMode("list")}
            title="List View"
            aria-label="List View"
          >
            <List size={13} />
          </button>
        </div>
      </div>

      {recsLoading ? (
        recViewMode === "grid" ? (
          <div className={styles.recommendedGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`rec-skel-${i}`} className={styles.skeletonGridCard} />
            ))}
          </div>
        ) : (
          <div className={styles.recommendedList}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`rec-skel-${i}`} className={styles.skeletonRecCard} />
            ))}
          </div>
        )
      ) : recommendations.length > 0 ? (
        recViewMode === "grid" ? (
          <div className={styles.recommendedGrid}>
            {recommendations.map((item, idx) => {
              const recSlug = String(item.slug || "").replace(/^\/?detail\//, "").replace(/^\/+/, "");
              const recTarget = {
                subjectId: item.subject_id ? String(item.subject_id) : recSlug,
                detailPath: recSlug,
                se: "0",
                ep: "0",
                title: item.name || "",
                poster: item.poster_url || "",
              };
              const href = `/play?${playQuery(recTarget)}`;
              const recYear = item.year ? String(item.year).slice(0, 4) : null;
              const recRating = item.rating ? Number(item.rating).toFixed(1) : null;
              const genreSnippet = item.genre ? item.genre.split(/[,/]/)[0].trim() : null;

              return (
                <Link
                  key={item.subject_id || item.slug || idx}
                  href={href}
                  className={styles.recGridCard}
                >
                  <div className={styles.recPosterWrap}>
                    {item.poster_url ? (
                      <img
                        src={item.poster_url}
                        alt={item.name}
                        className={styles.recPoster}
                        loading="lazy"
                      />
                    ) : (
                      <div className={styles.recPosterPlaceholder}>
                        <Film size={22} />
                      </div>
                    )}
                    {item.badge && <span className={styles.recPosterBadge}>{item.badge}</span>}
                    {recRating && (
                      <span className={styles.recPosterRating}>
                        <Star size={10} fill="currentColor" />
                        <span>{recRating}</span>
                      </span>
                    )}
                  </div>
                  <div className={styles.recGridInfo}>
                    <h4 className={styles.recGridTitle} title={item.name}>{item.name}</h4>
                    <div className={styles.recGridMeta}>
                      {recYear && <span>{recYear}</span>}
                      {genreSnippet && <span className={styles.recGridGenre}>{genreSnippet}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className={styles.recommendedList}>
            {recommendations.map((item, idx) => {
              const recSlug = String(item.slug || "").replace(/^\/?detail\//, "").replace(/^\/+/, "");
              const recTarget = {
                subjectId: item.subject_id ? String(item.subject_id) : recSlug,
                detailPath: recSlug,
                se: "0",
                ep: "0",
                title: item.name || "",
                poster: item.poster_url || "",
              };
              const href = `/play?${playQuery(recTarget)}`;
              const recYear = item.year ? String(item.year).slice(0, 4) : null;
              const recRating = item.rating ? Number(item.rating).toFixed(1) : null;
              const genreSnippet = item.genre ? item.genre.split(/[,/]/)[0].trim() : null;

              return (
                <Link
                  key={item.subject_id || item.slug || idx}
                  href={href}
                  className={styles.recCard}
                >
                  <div className={styles.recThumbWrap}>
                    {item.poster_url ? (
                      <img
                        src={item.poster_url}
                        alt={item.name}
                        className={styles.recThumb}
                        loading="lazy"
                      />
                    ) : (
                      <div className={styles.recThumbPlaceholder}>
                        <Film size={18} />
                      </div>
                    )}
                    {item.badge && <span className={styles.recThumbBadge}>{item.badge}</span>}
                  </div>
                  <div className={styles.recInfo}>
                    <h4 className={styles.recTitle} title={item.name}>{item.name}</h4>
                    <div className={styles.recMeta}>
                      {recRating && (
                        <span className={styles.recRating}>
                          <Star size={11} fill="currentColor" />
                          <span>{recRating}</span>
                        </span>
                      )}
                      {recYear && <span className={styles.recYear}>{recYear}</span>}
                      {genreSnippet && <span className={styles.recGenre}>{genreSnippet}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )
      ) : (
        <div className={styles.singleMovieInfo}>
          <p>No similar titles found</p>
        </div>
      )}
    </div>
  );

  return (
    <main className={styles.main}>
      <header className={styles.topHeader}>
        <div className={styles.titleArea}>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back();
              } else {
                router.push(backHref || "/");
              }
            }}
            className={styles.backBtn}
            title="Go Back"
          >
            <ChevronLeft size={16} />
            <span>Back</span>
          </button>
          <h1 className={styles.mediaTitle}>
            {title || "Watching"}
            {currentLanguageTag && currentLanguageTag !== "Original" && (
              <span className={styles.langTag}> [{currentLanguageTag}]</span>
            )}
            {isSeries && Number(se) > 0 && Number(ep) > 0 && (
              <span className={styles.seasonTag}>
                {" "}
                · S{String(se).padStart(2, "0")} E{String(ep).padStart(2, "0")}
              </span>
            )}
          </h1>
        </div>

        <div className={styles.headerActions}>
          <Link href="/download-app" className={styles.downloadBtn} title="Download Native App">
            <Smartphone size={14} />
            <span>Get App</span>
          </Link>

          <Link href="/pricing" className={styles.goPremiumBtn} title="Upgrade to VIP">
            <Sparkles size={14} />
            <span>VIP Pass</span>
          </Link>

          <button
            type="button"
            className={`${styles.watchlistHeaderBtn} ${inWatchlist ? styles.watchlistHeaderBtnActive : ""}`}
            disabled={watchlistSaving}
            onClick={() => {
              toggleWatchlistState({
                slug: detailPath
                  ? String(detailPath).replace(/^\/?detail\//, "").replace(/^\/+/, "")
                  : subjectId,
                detailPath,
                title,
                poster,
                type: isSeries ? "tv" : "movie",
              });
            }}
            title={inWatchlist ? "Remove from Watchlist" : "Save to Watchlist"}
          >
            <Bookmark
              size={14}
              fill={inWatchlist ? "currentColor" : "none"}
              strokeWidth={inWatchlist ? 0 : 2}
            />
            <span>{watchlistSaving ? "Saving…" : inWatchlist ? "Saved" : "Save"}</span>
          </button>

          {isSignedIn ? (
            <Link href="/profiles" className={styles.userBtn}>
              <div className={styles.profileAvatarWrap}>
                {activeProfile?.avatar ? (
                  <img
                    src={activeProfile.avatar}
                    alt={activeProfile.name || "Profile"}
                    className={styles.profileAvatar}
                  />
                ) : (
                  <User size={13} className={styles.profileAvatarFallback} />
                )}
              </div>
              <span className={styles.profileName}>{activeProfile?.name || "Profile"}</span>
            </Link>
          ) : (
            <Link href="/login" className={styles.loginBtn}>
              <User size={14} />
              <span>Log in</span>
            </Link>
          )}
        </div>
      </header>

      {!subjectId || !detailPath ? (
        <div className={styles.errorBox}>
          <p>Open a title from the catalog, then tap Play.</p>
          <Link href="/" className={styles.returnBtn}>
            Return Home
          </Link>
        </div>
      ) : (
        <div className={styles.layoutGrid}>
          <div className={styles.playerSection}>
            <div className={styles.playerStickyWrapper}>
              <div className={styles.playerWrapper}>
                <StreamPlayer
                  subjectId={subjectId}
                  detailPath={detailPath}
                  se={se}
                  ep={ep}
                  title={title}
                  poster={poster}
                  initialTime={initialTime}
                  prevEpisode={prevEpisode}
                  nextEpisode={nextEpisode}
                  onPrevEpisode={() => goTo(prevEpisode)}
                  onNextEpisode={() => goTo(nextEpisode)}
                  server={activeServer}
                  onStatusChange={(st) => {
                    if (st === "loading") {
                      startSwitching();
                    } else if (st === "ready" || st === "error") {
                      stopSwitching();
                    }
                  }}
                  onStreamMeta={(meta) => {
                    setStreamMeta(meta);
                    if (meta?.host === "Server 2") setActiveServer("2");
                    else if (meta?.host === "Server 1" && activeServer !== "2") setActiveServer("1");
                  }}
                  qualityIndex={selectedQuality}
                  onQualityChange={(q) => setSelectedQuality(q)}
                  audioLanguage={selectedAudioLang}
                  onAvailableAudioLanguages={(langs) => {
                    const list = Array.isArray(langs) ? langs : [];
                    setAvailableAudioLanguages(list);
                    if (list.length > 0) {
                      const active = list.find((l) => l.enabled) || list[0];
                      if (active && (!selectedAudioLang || selectedAudioLang === "Original")) {
                        setSelectedAudioLang(active.label || active.language);
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div className={styles.underPlayerBar}>
              <span className={styles.infringeText}> </span>
              <button
                type="button"
                className={styles.reportBtn}
                onClick={() => setReportModalOpen(true)}
              >
                <Flag size={13} />
                <span>Report</span>
              </button>
            </div>

            <div className={styles.desktopOnly}>
              {renderDetailsBlock()}
            </div>

            <div className={styles.mobileOnly}>
              <div className={styles.mobileTabBar} role="tablist">
                <button
                  type="button"
                  className={`${styles.mobileTabBtn} ${mobileTab === "overview" ? styles.mobileTabBtnActive : ""}`}
                  onClick={() => setMobileTab("overview")}
                >
                  Overview
                </button>
                {isSeries && (
                  <button
                    type="button"
                    className={`${styles.mobileTabBtn} ${mobileTab === "episodes" ? styles.mobileTabBtnActive : ""}`}
                    onClick={() => setMobileTab("episodes")}
                  >
                    <span>Episodes</span>
                    {currentSeasonEpisodes.length > 0 && (
                      <span className={styles.mobileTabBadge}>{currentSeasonEpisodes.length}</span>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.mobileTabBtn} ${mobileTab === "quality" ? styles.mobileTabBtnActive : ""}`}
                  onClick={() => setMobileTab("quality")}
                >
                  Servers & Quality
                </button>
                <button
                  type="button"
                  className={`${styles.mobileTabBtn} ${mobileTab === "recommended" ? styles.mobileTabBtnActive : ""}`}
                  onClick={() => setMobileTab("recommended")}
                >
                  <span>Recommended</span>
                  {recommendations.length > 0 && (
                    <span className={styles.mobileTabBadge}>{recommendations.length}</span>
                  )}
                </button>
              </div>

              <div className={styles.mobileTabContent}>
                {mobileTab === "overview" && renderDetailsBlock()}
                {mobileTab === "episodes" && isSeries && renderEpisodesPanel()}
                {mobileTab === "quality" && renderQualityPanel()}
                {mobileTab === "recommended" && renderRecommendedPanel()}
              </div>
            </div>
          </div>

          <aside className={`${styles.sidebar} ${styles.desktopOnly}`}>
            {isSeries && renderEpisodesPanel()}
            {renderQualityPanel()}
            {renderRecommendedPanel()}
          </aside>
        </div>
      )}

      {reportModalOpen && (
        <div
          className={styles.modalOverlay}
          onClick={() => !reportSubmitted && setReportModalOpen(false)}
        >
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleRow}>
                <AlertCircle size={18} className={styles.alertIcon} />
                <h3>Report Stream Issue</h3>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setReportModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {reportSubmitted ? (
              <div className={styles.successReport}>
                <Check size={28} className={styles.successCheck} />
                <p>Report received! Our automated crawler is verifying the stream.</p>
              </div>
            ) : (
              <form onSubmit={handleReportSubmit}>
                <p className={styles.modalDesc}>
                  Select the issue you encountered with this video or stream:
                </p>

                <div className={styles.radioGroup}>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="reportType"
                      value="buffering"
                      checked={reportCategory === "buffering"}
                      onChange={(e) => setReportCategory(e.target.value)}
                    />
                    <span>Video won&apos;t play or frequent buffering</span>
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="reportType"
                      value="sync"
                      checked={reportCategory === "sync"}
                      onChange={(e) => setReportCategory(e.target.value)}
                    />
                    <span>Audio or subtitle out of sync</span>
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="reportType"
                      value="wrong_ep"
                      checked={reportCategory === "wrong_ep"}
                      onChange={(e) => setReportCategory(e.target.value)}
                    />
                    <span>Wrong episode, missing sound, or incorrect cut</span>
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="reportType"
                      value="infringement"
                      checked={reportCategory === "infringement"}
                      onChange={(e) => setReportCategory(e.target.value)}
                    />
                    <span>Copyright or content infringement</span>
                  </label>
                </div>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.modalCancelBtn}
                    onClick={() => setReportModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={styles.modalSubmitBtn}>
                    Submit Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
