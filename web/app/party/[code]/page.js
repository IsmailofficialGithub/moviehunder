import { Suspense } from "react";
import PartyRoomClient from "./PartyRoomClient";

export const metadata = {
  title: "Watch party · Offstream",
  robots: { index: false, follow: false },
};

export default function PartyRoomPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Joining the party…</main>}>
      <PartyRoomClient />
    </Suspense>
  );
}
