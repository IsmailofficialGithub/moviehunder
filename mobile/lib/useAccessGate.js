import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { verifyAccess } from "./access";

const POLL_MS = 12_000;

/**
 * Checks device access on launch, when app returns to foreground,
 * and every ~12s so admin blocks apply without restarting the app.
 */
export function useAccessGate({ enabled = true } = {}) {
  const [access, setAccess] = useState(null);
  const [initialDone, setInitialDone] = useState(false);
  const busyRef = useRef(false);

  const check = useCallback(async ({ silent = false } = {}) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const result = await verifyAccess();
      setAccess(result);
    } catch {
      if (!silent) setAccess({ allowed: true, mode: "error" });
    } finally {
      busyRef.current = false;
      if (!silent) setInitialDone(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    check({ silent: false });

    const timer = setInterval(() => {
      check({ silent: true });
    }, POLL_MS);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check({ silent: true });
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, check]);

  const blocked = access?.allowed === false;
  const allowed = access != null && access.allowed !== false;

  return {
    access,
    blocked,
    allowed,
    /** True only until the first check finishes (after splash). */
    checking: !initialDone,
    recheck: () => check({ silent: false }),
  };
}
