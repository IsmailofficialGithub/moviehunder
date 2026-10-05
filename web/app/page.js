import HomeGateway from "../components/HomeGateway";
import EmptyState from "../components/EmptyState";
import { getHome } from "../lib/api";

export const revalidate = 300;

export const metadata = {
  title: "Offstream — Free Movies & TV Series Online | Movies Hunder",
  description:
    "Stream thousands of free movies and TV series online on Offstream (offstream.co). Watch Hindi dubbed, Hollywood, Bollywood, anime, and Asian dramas in HD with zero ads.",
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
          Offstream — Free Movies &amp; TV Series Online (Movies Hunder)
        </h1>
        <HomeGateway sections={data.sections || []} />
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
