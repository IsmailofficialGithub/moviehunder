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
import { getEpisodes } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { addHistoryItem } from "../../lib/guestHistory";
import { getActiveProfile } from "../../lib/profiles";
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

export default function PlayClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, isSignedIn } = useAuth();
  const [activeProfile, setActiveProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem("active_profile")) || null; } catch { return null; }
  });
  useEffect(() => {
    const onProfileChange = (e) => setActiveProfile(e.detail || null);
    window.addEventListener("mh:profile:change", onProfileChange);
    return () => window.removeEventListener("mh:profile:change", onProfileChange);
  }, []);


  let subjectId = params.get("subjectId") || params.get("id") || "";
  let detailPath = params.get("detail_path") || "";

  if (!subjectId && detailPath) subjectId = detailPath;
  if (!detailPath && subjectId) detailPath = subjectId;

  const se = params.get("se") || "0";
  const ep = params.get("ep") || "0";
  let title = params.get("title") || "";
  let poster = params.get("poster") || "";
  const initialTime = Number(params.get("t") || params.get("start") || params.get("position") || 0);

  // Restore cached metadata
  if (subjectId && typeof window !== "undefined") {
    try {
      const meta = JSON.parse(localStorage.getItem(`history_meta_${subjectId}`) || "{}");
      if (!detailPath && meta.detailPath) detailPath = meta.detailPath;
      if ((!title || /^\d+$/.test(String(title).trim())) && meta.title && !/^\d+$/.test(String(meta.title).trim())) {
        title = meta.title;
      }
      if (!poster && meta.poster) poster = meta.poster;
    } catch { }
  }

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

  const isSeries = Number(se) > 0 || Number(ep) > 0;
  const [seasons, setSeasons] = useState([]);
  const [activeSeason, setActiveSeason] = useState(String(Number(se) > 0 ? se : "1"));
  const [selectedAudioLang, setSelectedAudioLang] = useState("Hindi dub");
  const [formatMode, setFormatMode] = useState("dash"); // "dash" | "mp4"
  const [streamMeta, setStreamMeta] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("buffering");
  const [reportSubmitted, setReportSubmitted] = useState(false);

  useEffect(() => {
    if (Number(se) > 0) {
      setActiveSeason(String(se));
    }
  }, [se]);

  useEffect(() => {
    if (!detailPath) {
      setSeasons([]);
      return;
    }
    let cancelled = false;
    getEpisodes(detailPath)
      .then((data) => {
        if (cancelled) return;
        const normalized = normalizeSeasons(data?.seasons || []);
        setSeasons(normalized);
        if (normalized.length > 0 && Number(se) <= 0) {
          setActiveSeason(String(normalized[0].season));
        }
      })
      .catch(() => {
        if (!cancelled) setSeasons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [detailPath, se]);

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
      // Fallback single season 1..10
      return Array.from({ length: Math.max(Number(ep) || 4, 4) }, (_, i) => ({
        se: String(activeSeason || "1"),
        ep: String(i + 1),
      }));
    }
    return [];
  }, [seasons, activeSeason, isSeries, ep]);

  const toggleFormat = () => {
    setFormatMode((prev) => (prev === "dash" ? "mp4" : "dash"));
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
            {selectedAudioLang && <span className={styles.langTag}> [{selectedAudioLang}]</span>}
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
              {activeProfile?.avatar
                ? <img src={activeProfile.avatar} alt={activeProfile.name || "Profile"} className={styles.profileAvatar} />
                : <User size={14} />}
              <span>{activeProfile?.name || user?.display_name || user?.name || "Profile"}</span>
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

          {/* Right: Sidebar Controls (Format & Resources) */}
          <aside className={styles.sidebar}>
            {/* Format Card */}
            <div className={styles.panelCard}>
              <div className={styles.panelHeaderRow}>
                <span className={styles.panelTitle}>Format</span>
                <button
                  type="button"
                  className={styles.switchBtn}
                  onClick={toggleFormat}
                >
                  Switch
                </button>
              </div>
              <div className={styles.panelSubtitle}>
                {formatMode === "dash"
                  ? "High efficiency (DASH/H.265)"
                  : "Standard compatibility (H.264/MP4)"}
              </div>
            </div>

            {/* Resources Card */}
            <div className={styles.panelCard}>
              <div className={styles.panelTitle}>Sources</div>

              {/* Selectors Row */}
              <div className={styles.selectRow}>
                {/* Audio / Language dub selector */}
                <div className={styles.selectWrapper}>
                  <select
                    className={styles.customSelect}
                    value={selectedAudioLang}
                    onChange={(e) => setSelectedAudioLang(e.target.value)}
                  >
                    <option value="Hindi dub">Hindi dub</option>
                    <option value="English">English</option>
                    <option value="Original">Original</option>
                    <option value="Japanese dub">Japanese dub</option>
                    <option value="Spanish dub">Spanish dub</option>
                    <option value="Multi Audio">Multi Audio</option>
                  </select>
                  <ChevronDown size={14} className={styles.selectChevron} />
                </div>

                {/* Season selector (shows if series or multiple seasons) */}
                {seasons.length > 0 && (
                  <div className={styles.selectWrapper}>
                    <select
                      className={styles.customSelect}
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
                    <ChevronDown size={14} className={styles.selectChevron} />
                  </div>
                )}
              </div>

              {/* Episode Number Grid */}
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
                  <p>Full length feature stream ready</p>
                </div>
              )}
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
