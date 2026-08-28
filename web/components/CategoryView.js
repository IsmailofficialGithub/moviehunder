import CatalogRows from "./CatalogRows";
import EmptyState from "./EmptyState";
import TitleGrid from "./TitleGrid";
import BannerAd468x60 from "./ads/BannerAd468x60";
import NativeBannerAd from "./ads/NativeBannerAd";

export default function CategoryView({ title, data, error }) {
  if (error) {
    return (
      <main className="page">
        <EmptyState title="No items found" hint="This section couldn’t load right now." />
      </main>
    );
  }

  if (data?.sections) {
    return (
      <main className="page">
        <BannerAd468x60 />
        <CatalogRows sections={data.sections} showHero={false} />
        <NativeBannerAd />
      </main>
    );
  }

  const movies = data?.movies || [];
  if (!movies.length) {
    return (
      <main className="page">
        <EmptyState title="No items found" hint={`Nothing in ${title} yet.`} />
      </main>
    );
  }

  return (
    <main className="page">
      <BannerAd468x60 />
      <TitleGrid title={title} movies={movies} />
      <NativeBannerAd />
    </main>
  );
}
