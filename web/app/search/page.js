import EmptyState from "../../components/EmptyState";
import TitleGrid from "../../components/TitleGrid";
import { searchTitles } from "../../lib/api";
import {
  alreadyHasHindiResults,
  mergeWithHindiVariants,
} from "../../lib/searchEnrich";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }) {
  const q = (await searchParams)?.q || "";
  return { title: q ? `Search: ${q}` : "Search" };
}

export default async function SearchPage({ searchParams }) {
  const q = ((await searchParams)?.q || "").trim();
  if (!q) {
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

  try {
    const data = await searchTitles(q);
    let movies = data.movies || [];
    const alreadyHindiQuery = /\bhindi\b|\bdub(bed)?\b/i.test(q);

    // Merge Hindi dub catalog entries next to English matches (same as mobile API).
    if (!alreadyHindiQuery && !alreadyHasHindiResults(movies)) {
      try {
        const hindiData = await searchTitles(`${q} hindi`);
        movies = movies.length
          ? mergeWithHindiVariants(movies, hindiData.movies || [])
          : hindiData.movies || [];
      } catch {
        /* keep primary */
      }
    } else if (!alreadyHindiQuery && alreadyHasHindiResults(movies)) {
      // API already merged — ensure badge for UI
      movies = movies.map((m) =>
        isHindiLike(m) && !m.badge
          ? { ...m, badge: "Hindi", dub_lang: m.dub_lang || "hi" }
          : m
      );
    }

    if (!movies.length) {
      return (
        <main className="page">
          <EmptyState query={q} />
        </main>
      );
    }
    return (
      <main className="page">
        <TitleGrid title={`Results for "${q}"`} movies={movies} />
      </main>
    );
  } catch {
    return (
      <main className="page">
        <EmptyState query={q} />
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
