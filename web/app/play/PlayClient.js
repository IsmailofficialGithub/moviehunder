"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  Smartphone,
  User,
  ChevronDown,
  Flag,
  Check,
  X,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import StreamPlayer from "../../components/StreamPlayer";
import { getEpisodes, searchTitles } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { addHistoryItem } from "../../lib/guestHistory";
import { getActiveProfile } from "../../lib/profiles";
import { formatBytes } from "../../lib/stream";
import styles from "./play.module.css";

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

function extractLanguageTag(titleText, slugText) {
  const combined = `${titleText || ""} ${slugText || ""}`;
  const m =
    combined.match(
      /\[\s*(Hindi|English|Telugu|Tamil|Japanese|Spanish|Korean|Chinese|Urdu|Punjabi|French|German|Russian|Arabic|Multi[- ]?Audio)\s*(?:Dub)?\s*\]/i
    ) ||
    combined.match(
      /\(\s*(Hindi|English|Telugu|Tamil|Japanese|Spanish|Korean|Chinese|Urdu|Punjabi|French|German|Russian|Arabic|Multi[- ]?Audio)\s*(?:Dub)?\s*\)/i
    ) ||
    combined.match(
      /\b(Hindi|Telugu|Tamil|Japanese|Spanish|Korean|Urdu)\s+(?:Dub|Dubbed)\b/i
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

  const se = params.get("se") || "0";
  const ep = params.get("ep") || "0";
  let title = params.get("title") || "";
  let poster = params.get("poster") || "";
  const initialTime = Number(params.get("t") || params.get("start") || params.get("position") || 0);

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
  const isSeries = Number(se) > 0 || Number(ep) > 0 || seasons.length > 0;
  const [activeSeason, setActiveSeason] = useState(String(Number(se) > 0 ? se : "1"));
  const initialLang = useMemo(() => {
    return extractLanguageTag(title, detailPath) || "Original";
  }, [title, detailPath]);

  const [selectedAudioLang, setSelectedAudioLang] = useState(initialLang);
  const [availableDubs, setAvailableDubs] = useState([]);
  const [formatMode, setFormatMode] = useState("dash"); // "dash" | "mp4"
  const [streamMeta, setStreamMeta] = useState(null);
  const [selectedQuality, setSelectedQuality] = useState(0);
  const [availableAudioLanguages, setAvailableAudioLanguages] = useState([]);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("buffering");
  const [reportSubmitted, setReportSubmitted] = useState(false);

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
      return;
    }

    let cancelled = false;

    async function loadEpisodes() {
      try {
        let epData = null;
        if (slugToFetch && !/^\d+$/.test(slugToFetch)) {
          try {
            epData = await getEpisodes(slugToFetch);
          } catch {}
        }

        // Search title to find real slug and alternate CDN dubs (e.g. [Hindi], [English])
        if (title) {
          try {
            const cleanTitle = title.replace(/\s*\[.*?\]|\s*\(.*?\)/g, "").trim();
            const searchRes = await searchTitles(cleanTitle || title);
            const baseClean = (cleanTitle || title).toLowerCase();
            const matching = (searchRes?.movies || []).filter((m) => {
              const mClean = (m.name || "").replace(/\s*\[.*?\]|\s*\(.*?\)/g, "").trim().toLowerCase();
              return mClean === baseClean || mClean.startsWith(baseClean) || baseClean.startsWith(mClean);
            });

            if (matching.length > 0) {
              const dubs = matching.map((m) => {
                const lang = extractLanguageTag(m.name, m.slug) || "Original";
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

            if (!epData?.seasons || epData.seasons.length === 0) {
              const found =
                matching.find(
                  (m) =>
                    (subjectId && String(m.subject_id) === String(subjectId)) ||
                    (m.name && m.name.toLowerCase() === title.toLowerCase()) ||
                    (m.slug && m.slug.toLowerCase().includes(baseClean.replace(/\s+/g, "-")))
                ) || searchRes?.movies?.[0];
              if (found?.slug) {
                const resSlug = String(found.slug).replace(/^\/?detail\//, "").replace(/^\/+/, "");
                epData = await getEpisodes(resSlug);
              }
            }
          } catch {}
        }

        if (cancelled) return;
        const normalized = normalizeSeasons(epData?.seasons || []);
        setSeasons(normalized);
        if (normalized.length > 0 && Number(se) <= 0) {
          setActiveSeason(String(normalized[0].season));
        }
      } catch {
        if (!cancelled) setSeasons([]);
      }
    }

    loadEpisodes();
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

  const backHref = detailPath
    ? `/title/${encodeURIComponent(detailPath)}${isSeries ? `?se=${encodeURIComponent(se)}&ep=${encodeURIComponent(ep)}` : ""}`
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
    if (isSeries && seasons.length === 0) {
      // Fallback single season
      const cur = Number(ep) || 1;
      const count = Math.max(cur + 5, 24);
      return Array.from({ length: count }, (_, i) => ({
        se: String(activeSeason || "1"),
        ep: String(i + 1),
      }));
    }
    return [];
  }, [seasons, activeSeason, isSeries, ep]);

  const toggleFormat = () => {
    setFormatMode((prev) => (prev === "dash" ? "mp4" : "dash"));
  };

  const currentLanguageTag = useMemo(() => {
    return extractLanguageTag(title, detailPath) || selectedAudioLang || "Original";
  }, [title, detailPath, selectedAudioLang]);

  const combinedAudioOptions = useMemo(() => {
    const list = [];
    const seen = new Set();

    // 1. Add CDN dub variants
    for (const d of availableDubs) {
      if (!seen.has(d.label)) {
        seen.add(d.label);
        list.push({ id: `dub_${d.label}`, label: d.label, isDub: true, dub: d });
      }
    }

    // 2. Add machine audio tracks if available
    for (const t of availableAudioLanguages) {
      const lbl = t.label || t.language;
      if (!seen.has(lbl)) {
        seen.add(lbl);
        list.push({ id: String(t.id), label: lbl, isDub: false, track: t });
      }
    }

    // 3. Ensure currentLanguageTag is present
    if (currentLanguageTag && !seen.has(currentLanguageTag)) {
      list.unshift({ id: `cur_${currentLanguageTag}`, label: currentLanguageTag, isDub: false });
    }

    return list;
  }, [availableDubs, availableAudioLanguages, currentLanguageTag]);

  const handleAudioSelect = (val) => {
    setSelectedAudioLang(val);
    const targetDub = availableDubs.find((d) => d.label === val);
    if (targetDub) {
      const targetSlug = targetDub.slug;
      const targetSub = targetDub.subjectId;
      if ((targetSlug && targetSlug !== detailPath) || (targetSub && targetSub !== subjectId)) {
        router.push(
          `/play?${playQuery({
            subjectId: targetSub || subjectId,
            detailPath: targetSlug || detailPath,
            se,
            ep,
            title: targetDub.title || title,
            poster: targetDub.poster || poster,
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

  return (
    <main className={styles.main}>
      {/* Top Header Bar */}
      <header className={styles.topHeader}>
        <div className={styles.titleArea}>
          <Link href={backHref} className={styles.backBtn} title="Back to Details">
            <ArrowLeft size={16} />
          </Link>
          <h1 className={styles.mediaTitle}>
            {title || "Now Playing"}
            {selectedAudioLang && selectedAudioLang !== "Original" && <span className={styles.langTag}> [{selectedAudioLang}]</span>}
            {seasonRangeText && <span className={styles.seasonTag}> {seasonRangeText}</span>}
          </h1>
        </div>

        <div className={styles.headerActions}>
          {/* <Link href="/account" className={styles.goPremiumBtn}>
            <Sparkles size={14} className={styles.goldSparkle} />
            <span>Go Premium</span>
          </Link> */}

          {/* <Link href="/download" className={styles.downloadBtn}>
            <Smartphone size={14} />
            <span>Download App</span>
          </Link> */}

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

      {/* Main Grid: Player on Left, Sidebar on Right */}
      {!subjectId || !detailPath ? (
        <div className={styles.errorBox}>
          <p>Open a title from the catalog, then tap Play.</p>
          <Link href="/" className={styles.returnBtn}>
            Return Home
          </Link>
        </div>
      ) : (
        <div className={styles.layoutGrid}>
          {/* Left: Video Player and DMCA/Report footer */}
          <div className={styles.playerSection}>
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
                onStreamMeta={(meta) => setStreamMeta(meta)}
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

            {/* Under-player bar */}
            <div className={styles.underPlayerBar}>
              <span className={styles.infringeText}>
                {" "}
              </span>
              <button
                type="button"
                className={styles.reportBtn}
                onClick={() => setReportModalOpen(true)}
              >
                <Flag size={13} />
                <span>Report</span>
              </button>
            </div>
          </div>

          {/* Right: Sidebar Controls (Episodes & Stream Quality) */}
          <aside className={styles.sidebar}>
            {/* Episodes Card for TV series */}
            {isSeries && (
              <div className={styles.panelCard}>
                <div className={styles.panelHeaderRow}>
                  <div className={styles.panelTitleWithCount}>
                    <span className={styles.panelTitle}>Episodes</span>
                    {currentSeasonEpisodes.length > 0 && (
                      <span className={styles.countBadge}>
                        {currentSeasonEpisodes.length} eps
                      </span>
                    )}
                  </div>

                  {seasons.length > 0 && (
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
                  )}
                </div>

                {/* Episode Grid */}
                {currentSeasonEpisodes.length > 0 ? (
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
                          {isPlaying ? (
                            <span className={styles.equalizerIcon}>
                              <span className={styles.eqBar1}></span>
                              <span className={styles.eqBar2}></span>
                              <span className={styles.eqBar3}></span>
                            </span>
                          ) : (
                            String(item.ep).padStart(2, "0")
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.singleMovieInfo}>
                    <p>Loading episodes...</p>
                  </div>
                )}
              </div>
            )}

            {/* Stream Quality & Format Card */}
            <div className={styles.panelCard}>
              <div className={styles.panelHeaderRow}>
                <span className={styles.panelTitle}>Stream Quality</span>
              </div>

              {/* Stream Qualities */}
              {streamMeta?.sources?.length > 0 ? (
                <div className={styles.streamSourcesList}>
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
                        >
                          <span className={styles.sourceRes}>{s.resolution}</span>
                          {size && <span className={styles.sourceSize}>{size}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className={styles.streamAutoStatus}>
                  <span>Optimal Stream Active</span>
                </div>
              )}

              {/* Audio / Language selector based on CDN tags & tracks */}
              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Audio Track</span>
                {combinedAudioOptions.length > 1 ? (
                  <div className={styles.selectWrapper}>
                    <select
                      className={styles.customSelect}
                      value={selectedAudioLang}
                      onChange={(e) => handleAudioSelect(e.target.value)}
                    >
                      {combinedAudioOptions.map((t) => (
                        <option key={t.id} value={t.label}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className={styles.selectChevron} />
                  </div>
                ) : (
                  <div className={styles.audioPill}>
                    <span className={styles.audioPillDot}></span>
                    <span>{currentLanguageTag}</span>
                  </div>
                )}
              </div>

              {/* Stream Format Row */}
              <div className={styles.formatRow}>
                <div className={styles.formatInfo}>
                  <span className={styles.settingLabel}>Format</span>
                  <span className={styles.formatDesc}>
                    {formatMode === "dash" ? "High efficiency (DASH)" : "Standard (H.264)"}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.switchBtn}
                  onClick={toggleFormat}
                >
                  Switch
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Report Modal */}
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
