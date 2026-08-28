import CatalogRows from "../components/CatalogRows";
import EmptyState from "../components/EmptyState";
import { getHome } from "../lib/api";
import BannerAd468x60 from "../components/ads/BannerAd468x60";
import NativeBannerAd from "../components/ads/NativeBannerAd";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    const data = await getHome();
    return (
      <main className="page">
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
