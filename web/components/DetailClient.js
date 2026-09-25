"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  ChevronDown,
  ChevronUp,
  Star,
  Film,
  Tv,
  Layers,
  Sparkles,
  Info,
  MessageSquare,
} from "lucide-react";
import BtnSpinner from "./BtnSpinner";
import TitleCard from "./TitleCard";
import styles from "./DetailClient.module.css";

function defaultEpisode(seasons) {
  const first = seasons?.[0]?.episodes?.[0];
  if (first) return { se: String(first.se ?? 1), ep: String(first.ep ?? 1) };
  return { se: "0", ep: "0" };
}

function formatDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return null;
  const mins = Math.round(n / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function castName(person) {
  const raw =
    person?.name || person?.staffName || person?.title || person?.nickname;
  return typeof raw === "string" ? raw.trim() : "";
}

const REVIEW_PREVIEW = 140;
const EPISODE_PREVIEW_COUNT = 12;
const SPAM_RE =
  /(?:whatsapp|telegram|t\.me\/|wa\.me\/|spell|vashikaran|astrolog|black magic|lottery|earn money|click here|china apps?|contact (?:me|us)|call (?:me|now)|\+\d{8,}|\d{10,})/i;

function isUsefulReview(content) {
  const text = content.trim();
  if (text.length < 2) return false;
  if (text.length > 900) return false;
  if (SPAM_RE.test(text)) return false;
  // Dense digit / link spam
  const digits = (text.match(/\d/g) || []).length;
  if (digits > 40 && digits / text.length > 0.2) return false;
  return true;
}

export default function DetailClient({ slug, detail, episodes }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const meta = detail?.metadata || {};
  const seasons = useMemo(
    () =>
      (episodes?.seasons || []).filter(
        (s) => (s.episodes || []).length > 0 || Number(s.episode_count) > 0
      ),
    [episodes?.seasons]
  );
  const subjectId = meta.id || episodes?.subject_id;
  const isSeries = seasons.length > 0;
  const defaults = defaultEpisode(seasons);

  const [selectedSe, setSelectedSe] = useState(defaults.se);
  const [selectedEp, setSelectedEp] = useState(defaults.ep);
  const [activeTab, setActiveTab] = useState(isSeries ? "episodes" : "overview");
  const [episodesExpanded, setEpisodesExpanded] = useState(false);
  const [relatedExpanded, setRelatedExpanded] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [watchProgress, setWatchProgress] = useState({});

  // Synchronize active tab if series status updates
  useEffect(() => {
    setActiveTab(isSeries ? "episodes" : "overview");
  }, [isSeries]);

  const activeSeason = useMemo(
    () =>
      seasons.find((s) => String(s.season) === String(selectedSe)) || seasons[0],
    [seasons, selectedSe]
  );
  const episodeList = activeSeason?.episodes || [];
  const visibleEpisodes = episodesExpanded
    ? episodeList
    : episodeList.slice(0, EPISODE_PREVIEW_COUNT);

  const related = useMemo(
    () => (Array.isArray(meta.related) ? meta.related : []).slice(0, 24),
    [meta.related]
  );
  const visibleRelated = relatedExpanded ? related : related.slice(0, 12);
  const description = meta.description || "No description available.";
  const descriptionNeedsToggle =
    description.length > 220 || description.split(/\s+/).length > 36;

  const genres = useMemo(
    () =>
      String(meta.genre || "")
        .split(/[,/|]/)
        .map((g) => g.trim())
        .filter(Boolean),
    [meta.genre]
  );

  const metaBits = useMemo(
    () =>
      [
        meta.release_date,
        formatDuration(meta.duration),
        meta.country,
        meta.badge,
      ].filter(Boolean),
    [meta.release_date, meta.duration, meta.country, meta.badge]
  );

  const castPeople = useMemo(() => {
    const list = Array.isArray(meta.top_cast) && meta.top_cast.length
      ? meta.top_cast
      : Array.isArray(meta.related)
        ? meta.related.filter((item) => item?.staffId || item?.staffType || (!item?.subject_type && item?.name))
        : [];
    return list
      .map((person, i) => {
        const name = castName(person);
        if (!name) return null;
        const avatar =
          (typeof person?.avatarUrl === "string" && /^https?:\/\//i.test(person.avatarUrl) && person.avatarUrl) ||
          (typeof person?.avatar === "string" && /^https?:\/\//i.test(person.avatar) && person.avatar) ||
          (typeof person?.image === "string" && /^https?:\/\//i.test(person.image) && person.image) ||
          null;
        const role =
          typeof person?.character === "string"
            ? person.character
            : typeof person?.role === "string"
              ? person.role
              : "";
        return {
          key: `cast-${i}-${String(person?.staffId || person?.id || name)}`,
          name,
          avatar,
          role,
        };
      })
      .filter(Boolean)
      .slice(0, 18);
  }, [meta.top_cast, meta.related]);

  const reviews = useMemo(
    () =>
      (Array.isArray(meta.user_reviews) ? meta.user_reviews : [])
        .filter((r) => typeof r?.content === "string" && r.content.trim())
        .map((r) => ({
          ...r,
          content: r.content.trim(),
        }))
        .filter((r) => isUsefulReview(r.content))
        .sort((a, b) => a.content.length - b.content.length)
        .slice(0, 8),
    [meta.user_reviews]
  );

  const [expandedReviews, setExpandedReviews] = useState(() => new Set());

  const toggleReview = (key) => {
    setExpandedReviews((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Hydrate local watch history from StreamPlayer
  useEffect(() => {
    if (!subjectId || typeof window === "undefined") return;
    try {
      const progress = {};
      if (isSeries) {
        for (const s of seasons) {
          for (const ep of s.episodes || []) {
            const key = `history_${subjectId}_${ep.se}_${ep.ep}`;
            const val = localStorage.getItem(key);
            if (val) {
              const pos = Number(val);
              const dur = Number(ep.duration || meta.duration || 0);
              if (pos > 5) {
                const pct = dur > 0 ? Math.min(100, Math.round((pos / dur) * 100)) : 10;
                progress[`${ep.se}_${ep.ep}`] = pct;
              }
            }
          }
        }
      } else {
        const key = `history_${subjectId}_0_0`;
        const val = localStorage.getItem(key);
        if (val) {
          const pos = Number(val);
          const dur = Number(meta.duration || 0);
          if (pos > 5) {
            const pct = dur > 0 ? Math.min(100, Math.round((pos / dur) * 100)) : 10;
            progress["0_0"] = { pos, dur, pct };
          }
        }
      }
      setWatchProgress(progress);
    } catch {
      // storage quota or private mode fallback
    }
  }, [subjectId, isSeries, seasons, meta.duration]);

  const tabs = useMemo(() => {
    if (isSeries) {
      return [
        { key: "episodes", label: `Episodes (${episodeList.length})`, icon: Tv },
        { key: "collection", label: "Collection", icon: Layers },
        { key: "more", label: "More Like This", icon: Sparkles },
        { key: "details", label: "Details & Cast", icon: Info },
      ];
    }
    return [
      { key: "overview", label: "Overview & Cast", icon: Film },
      { key: "more", label: "More Like This", icon: Sparkles },
      { key: "reviews", label: `Reviews (${reviews.length})`, icon: MessageSquare },
    ];
  }, [isSeries, episodeList.length, reviews.length]);

  const goPlay = (se = selectedSe, ep = selectedEp) => {
    if (!subjectId || pending) return;
    const q = new URLSearchParams({
      subjectId: String(subjectId),
      detail_path: slug,
      se: String(se),
      ep: String(ep),
      title: meta.title || slug,
    });
    startTransition(() => {
      router.push(`/play?${q.toString()}`);
    });
  };

  const movieWatch = !isSeries ? watchProgress["0_0"] : null;

  return (
    <article className={styles.detail}>
      <div className={styles.hero}>
        <div className={styles.posterContainer}>
          {meta.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={meta.poster}
              alt={meta.title || slug}
              className={styles.poster}
            />
          ) : (
            <div className={styles.posterEmpty} aria-hidden />
          )}
        </div>

        <div className={styles.heroCopy}>
          <h1 className={styles.title}>{meta.title || slug}</h1>

          {metaBits.length ? (
            <div className={styles.metaRow}>
              {metaBits.map((bit, idx) => (
                <span key={idx} className={styles.metaItem}>
                  {idx > 0 ? <span className={styles.metaDot}>·</span> : null}
                  {bit}
                </span>
              ))}
            </div>
          ) : null}

          {meta.imdb_rating ? (
            <div className={styles.ratingBadge}>
              <Star size={13} fill="var(--gold, #f5c518)" color="var(--gold, #f5c518)" />
              <span className={styles.ratingScore}>{meta.imdb_rating}</span>
              <span className={styles.ratingSource}>IMDb</span>
            </div>
          ) : null}

          {genres.length ? (
            <div className={styles.genreChips}>
              {genres.map((g) => (
                <span key={g} className={styles.genreChip}>
                  {g}
                </span>
              ))}
            </div>
          ) : null}

          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.primaryPlayBtn}
              disabled={!subjectId || pending}
              aria-busy={pending || undefined}
              onClick={() => goPlay()}
            >
              {pending ? (
                <BtnSpinner />
              ) : (
                <>
                  <Play size={16} fill="currentColor" color="currentColor" />
                  <span>
                    {isSeries
                      ? `Play S${selectedSe}E${selectedEp}`
                      : "Play Now"}
                  </span>
                </>
              )}
            </button>

            {!subjectId ? (
              <span className={styles.warn}>Playback isn’t available</span>
            ) : null}
          </div>

          {movieWatch && movieWatch.pct > 0 ? (
            <div className={styles.watchResumeBox}>
              <div className={styles.watchResumeHead}>
                <span className={styles.watchResumeTitle}>Continue watching</span>
                <span className={styles.watchResumePct}>{movieWatch.pct}%</span>
              </div>
              <div className={styles.watchResumeTrack}>
                <div
                  className={styles.watchResumeFill}
                  style={{ width: `${movieWatch.pct}%` }}
                />
              </div>
              <span className={styles.watchResumeSub}>
                Watched {formatDuration(movieWatch.pos) || "a little"}
                {movieWatch.dur ? ` of ${formatDuration(movieWatch.dur)}` : ""}
              </span>
            </div>
          ) : null}

          {description ? (
            <div className={styles.heroSynopsis}>
              <p
                className={`${styles.synopsisText} ${
                  descriptionNeedsToggle && !descriptionExpanded
                    ? styles.synopsisClamped
                    : ""
                }`}
              >
                {description}
              </p>
              {descriptionNeedsToggle ? (
                <button
                  type="button"
                  className={styles.synopsisToggleBtn}
                  onClick={() => setDescriptionExpanded((v) => !v)}
                >
                  {descriptionExpanded ? (
                    <>
                      <span>Show less</span>
                      <ChevronUp size={13} />
                    </>
                  ) : (
                    <>
                      <span>Show more</span>
                      <ChevronDown size={13} />
                    </>
                  )}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.tabBar}>
        {tabs.map((t) => {
          const active = activeTab === t.key;
          const IconComp = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              className={`${styles.tabBtn} ${active ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab(t.key)}
            >
              {IconComp ? <IconComp size={15} /> : null}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {isSeries && activeTab === "episodes" ? (
        <section className={styles.contentSection}>
          <div className={styles.seasonBar}>
            <div className={styles.seasonPickerWrap}>
              <label htmlFor="season-select" className={styles.seasonLabel}>
                Season:
              </label>
              <div className={styles.seasonSelectBox}>
                <select
                  id="season-select"
                  className={styles.seasonSelect}
                  value={selectedSe}
                  onChange={(e) => {
                    const se = e.target.value;
                    setSelectedSe(se);
                    const season =
                      seasons.find((s) => String(s.season) === se) || seasons[0];
                    setSelectedEp(String(season?.episodes?.[0]?.ep || 1));
                    setEpisodesExpanded(false);
                  }}
                >
                  {seasons.map((s) => (
                    <option key={s.season} value={s.season}>
                      Season {s.season} ({s.episode_count || s.episodes?.length || 0} Episodes)
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className={styles.seasonChevron} />
              </div>
            </div>
            <div className={styles.seasonCounter}>
              Showing {visibleEpisodes.length} of {episodeList.length} Episodes
            </div>
          </div>

          <div className={styles.episodeList}>
            {visibleEpisodes.map((ep, idx) => {
              const active =
                String(ep.se) === String(selectedSe) &&
                String(ep.ep) === String(selectedEp);
              const epNum = ep.ep || idx + 1;
              const rawName = String(ep.name || "").trim();
              const cleanName = rawName.replace(/^episode\s*\d+\s*[-:]*\s*/i, "").trim();
              const epTitle = cleanName ? `${epNum}. ${cleanName}` : `${epNum}. Episode ${epNum}`;
              const epDuration =
                formatDuration(ep.duration) ||
                formatDuration(meta.duration) ||
                "48m";
              const epSynopsis =
                ep.description ||
                ep.overview ||
                meta.description ||
                `Episode ${epNum} of ${meta.title || "this series"}.`;
              const thumbUri = ep.thumbnail || ep.image || meta.poster;
              const watchPct = watchProgress[`${ep.se}_${ep.ep}`] || 0;

              return (
                <div
                  key={`${ep.se}-${ep.ep}-${idx}`}
                  className={`${styles.episodeCard} ${active ? styles.episodeCardActive : ""}`}
                  onClick={() => {
                    setSelectedSe(String(ep.se));
                    setSelectedEp(String(ep.ep));
                    goPlay(ep.se, ep.ep);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedSe(String(ep.se));
                      setSelectedEp(String(ep.ep));
                      goPlay(ep.se, ep.ep);
                    }
                  }}
                >
                  <div className={styles.episodeMainRow}>
                    <div className={styles.episodeThumbWrap}>
                      {thumbUri ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbUri}
                          alt={epTitle}
                          className={styles.episodeThumb}
                          loading="lazy"
                        />
                      ) : (
                        <div className={styles.episodeThumbEmpty}>
                          <Film size={22} className={styles.thumbPlaceholderIcon} />
                        </div>
                      )}
                      <div className={styles.thumbPlayCircle}>
                        <Play size={13} fill="#ffffff" color="#ffffff" style={{ marginLeft: 2 }} />
                      </div>
                      {watchPct > 0 ? (
                        <div className={styles.thumbWatchTrack}>
                          <div
                            className={styles.thumbWatchFill}
                            style={{ width: `${watchPct}%` }}
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className={styles.episodeMeta}>
                      <div className={styles.episodeTitleLine}>
                        <h3 className={styles.episodeTitle}>{epTitle}</h3>
                        <span className={styles.episodeDurationBadge}>
                          {epDuration}
                        </span>
                      </div>
                      <p className={styles.episodeSynopsis}>{epSynopsis}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {episodeList.length > EPISODE_PREVIEW_COUNT ? (
            <button
              type="button"
              className={styles.episodesToggleBtn}
              onClick={() => setEpisodesExpanded((value) => !value)}
            >
              <span>
                {episodesExpanded
                  ? "Show fewer episodes"
                  : `Show all ${episodeList.length} episodes`}
              </span>
              {episodesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          ) : null}
        </section>
      ) : null}

      {isSeries && activeTab === "collection" ? (
        <section className={styles.contentSection}>
          <div className={styles.collectionGrid}>
            {seasons.map((s) => {
              const epCount = (s.episodes || []).length || s.episode_count || 0;
              const isCur = String(s.season) === String(selectedSe);
              return (
                <div key={`coll-${s.season}`} className={styles.collectionCard}>
                  <div className={styles.collectionHead}>
                    <div>
                      <h3 className={styles.collectionSeasonTitle}>Season {s.season}</h3>
                      <span className={styles.collectionSeasonSub}>{epCount} Episodes</span>
                    </div>
                    <button
                      type="button"
                      className={styles.collectionPlayBtn}
                      onClick={() => {
                        setSelectedSe(String(s.season));
                        const firstEp = s.episodes?.[0]?.ep || 1;
                        setSelectedEp(String(firstEp));
                        goPlay(s.season, firstEp);
                      }}
                    >
                      <Play size={12} fill="currentColor" color="currentColor" />
                      <span>Play Season</span>
                    </button>
                  </div>
                  <div className={styles.collectionPills}>
                    {(s.episodes || []).map((ep) => {
                      const isEpActive = isCur && String(ep.ep) === String(selectedEp);
                      return (
                        <button
                          key={`pill-${s.season}-${ep.ep}`}
                          type="button"
                          className={`${styles.collectionEpPill} ${
                            isEpActive ? styles.collectionEpPillActive : ""
                          }`}
                          onClick={() => {
                            setSelectedSe(String(s.season));
                            setSelectedEp(String(ep.ep));
                            goPlay(s.season, ep.ep);
                          }}
                        >
                          {ep.ep}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeTab === "more" ? (
        <section className={styles.contentSection}>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>More Like This</h2>
            {related.length > 12 ? (
              <button
                type="button"
                className={styles.sectionToggleBtn}
                onClick={() => setRelatedExpanded((value) => !value)}
              >
                <span>{relatedExpanded ? "Show less" : "Show more"}</span>
                {relatedExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            ) : null}
          </div>

          {visibleRelated.length ? (
            <div className={styles.relatedGrid}>
              {visibleRelated.map((item) => (
                <TitleCard key={item.slug} item={item} />
              ))}
            </div>
          ) : (
            <p className={styles.emptyNote}>No recommendations found.</p>
          )}
        </section>
      ) : null}

      {((isSeries && activeTab === "details") || (!isSeries && activeTab === "overview")) ? (
        <section className={styles.contentSection}>
          <div className={styles.detailsBlock}>
            <h2 className={styles.sectionTitle}>Storyline & Overview</h2>
            <p className={styles.fullDescription}>{description}</p>
          </div>

          {castPeople.length ? (
            <div className={styles.detailsBlock}>
              <h2 className={styles.sectionTitle}>Top Cast</h2>
              <div className={styles.castRow}>
                {castPeople.map((person) => (
                  <div key={person.key} className={styles.castCard}>
                    {person.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={person.avatar}
                        alt={person.name}
                        className={styles.avatar}
                        loading="lazy"
                      />
                    ) : (
                      <div className={`${styles.avatar} ${styles.avatarEmpty}`}>
                        {person.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <p className={styles.castName}>{person.name}</p>
                    {person.role ? (
                      <p className={styles.castRole}>{person.role}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.detailsBlock}>
            <h2 className={styles.sectionTitle}>Information</h2>
            <div className={styles.infoGrid}>
              {meta.release_date ? (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Release Date</span>
                  <span className={styles.infoValue}>{meta.release_date}</span>
                </div>
              ) : null}
              {meta.duration ? (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Runtime</span>
                  <span className={styles.infoValue}>{formatDuration(meta.duration)}</span>
                </div>
              ) : null}
              {meta.country ? (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Country</span>
                  <span className={styles.infoValue}>{meta.country}</span>
                </div>
              ) : null}
              {meta.badge ? (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Format / Quality</span>
                  <span className={styles.infoValue}>{meta.badge}</span>
                </div>
              ) : null}
              {meta.imdb_rating ? (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>IMDb Rating</span>
                  <span className={styles.infoValue}>★ {meta.imdb_rating} / 10</span>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {!isSeries && activeTab === "reviews" ? (
        <section className={styles.contentSection}>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>User Reviews</h2>
            {reviews.length ? (
              <span className={styles.reviewsCountBadge}>{reviews.length}</span>
            ) : null}
          </div>

          {reviews.length ? (
            <div className={styles.reviewsList}>
              {reviews.map((r, i) => {
                const key = `${r.user || "anon"}-${i}`;
                const name = r.user || "Anonymous";
                const initial = name.slice(0, 1).toUpperCase();
                const long = r.content.length > REVIEW_PREVIEW;
                const open = expandedReviews.has(key);
                const text =
                  long && !open
                    ? `${r.content.slice(0, REVIEW_PREVIEW).trim()}…`
                    : r.content;

                return (
                  <article key={key} className={styles.reviewCard}>
                    <div className={styles.reviewTop}>
                      <div className={styles.reviewAvatar} aria-hidden>
                        {initial}
                      </div>
                      <div className={styles.reviewMeta}>
                        <p className={styles.reviewName}>{name}</p>
                        {r.created_at ? (
                          <p className={styles.reviewDate}>
                            {String(r.created_at).slice(0, 10)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <p className={styles.reviewBody}>{text}</p>
                    {long ? (
                      <button
                        type="button"
                        className={styles.reviewMoreBtn}
                        onClick={() => toggleReview(key)}
                      >
                        {open ? "Show less" : "Read more"}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className={styles.emptyNote}>No reviews yet for this title.</p>
          )}
        </section>
      ) : null}
    </article>
  );
}
