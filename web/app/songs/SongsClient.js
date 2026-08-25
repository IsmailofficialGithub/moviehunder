"use client";

import { useCallback, useEffect, useState } from "react";
import { searchMusic } from "../../lib/api";
import BtnSpinner from "../../components/BtnSpinner";
import styles from "./songs.module.css";

export default function SongsClient() {
  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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

  return (
    <main className={`page ${styles.page}`}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>Music</p>
          <h1>Songs</h1>
          <p className={styles.sub}>Free tracks from Audius — same as the app.</p>
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
            const href = t.external_url || t.permalink || t.url || t.stream_url;
            return (
              <li key={t.id || href || title} className={styles.item}>
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
                {href ? (
                  <a
                    className={styles.listen}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                ) : null}
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
