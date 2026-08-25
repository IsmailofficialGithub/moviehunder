import CategoryView from "../../components/CategoryView";
import { getAnimation } from "../../lib/api";
import { friendlyPageError } from "../../lib/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Animation · Flick" };

export default async function AnimationPage() {
  try {
    const data = await getAnimation();
    return <CategoryView title="Animation" data={data} />;
  } catch (err) {
    return <CategoryView title="Animation" error={friendlyPageError(err)} />;
  }
}
