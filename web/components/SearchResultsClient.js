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
  bypass = false,
}) {
  const q = String(query || "").trim();
  const isBypass = bypass || /^@open788269/i.test(q);
  const cleanQ = isBypass ? q.replace(/^@open788269\s*/i, "").trim() : q;
  const blocked =
    !isBypass &&
    (serverBlocked ||
      isSafeSearchBlocked(q) ||
      shouldBlockEmptyAdultSearch(
        q,
        movies,
        filterSafeCatalogItems(movies)
      ));

  if (blocked) {
    return <SafeSearchMeme key={`meme-${q}`} />;
  }

  const safeMovies = isBypass ? movies : filterSafeCatalogItems(movies);
  if (!safeMovies.length) {
    return <EmptyState query={cleanQ || q} />;
  }

  return <TitleGrid title={`Results for "${cleanQ || q}"`} movies={safeMovies} />;
}
