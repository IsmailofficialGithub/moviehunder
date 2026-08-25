import CategoryView from "../../components/CategoryView";
import { getRanking } from "../../lib/api";
import { friendlyPageError } from "../../lib/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ranking · Flick" };

export default async function RankingPage() {
  try {
    const data = await getRanking();
    return <CategoryView title="Ranking" data={data} />;
  } catch (err) {
    return <CategoryView title="Ranking" error={friendlyPageError(err)} />;
  }
}
