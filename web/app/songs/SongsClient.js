"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchMusic } from "../../lib/api";
import BtnSpinner from "../../components/BtnSpinner";
import styles from "./songs.module.css";

function formatMs(ms) {
  const t = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(t / 60);
  const s = String(t % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function SongsClient() {
  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentId, setCurrentId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  const current = useMemo(
    () => tracks.find((t) => String(t.id) === String(currentId)) || null,
    [tracks, currentId]
  );

  const load = useCallback(async (query = "") => {
    setLoading(true);
    setError("");
    try {
      const data = await searchMusic(query, { limit: 30 });
      setTracks(data.tracks || []);
    } catch (err) {
      setTracks([]);
      setError(err.message || "Could not load music");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.currentTime || 0);
    const onMeta = () => setDuration(audio.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      const idx = tracks.findIndex((t) => String(t.id) === String(currentId));
      if (idx >= 0 && idx < tracks.length - 1) {
        playTrack(tracks[idx + 1]);
      }
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, tracks]);

  const playTrack = async (track) => {
    const url = track?.stream_url || track?.preview_url;
    if (!url || !audioRef.current) return;
    const audio = audioRef.current;
    const same = String(track.id) === String(currentId);
    if (same) {
      if (audio.paused) await audio.play().catch(() => {});
      else audio.pause();
      return;
    }
    setCurrentId(track.id);
    setProgress(0);
    setDuration((Number(track.duration_ms) || 0) / 1000);
    audio.src = url;
    audio.load();
    try {
      await audio.play();
    } catch {
      setError("Couldn’t start playback. Try another track.");
    }
  };

  const seek = (e) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const next = Number(e.target.value) || 0;
    audio.currentTime = next;
    setProgress(next);
  };

  return (
    <main className={`page ${styles.page}`}>
      <audio ref={audioRef} preload="metadata" />

      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>Music</p>
          <h1>Songs</h1>
          <p className={styles.sub}>
            Play free tracks in MovieHunter — no redirect to Audius.
          </p>
        </div>
        <form
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault();
            load(q);
          }}
        >
          <input
            type="search"
            placeholder="Search songs or artists..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            {loading ? <BtnSpinner /> : "Search"}
          </button>
        </form>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      {current ? (
        <div className={styles.player}>
          {current.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.image} alt="" className={styles.playerArt} />
          ) : (
            <div className={styles.playerArtFallback}>♪</div>
          )}
          <div className={styles.playerMeta}>
            <strong>{current.name || current.title || "Now playing"}</strong>
            <span>{current.artist || "Unknown artist"}</span>
            <div className={styles.seekRow}>
              <span>{formatMs(progress * 1000)}</span>
              <input
                type="range"
                min={0}
                max={Math.max(1, duration || 1)}
                step={0.5}
                value={Math.min(progress, duration || 0)}
                onChange={seek}
                className={styles.seek}
                aria-label="Seek"
              />
              <span>
                {formatMs((duration || (current.duration_ms || 0) / 1000) * 1000)}
              </span>
            </div>
          </div>
          <button
            type="button"
            className={styles.playerBtn}
            onClick={() => playTrack(current)}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "Pause" : "Play"}
          </button>
        </div>
      ) : null}

      {loading && !tracks.length ? (
        <div className="loader">
          <div className="spinner" />
          <span>Loading tracks…</span>
        </div>
      ) : (
        <ul className={styles.list}>
          {tracks.map((t) => {
            const title = t.name || t.title || "Untitled";
            const artist = t.artist || t.artists?.[0] || "Unknown artist";
            const art = t.image || t.artwork || t.artwork_url;
            const active = String(t.id) === String(currentId);
            const canPlay = Boolean(t.stream_url || t.preview_url);
            return (
              <li
                key={t.id || title}
                className={`${styles.item} ${active ? styles.itemActive : ""}`}
              >
                {art ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={art} alt="" className={styles.art} />
                ) : (
                  <div className={styles.artFallback}>♪</div>
                )}
                <div className={styles.meta}>
                  <strong>{title}</strong>
                  <span>{artist}</span>
                </div>
                <button
                  type="button"
                  className={styles.listen}
                  disabled={!canPlay}
                  onClick={() => playTrack(t)}
                >
                  {!canPlay
                    ? "Unavailable"
                    : active && playing
                      ? "Pause"
                      : active
                        ? "Resume"
                        : "Play"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !error && !tracks.length ? (
        <p className="status">No tracks found. Try another search.</p>
      ) : null}
    </main>
  );
}
