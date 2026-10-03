import CategoryView from "../../components/CategoryView";
import { getTvSeries } from "../../lib/api";
import { friendlyPageError } from "../../lib/errors";

export const revalidate = 300;

export const metadata = {
  title: "Watch TV Series & Shows Online Free — Full Episodes",
  description:
    "Binge popular TV series, web series, Korean dramas, and Hindi dubbed seasons online free on Offstream (offstream.co).",
  alternates: {
    canonical: "https://offstream.co/tv-series",
  },
  openGraph: {
    title: "Watch TV Series & Shows Online Free | Offstream",
    description: "Stream full seasons and episodes of top TV series ads-free on Offstream (offstream.co).",
    url: "https://offstream.co/tv-series",
    siteName: "Offstream",
  },
};

export default async function TvSeriesPage() {
  try {
    const data = await getTvSeries();
    return <CategoryView title="TV Series" data={data} />;
  } catch (err) {
    return <CategoryView title="TV Series" error={friendlyPageError(err)} />;
  }
}
