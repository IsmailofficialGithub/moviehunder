import CategoryView from "../../components/CategoryView";
import { getMovies } from "../../lib/api";
import { friendlyPageError } from "../../lib/errors";

export const revalidate = 300;

export const metadata = {
  title: "Free Movies Online — Hollywood, Bollywood & Hindi Dubbed",
  description:
    "Stream thousands of free movies in HD on Offstream (offstream.co). Watch Hollywood blockbusters, Bollywood hits, and Hindi dubbed cinema ads-free.",
  alternates: {
    canonical: "https://offstream.co/movies",
  },
  openGraph: {
    title: "Free Movies Online — Hollywood, Bollywood & Hindi Dubbed | Offstream",
    description: "Stream free movies in HD with zero ads on Offstream (offstream.co).",
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
