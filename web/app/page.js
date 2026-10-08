import CatalogRows from "../components/CatalogRows";
import EmptyState from "../components/EmptyState";
import { getHome } from "../lib/api";
import BannerAd468x60 from "../components/ads/BannerAd468x60";
import NativeBannerAd from "../components/ads/NativeBannerAd";
import HomeSeoSection from "../components/HomeSeoSection";

export const revalidate = 300;

export const metadata = {
  title: "Offstream — Watch Free Movies & TV Series Online",
  description:
    "Watch free movies and TV series online on Offstream (offstream.co). Enjoy Hollywood, Bollywood, Hindi dubbed cinema, and Asian dramas in HD with zero ads.",
  alternates: {
    canonical: "https://offstream.co",
  },
  openGraph: {
    title: "Offstream — Watch Free Movies & TV Series Online",
    description:
      "Stream free movies and TV series online on Offstream (offstream.co). Hollywood, Bollywood, and Hindi dubbed cinema in HD.",
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
