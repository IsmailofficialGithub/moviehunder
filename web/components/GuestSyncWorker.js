"use client";

import { useEffect } from "react";
import { useAuth } from "../components/AuthProvider";
import { syncGuestHistoryToServer } from "../lib/guestHistory";

export default function GuestSyncWorker() {
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;

    // Periodically attempt to sync any remaining guest history to the server
    // This is useful in case the initial hydration sync failed (e.g., offline)
    const interval = setInterval(() => {
      syncGuestHistoryToServer().catch(() => {});
    }, 60000);

    const handleBeforeUnload = () => {
      syncGuestHistoryToServer().catch(() => {});
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isSignedIn]);

  return null;
}
