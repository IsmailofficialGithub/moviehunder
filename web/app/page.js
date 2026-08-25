import CatalogRows from "../components/CatalogRows";
import EmptyState from "../components/EmptyState";
import { getHome } from "../lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    const data = await getHome();
    return (
      <main className="page">
        <CatalogRows sections={data.sections || []} showHero />
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
