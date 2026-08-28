import CategoryView from "../../components/CategoryView";
import { getTvSeries } from "../../lib/api";
import { friendlyPageError } from "../../lib/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "TV Series · Flick" };

export default async function TvSeriesPage() {
  try {
    const data = await getTvSeries();
    return <CategoryView title="TV Series" data={data} />;
  } catch (err) {
    return <CategoryView title="TV Series" error={friendlyPageError(err)} />;
  }
}
