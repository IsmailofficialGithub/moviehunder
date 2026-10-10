"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { googleStartUrl } from "../lib/auth";
import styles from "./GuestSignInPrompt.module.css";

const STORAGE_KEY = "mh.guest_signin_prompt.dismissed_at";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default function GuestSignInPrompt() {
  const { isSignedIn, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || isSignedIn) {
      setOpen(false);
      return;
    }

    if (
      pathname?.startsWith("/login") ||
      pathname?.startsWith("/signup") ||
      pathname?.startsWith("/auth")
    ) {
      setOpen(false);
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const lastDismissed = Number(raw) || 0;
        if (Date.now() - lastDismissed < ONE_DAY_MS) {
          return;
        }
      }

      // Show after a brief delay (1s) so it doesn't flash jarringly on initial load
      const t = setTimeout(() => {
        setOpen(true);
      }, 1000);
      return () => clearTimeout(t);
    } catch {
      /* ignore */
    }
  }, [loading, isSignedIn, pathname]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-signin-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className={styles.modal}>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={dismiss}
          aria-label="Close and skip for 1 day"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className={styles.badgeIcon}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>

        <h2 id="guest-signin-title" className={styles.title}>
          Sign in to Offstream
        </h2>
        <p className={styles.description}>
          Get the most out of your streaming experience with synchronized watch progress.
        </p>

        <ul className={styles.benefitsList}>
          <li className={styles.benefitItem}>
            <svg className={styles.checkIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Resume playback across web &amp; mobile app</span>
          </li>
          <li className={styles.benefitItem}>
            <svg className={styles.checkIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Save watch history &amp; create profiles</span>
          </li>
          <li className={styles.benefitItem}>
            <svg className={styles.checkIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Personalized recommendations &amp; library</span>
          </li>
        </ul>

        <div className={styles.actions}>
          <a
            className={styles.googleBtn}
            href={googleStartUrl({ client: "web" })}
          >
            <svg className={styles.googleIcon} viewBox="0 0 48 48" fill="none">
              <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107" />
              <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00" />
              <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50" />
              <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2" />
            </svg>
            Continue with Google
          </a>

          <Link
            href="/login"
            className={styles.emailBtn}
            onClick={() => setOpen(false)}
          >
            Sign in or create account
          </Link>

          <button
            type="button"
            className={styles.skipBtn}
            onClick={dismiss}
          >
            Skip for now (remind me later)
          </button>
        </div>
      </div>
    </div>
  );
}
