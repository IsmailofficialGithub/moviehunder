import EmptyState from "../../components/EmptyState";
import TitleGrid from "../../components/TitleGrid";
import { searchTitles } from "../../lib/api";

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
    const movies = data.movies || [];
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
