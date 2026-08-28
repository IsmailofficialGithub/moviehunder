import CategoryView from "../../components/CategoryView";
import { getMovies } from "../../lib/api";
import { friendlyPageError } from "../../lib/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Movies · Flick" };

export default async function MoviesPage() {
  try {
    const data = await getMovies();
    return <CategoryView title="Movies" data={data} />;
  } catch (err) {
    return <CategoryView title="Movies" error={friendlyPageError(err)} />;
  }
}
