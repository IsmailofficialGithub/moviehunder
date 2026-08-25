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
          <img src={meta.poster} alt="" />
        ) : null}
        <div>
          <h1>{meta.title || slug}</h1>
          <p className={styles.meta}>
            {[
              meta.release_date,
              meta.genre,
              meta.imdb_rating ? `IMDb ${meta.imdb_rating}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className={styles.desc}>
            {meta.description || "No description available."}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className="play-btn"
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

          {isSeries ? (
            <>
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
              <h2 className={styles.epsTitle}>Episodes</h2>
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
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
