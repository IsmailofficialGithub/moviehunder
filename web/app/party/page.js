import { Suspense } from "react";
import PartyLobbyClient from "./PartyLobbyClient";

export const metadata = {
  title: "Watch parties · Offstream",
  robots: { index: false, follow: false },
};

export default function PartyLobbyPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <PartyLobbyClient />
    </Suspense>
  );
}
