import CategoryView from "../../components/CategoryView";
import { getRanking } from "../../lib/api";
import { friendlyPageError } from "../../lib/errors";

export const revalidate = 300;

export const metadata = {
  title: "Top Rated Movies & Series Ranking — Trending Now",
  description:
    "Discover the highest-rated movies, trending series, and most popular releases currently streaming ads-free on Offstream (offstream.co).",
  alternates: {
    canonical: "https://offstream.co/ranking",
  },
  openGraph: {
    title: "Top Rated Movies & Series Ranking | Offstream",
    description: "Discover top-rated and trending movies and TV series streaming on Offstream (offstream.co).",
    url: "https://offstream.co/ranking",
    siteName: "Offstream",
  },
};

export default async function RankingPage() {
  try {
    const data = await getRanking();
    return <CategoryView title="Ranking" data={data} />;
  } catch (err) {
    return <CategoryView title="Ranking" error={friendlyPageError(err)} />;
  }
}
