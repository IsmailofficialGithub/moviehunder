import CategoryView from "../../components/CategoryView";
import { getMovies } from "../../lib/api";
import { friendlyPageError } from "../../lib/errors";

export const revalidate = 300;

export const metadata = {
  title: "Watch Free Movies Online — Free Movies to Stream | Offstream",
  description:
    "Watch free movies online in HD on Offstream (offstream.co). Stream thousands of free full movies, Hollywood hits, Bollywood cinema, and Hindi dubbed movies ads-free.",
  alternates: {
    canonical: "https://offstream.co/movies",
  },
  openGraph: {
    title: "Watch Free Movies Online — Free Movies to Stream | Offstream",
    description: "Stream free full movies online in HD with zero ads on Offstream.",
    url: "https://offstream.co/movies",
    siteName: "Offstream",
  },
};

export default async function MoviesPage() {
  try {
    const data = await getMovies();
    return <CategoryView title="Movies" data={data} />;
  } catch (err) {
    return <CategoryView title="Movies" error={friendlyPageError(err)} />;
  }
}
