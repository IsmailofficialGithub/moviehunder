import { Suspense } from "react";
import PlayClient from "./PlayClient";

export const metadata = {
  title: "Play",
};

export default function PlayPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading player…</main>}>
      <PlayClient />
    </Suspense>
  );
}
