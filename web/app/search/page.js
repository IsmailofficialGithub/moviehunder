import EmptyState from "../../components/EmptyState";
import SearchResultsClient from "../../components/SearchResultsClient";
import { searchTitles } from "../../lib/api";
import {
  checkSafeSearch,
  filterSafeCatalogItems,
  shouldBlockEmptyAdultSearch,
} from "../../lib/contentFilter";
import {
  alreadyHasHindiResults,
  mergeWithHindiVariants,
} from "../../lib/searchEnrich";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ searchParams }) {
  const q = (await searchParams)?.q || "";
  return { title: q ? `Search: ${q}` : "Search" };
}

export default async function SearchPage({ searchParams }) {
  const rawQ = ((await searchParams)?.q || "").trim();
  if (!rawQ) {
    return (
      <main className="page">
        <EmptyState
          title="Search MovieHunter"
          hint="Type a movie or series name in the search bar above."
          actionHref={null}
        />
      </main>
    );
  }

  const bypass = /^@open/i.test(rawQ);
  const q = bypass ? rawQ.replace(/^@open\s*/i, "").trim() : rawQ;

  if (!bypass) {
    const safe = checkSafeSearch(rawQ);
    if (safe.blocked) {
      return (
        <main className="page">
          <SearchResultsClient query={rawQ} movies={[]} serverBlocked />
        </main>
      );
    }
  }

  try {
    const data = await searchTitles(rawQ);
    if (data?.blocked && !bypass) {
      return (
        <main className="page">
          <SearchResultsClient query={rawQ} movies={[]} serverBlocked />
        </main>
      );
    }

    let movies = data?.movies || [];
    const alreadyHindiQuery = /\bhindi\b|\bdub(bed)?\b/i.test(q);

    if (!alreadyHindiQuery && !alreadyHasHindiResults(movies)) {
      try {
        const hindiData = await searchTitles(
          bypass ? (q ? `@open ${q} hindi` : "@open hindi") : `${q} hindi`
        );
        if (!hindiData?.blocked) {
          movies = movies.length
            ? mergeWithHindiVariants(movies, hindiData.movies || [])
            : hindiData.movies || [];
        }
      } catch {
        /* keep primary */
      }
    } else if (!alreadyHindiQuery && alreadyHasHindiResults(movies)) {
      movies = movies.map((m) =>
        isHindiLike(m) && !m.badge
          ? { ...m, badge: "Hindi", dub_lang: m.dub_lang || "hi" }
          : m
      );
    }

    const beforeFilter = movies;
    if (!bypass) {
      movies = filterSafeCatalogItems(movies);

      if (shouldBlockEmptyAdultSearch(q, beforeFilter, movies)) {
        return (
          <main className="page">
            <SearchResultsClient query={rawQ} movies={beforeFilter} serverBlocked />
          </main>
        );
      }
    }

    return (
      <main className="page">
        <SearchResultsClient query={rawQ} movies={movies} />
      </main>
    );
  } catch {
    return (
      <main className="page">
        <EmptyState query={rawQ} />
      </main>
    );
  }
}

function isHindiLike(m) {
  return (
    m?.dub_lang === "hi" ||
    /hindi/i.test(String(m?.badge || "")) ||
    /\[\s*hindi\s*\]|\(\s*hindi\s*\)/i.test(String(m?.name || ""))
  );
}
