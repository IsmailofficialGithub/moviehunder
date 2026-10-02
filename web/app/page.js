import CatalogRows from "../components/CatalogRows";
import EmptyState from "../components/EmptyState";
import { getHome } from "../lib/api";
import BannerAd468x60 from "../components/ads/BannerAd468x60";
import NativeBannerAd from "../components/ads/NativeBannerAd";

export const revalidate = 300;

export const metadata = {
  title: "Movies Hunder · Free Movies & Series Online | Ads Free Movies, Hindi Dubbed, Hollywood, Bollywood",
  description:
    "Stream thousands of free movies and TV series online on Movies Hunder (offstream.co). Watch Hindi dubbed, Hollywood, Bollywood, anime, and Asian dramas in HD ads-free.",
  alternates: {
    canonical: "https://offstream.co",
  },
};

export default async function HomePage() {
  try {
    const data = await getHome();
    return (
      <main className="page">
        <h1
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            padding: 0,
            margin: "-1px",
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          Movies Hunder — Free Movies &amp; TV Series Online (Ads Free)
        </h1>
        <BannerAd468x60 />
        <CatalogRows sections={data.sections || []} showHero />
        <NativeBannerAd />
      </main>
    );
  } catch {
    return (
      <main className="page">
        <EmptyState
          title="No items found"
          hint="Catalog isn’t available right now. Try again in a moment."
        />
      </main>
    );
  }
}
