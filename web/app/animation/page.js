import CategoryView from "../../components/CategoryView";
import { getAnimation } from "../../lib/api";
import { friendlyPageError } from "../../lib/errors";

export const revalidate = 300;

export const metadata = {
  title: "Watch Anime & Animation Movies Free Online — Sub & Dub",
  description:
    "Stream the best anime series, animated features, and Japanese animations online free in HD with dual audio on Offstream (offstream.co).",
  alternates: {
    canonical: "https://offstream.co/animation",
  },
  openGraph: {
    title: "Watch Anime & Animation Movies Free Online | Offstream",
    description: "Stream top anime series and animation films free on Offstream (offstream.co).",
    url: "https://offstream.co/animation",
    siteName: "Offstream",
  },
};

export default async function AnimationPage() {
  try {
    const data = await getAnimation();
    return <CategoryView title="Animation" data={data} />;
  } catch (err) {
    return <CategoryView title="Animation" error={friendlyPageError(err)} />;
  }
}
