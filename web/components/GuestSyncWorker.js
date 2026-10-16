"use client";

import { useEffect } from "react";
import { useAuth } from "../components/AuthProvider";
import { syncGuestHistoryToServer } from "../lib/guestHistory";
import { fetchRemoteWatchlist, mergeGuestWatchlistToServer } from "../lib/watchlist";

export default function GuestSyncWorker() {
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;

    // 1. Initial sync on login / app start
    mergeGuestWatchlistToServer().catch(() => {});
    fetchRemoteWatchlist().catch(() => {});
    syncGuestHistoryToServer().catch(() => {});

    // 2. Periodic background sync (every 60s) for multi-device sync
    const interval = setInterval(() => {
      syncGuestHistoryToServer().catch(() => {});
      fetchRemoteWatchlist().catch(() => {});
    }, 60000);

    // 3. Tab focus / visibility change sync
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchRemoteWatchlist().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // 4. Profile change sync
    const onProfileChange = () => {
      fetchRemoteWatchlist().catch(() => {});
    };
    window.addEventListener("mh:profile:change", onProfileChange);

    const handleBeforeUnload = () => {
      syncGuestHistoryToServer().catch(() => {});
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("mh:profile:change", onProfileChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isSignedIn]);

  return null;
}
