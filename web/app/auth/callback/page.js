"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { storeSession, verifyEmail } from "../../../lib/auth";
import { runFullSync } from "../../../lib/sync";
import styles from "../../settings/settings.module.css";
import authStyles from "../../login/auth.module.css";

function CallbackInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();
  const [message, setMessage] = useState("Finishing sign-in…");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const access = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const verify = params.get("verify");

        if (verify) {
          await verifyEmail(verify);
          if (!cancelled) setMessage("Email verified. You can sign in.");
          setTimeout(() => router.replace("/login"), 1200);
          return;
        }

        if (access && refreshToken) {
          storeSession({
            access_token: access,
            refresh_token: refreshToken,
          });
          await refresh();
          runFullSync().catch(() => {});
          if (!cancelled) setMessage("Signed in. Redirecting…");
          setTimeout(() => router.replace("/settings"), 600);
          return;
        }

        if (!cancelled) {
          setError("Missing auth tokens");
          setMessage("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Callback failed");
          setMessage("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, refresh, router]);

  return (
    <main className={`page ${styles.page}`}>
      <header className={styles.head}>
        <h1>Account</h1>
      </header>
      {message ? <p className={authStyles.ok}>{message}</p> : null}
      {error ? <p className={authStyles.error}>{error}</p> : null}
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<main className="page">Loading…</main>}>
      <CallbackInner />
    </Suspense>
  );
}
