import CatalogRows from "./CatalogRows";
import EmptyState from "./EmptyState";
import TitleGrid from "./TitleGrid";
import BannerAd468x60 from "./ads/BannerAd468x60";
import NativeBannerAd from "./ads/NativeBannerAd";
import SubscriptionGate from "./SubscriptionGate";

export default function CategoryView({ title, data, error }) {
  if (error) {
    return (
      <SubscriptionGate>
        <main className="page">
          <EmptyState title="No items found" hint="This section couldn’t load right now." />
        </main>
      </SubscriptionGate>
    );
  }

  if (data?.sections) {
    return (
      <SubscriptionGate>
        <main className="page">
          <BannerAd468x60 />
          <CatalogRows sections={data.sections} showHero={false} />
          <NativeBannerAd />
        </main>
      </SubscriptionGate>
    );
  }

  const movies = data?.movies || [];
  if (!movies.length) {
    return (
      <SubscriptionGate>
        <main className="page">
          <EmptyState title="No items found" hint={`Nothing in ${title} yet.`} />
        </main>
      </SubscriptionGate>
    );
  }

  return (
    <SubscriptionGate>
      <main className="page">
        <BannerAd468x60 />
        <TitleGrid title={title} movies={movies} />
        <NativeBannerAd />
      </main>
    </SubscriptionGate>
  );
}
