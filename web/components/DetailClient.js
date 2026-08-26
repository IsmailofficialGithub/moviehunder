"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import BtnSpinner from "./BtnSpinner";
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

export default function DetailClient({ slug, detail, episodes }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const meta = detail?.metadata || {};
  const seasons = episodes?.seasons || [];
  const subjectId = meta.id || episodes?.subject_id;
  const isSeries = seasons.some((s) => (s.episodes || []).length > 0);
  const defaults = defaultEpisode(seasons);

  const [selectedSe, setSelectedSe] = useState(defaults.se);
  const [selectedEp, setSelectedEp] = useState(defaults.ep);

  const activeSeason = useMemo(
    () =>
      seasons.find((s) => String(s.season) === String(selectedSe)) || seasons[0],
    [seasons, selectedSe]
  );

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
    const list = Array.isArray(meta.top_cast) ? meta.top_cast : [];
    return list
      .map((person, i) => {
        const name = castName(person);
        if (!name) return null;
        const avatar =
          typeof person?.avatarUrl === "string" &&
          /^https?:\/\//i.test(person.avatarUrl)
            ? person.avatarUrl
            : null;
        const role =
          typeof person?.character === "string" ? person.character : "";
        return {
          key: `cast-${i}-${String(person?.staffId || name)}`,
          name,
          avatar,
          role,
        };
      })
      .filter(Boolean)
      .slice(0, 16);
  }, [meta.top_cast]);

  const reviews = useMemo(
    () =>
      (Array.isArray(meta.user_reviews) ? meta.user_reviews : [])
        .filter((r) => typeof r?.content === "string" && r.content.trim())
        .map((r) => ({
          ...r,
          content: r.content.trim(),
        }))
        // Prefer shorter, readable comments first
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

  return (
    <article className={styles.detail}>
      <div className={styles.top}>
        {meta.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meta.poster} alt="" className={styles.poster} />
        ) : (
          <div className={styles.posterEmpty} aria-hidden />
        )}
        <div className={styles.copy}>
          <h1>{meta.title || slug}</h1>
          {metaBits.length ? (
            <p className={styles.meta}>{metaBits.join(" · ")}</p>
          ) : null}
          {meta.imdb_rating ? (
            <p className={styles.rating}>
              <span className={styles.star} aria-hidden>
                ★
              </span>
              {meta.imdb_rating}
              <span className={styles.ratingLabel}>IMDb</span>
            </p>
          ) : null}

          {genres.length ? (
            <div className={styles.chips}>
              {genres.map((g) => (
                <span key={g} className={styles.chip}>
                  {g}
                </span>
              ))}
            </div>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={`play-btn ${styles.playBtn}`}
              disabled={!subjectId || pending}
              aria-busy={pending || undefined}
              onClick={() => goPlay()}
            >
              {pending ? (
                <BtnSpinner />
              ) : isSeries ? (
                `Play S${selectedSe}E${selectedEp}`
              ) : (
                "Play"
              )}
            </button>
            {!subjectId ? (
              <span className={styles.warn}>Playback isn’t available</span>
            ) : null}
          </div>
        </div>
      </div>

      {isSeries ? (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Episodes</h2>
          <div className={styles.seasonBar}>
            <label htmlFor="season-select">Season</label>
            <select
              id="season-select"
              value={selectedSe}
              onChange={(e) => {
                const se = e.target.value;
                setSelectedSe(se);
                const season =
                  seasons.find((s) => String(s.season) === se) || seasons[0];
                setSelectedEp(String(season?.episodes?.[0]?.ep || 1));
              }}
            >
              {seasons.map((s) => (
                <option key={s.season} value={s.season}>
                  Season {s.season} (
                  {s.episode_count || s.episodes?.length || 0} eps)
                </option>
              ))}
            </select>
          </div>
          <div className={styles.episodes}>
            {(activeSeason?.episodes || []).slice(0, 100).map((ep) => {
              const active =
                String(ep.se) === String(selectedSe) &&
                String(ep.ep) === String(selectedEp);
              const loadingThis = pending && active;
              return (
                <button
                  key={`${ep.se}-${ep.ep}`}
                  type="button"
                  className={active ? styles.epActive : undefined}
                  disabled={pending}
                  aria-busy={loadingThis || undefined}
                  onClick={() => {
                    setSelectedSe(String(ep.se));
                    setSelectedEp(String(ep.ep));
                    goPlay(ep.se, ep.ep);
                  }}
                >
                  {loadingThis ? <BtnSpinner /> : `Ep ${ep.ep}`}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Overview</h2>
        <p className={styles.desc}>
          {meta.description || "No description available."}
        </p>
      </section>

      {castPeople.length ? (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Cast</h2>
          <div className={styles.castRow}>
            {castPeople.map((person) => (
              <div key={person.key} className={styles.castCard}>
                {person.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={person.avatar} alt="" className={styles.avatar} />
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
        </section>
      ) : null}

      <section className={styles.block}>
        <div className={styles.reviewsHead}>
          <h2 className={styles.blockTitle}>Reviews</h2>
          {reviews.length ? (
            <span className={styles.reviewsCount}>{reviews.length}</span>
          ) : null}
        </div>
        {reviews.length ? (
          <div className={styles.reviews}>
            {reviews.map((r, i) => {
              const key = `${r.user || "anon"}-${i}`;
              const name = r.user || "Anonymous";
              const initial = name.slice(0, 1).toUpperCase();
              const long = r.content.length > 160;
              const open = expandedReviews.has(key);
              const text =
                long && !open ? `${r.content.slice(0, 160).trim()}…` : r.content;

              return (
                <article key={key} className={styles.review}>
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
                      className={styles.reviewMore}
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
    </article>
  );
}
