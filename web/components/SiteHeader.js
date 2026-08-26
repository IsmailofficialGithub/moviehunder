"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchSuggest } from "../lib/api";
import { filterSafeSuggestions, isSafeSearchBlocked } from "../lib/contentFilter";
import { getGithubUrl } from "../lib/config";
import { openAppDownloadModal } from "./AppDownloadPrompt";
import ActiveUsers from "./ActiveUsers";
import BtnSpinner from "./BtnSpinner";
import styles from "./SiteHeader.module.css";

const NAV = [
  { href: "/", label: "Home", route: "home" },
  { href: "/movies", label: "Movies", route: "movies" },
  { href: "/tv-series", label: "TV", route: "tv-series" },
  { href: "/animation", label: "Anime", route: "animation" },
  { href: "/ranking", label: "Top", route: "ranking" },
  { href: "/songs", label: "Songs", route: "songs" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef(null);
  const abortRef = useRef(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const active =
    NAV.find((n) =>
      n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
    )?.route || "";

  const settingsActive = pathname.startsWith("/settings");

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    // Blocked queries: never fetch / show suggestions
    if (isSafeSearchBlocked(query)) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const data = await searchSuggest(query, { signal: ac.signal });
        if (data?.blocked || isSafeSearchBlocked(query)) {
          setSuggestions([]);
          setOpen(false);
          return;
        }
        const list = filterSafeSuggestions(data.suggestions || []);
        setSuggestions(list);
        setOpen(list.length > 0);
      } catch (err) {
        if (err.name !== "AbortError") {
          setSuggestions([]);
          setOpen(false);
        }
      }
    }, 220);
    return () => clearTimeout(timer.current);
  }, [q]);

  const goSearch = (value) => {
    const query = (value ?? q).trim();
    if (!query || pending) return;
    setOpen(false);
    setSuggestions([]);
    setQ(query);
    // Leave the search field so cursor/keyboard aren't stuck on the bar
    inputRef.current?.blur();
    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (active && typeof active.blur === "function") active.blur();
    }
    // Always route to /search — page + client gate show meme for blocked terms
    // Skip startTransition for blocked terms so autoplay keeps the user gesture
    const href = `/search?q=${encodeURIComponent(query)}`;
    if (isSafeSearchBlocked(query)) {
      router.push(href);
      return;
    }
    startTransition(() => {
      router.push(href);
    });
  };

  const clearQuery = () => {
    setQ("");
    setSuggestions([]);
    setOpen(false);
  };

  const isPlayPage = pathname.startsWith("/play");

  return (
    <header className={`${styles.topbar} ${isPlayPage ? styles.topbarPlay : ""}`}>
      <div className={styles.topRow}>
        <Link className={styles.brand} href="/" aria-label="MovieHunter home">
          <Image
            src="/brand/logo-symbol.png"
            alt="MovieHunter"
            width={112}
            height={112}
            className={styles.brandLogo}
            priority
          />
        </Link>

        {!isPlayPage ? (
          <div className={styles.live}>
            <ActiveUsers />
          </div>
        ) : null}

        {!isPlayPage ? (
          <nav className={styles.nav} aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={item.route === active ? styles.active : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : (
          <p className={styles.playHint}>Now playing</p>
        )}

        {!isPlayPage ? (
        <form
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault();
            goSearch();
          }}
          ref={wrapRef}
        >
          <div className={styles.searchBar}>
            <svg
              className={styles.searchIcon}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M20 20l-3.5-3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              ref={inputRef}
              type="search"
              placeholder="Search movies, shows…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              disabled={pending}
              aria-autocomplete="list"
              autoComplete="off"
            />
            {q ? (
              <button
                type="button"
                className={styles.clearBtn}
                aria-label="Clear search"
                onClick={clearQuery}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="currentColor"
                    opacity="0.35"
                  />
                  <path
                    d="M9 9l6 6M15 9l-6 6"
                    stroke="#0c0c0e"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
            <button
              type="submit"
              className={styles.searchSubmit}
              disabled={pending}
              aria-label="Search"
              aria-busy={pending || undefined}
            >
              {pending ? (
                <BtnSpinner />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle
                    cx="11"
                    cy="11"
                    r="6.5"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M20 20l-3.2-3.2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          </div>
          {open && suggestions.length > 0 ? (
            <ul className={styles.suggest}>
              {suggestions.map((word) => (
                <li key={word}>
                  <button
                    type="button"
                    onClick={() => goSearch(word)}
                    disabled={pending}
                  >
                    <svg
                      className={styles.suggestIcon}
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                    >
                      <circle
                        cx="11"
                        cy="11"
                        r="7"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <path
                        d="M20 20l-3.5-3.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span>{word}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </form>
        ) : null}

        <div className={styles.actions}>
          {!isPlayPage ? (
            <>
              <a
                href={getGithubUrl()}
                className={`${styles.iconBtn} ${styles.githubBtn}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                title="GitHub"
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.91-1.32 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .26.18.58.69.48A10.05 10.05 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z"
                  />
                </svg>
              </a>
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.downloadBtn}`}
                onClick={() => openAppDownloadModal()}
                aria-label="Download app"
                title="Download app"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect
                    x="7"
                    y="2"
                    width="10"
                    height="20"
                    rx="2.2"
                    stroke="currentColor"
                    strokeWidth="1.75"
                  />
                  <path
                    d="M10 4.25h4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M12 8.2v6.2m0 0l-2.4-2.4M12 14.4l2.4-2.4"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10.5 19.5h3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <span className={styles.downloadLabel}>App</span>
              </button>
              <Link
                href="/settings"
                className={`${styles.iconBtn} ${
                  settingsActive ? styles.iconBtnOn : ""
                }`}
                aria-label="Settings"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.4-2.3.7a7.6 7.6 0 0 0-1.7-1L15 4h-4l-.5 2.1a7.6 7.6 0 0 0-1.7 1l-2.3-.7-2 3.4 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.7a7.6 7.6 0 0 0 1.7 1L11 20h4l.5-2.1a7.6 7.6 0 0 0 1.7-1l2.3.7 2-3.4-2-1.2Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
