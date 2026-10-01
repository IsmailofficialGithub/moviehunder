"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import StreamPlayer from "../../components/StreamPlayer";
import { getEpisodes } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { addHistoryItem } from "../../lib/guestHistory";
import styles from "./play.module.css";

function flattenEpisodes(seasons = []) {
  const flat = [];
  for (const s of seasons) {
    const seasonNum = s.season ?? s.se;
    for (const e of s.episodes || []) {
      flat.push({
        se: String(e.se ?? seasonNum ?? 1),
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

  let subjectId = params.get("subjectId") || params.get("id") || "";
  let detailPath = params.get("detail_path") || "";

  if (!subjectId && detailPath) subjectId = detailPath;
  if (!detailPath && subjectId) detailPath = subjectId;

  const se = params.get("se") || "0";
  const ep = params.get("ep") || "0";
  let title = params.get("title") || "";
  let poster = params.get("poster") || "";
  const initialTime = Number(params.get("t") || params.get("start") || params.get("position") || 0);

  if (subjectId && typeof window !== "undefined") {
    try {
      const meta = JSON.parse(localStorage.getItem(`history_meta_${subjectId}`) || "{}");
      if (!detailPath && meta.detailPath) detailPath = meta.detailPath;
      if (!title && meta.title) title = meta.title;
      if (!poster && meta.poster) poster = meta.poster;
    } catch {}
  }

  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn === false && subjectId) {
      addHistoryItem(subjectId, { detailPath, title, poster, se, ep });
    }
  }, [isSignedIn, subjectId, detailPath, title, poster, se, ep]);

  if (!detailPath && subjectId) {
    detailPath = subjectId;
  }
  if (!subjectId && detailPath) {
    subjectId = detailPath;
  }

  const isSeries = Number(se) > 0 || Number(ep) > 0;
  const [episodeList, setEpisodeList] = useState(null);

  useEffect(() => {
    if (!detailPath || !isSeries) {
      setEpisodeList([]);
      return;
    }
    let cancelled = false;
    setEpisodeList(null);
    getEpisodes(detailPath)
      .then((data) => {
        if (cancelled) return;
        setEpisodeList(flattenEpisodes(data.seasons || []));
      })
      .catch(() => {
        if (!cancelled) setEpisodeList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [detailPath, isSeries]);

  const { prevEpisode, nextEpisode } = useMemo(() => {
    if (!isSeries || !episodeList?.length) {
      return { prevEpisode: null, nextEpisode: null };
    }
    const idx = episodeList.findIndex(
      (item) => item.se === String(se) && item.ep === String(ep)
    );
    if (idx < 0) return { prevEpisode: null, nextEpisode: null };
    return {
      prevEpisode: idx > 0 ? episodeList[idx - 1] : null,
      nextEpisode:
        idx < episodeList.length - 1 ? episodeList[idx + 1] : null,
    };
  }, [episodeList, se, ep, isSeries]);

  const goTo = (target) => {
    if (!target) return;
    router.push(
      `/play?${playQuery({
        subjectId,
        detailPath,
        se: target.se,
        ep: target.ep,
        title,
      })}`
    );
  };

  const backHref = detailPath
    ? `/title/${encodeURIComponent(detailPath)}`
    : "/";

  return (
    <main className={styles.main}>
      <Link className={styles.back} href={backHref}>
        ← Back to details
      </Link>
      {!subjectId || !detailPath ? (
        <p className="error-text">
          Open a title from the catalog, then tap Play.
        </p>
      ) : (
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
        />
      )}
    </main>
  );
}
