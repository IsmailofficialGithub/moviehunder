import CatalogRows from "../components/CatalogRows";
import EmptyState from "../components/EmptyState";
import { getHome } from "../lib/api";
import BannerAd468x60 from "../components/ads/BannerAd468x60";
import NativeBannerAd from "../components/ads/NativeBannerAd";
import HomeSeoSection from "../components/HomeSeoSection";

export const revalidate = 300;

export const metadata = {
  title: "Watch Free Movies and TV Shows Online | Offstream",
  description:
    "Watch free movies and TV shows online on Offstream (offstream.co). Stream thousands of free full movies in HD, Hollywood blockbusters, Bollywood releases, and trending series with zero ads.",
  alternates: {
    canonical: "https://offstream.co",
  },
  openGraph: {
    title: "Watch Free Movies and TV Shows Online | Offstream",
    description:
      "Watch free movies and TV shows online on Offstream (offstream.co). Stream thousands of free full movies in HD with zero ads.",
    url: "https://offstream.co",
    siteName: "Offstream",
    type: "website",
  },
};

export default async function HomePage() {
  try {
    const data = await getHome();
    return (
      <main className="page">
        <BannerAd468x60 />
        <CatalogRows sections={data.sections || []} showHero />
        <HomeSeoSection />
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
        <HomeSeoSection />
      </main>
    );
  }
}
