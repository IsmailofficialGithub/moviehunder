"use client";

import EmptyState from "./EmptyState";
import SafeSearchMeme from "./SafeSearchMeme";
import TitleGrid from "./TitleGrid";
import {
  filterSafeCatalogItems,
  isSafeSearchBlocked,
  shouldBlockEmptyAdultSearch,
} from "../lib/contentFilter";

/**
 * Client-side safety net for web search.
 * Server already filters; this catches stale RSC payloads / missed client checks.
 */
export default function SearchResultsClient({
  query,
  movies = [],
  serverBlocked = false,
}) {
  const q = String(query || "").trim();
  const bypass = q.startsWith("@open");
  const blocked =
    serverBlocked ||
    (!bypass &&
      (isSafeSearchBlocked(q) ||
        shouldBlockEmptyAdultSearch(
          q,
          movies,
          filterSafeCatalogItems(movies)
        )));

  if (blocked) {
    return <SafeSearchMeme key={`meme-${q}`} />;
  }

  const safeMovies = bypass ? movies : filterSafeCatalogItems(movies);
  if (!safeMovies.length) {
    return <EmptyState query={q} />;
  }

  return <TitleGrid title={`Results for "${q}"`} movies={safeMovies} />;
}
