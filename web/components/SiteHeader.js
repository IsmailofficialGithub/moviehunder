"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchSuggest } from "../lib/api";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef(null);
  const abortRef = useRef(null);
  const wrapRef = useRef(null);

  const active =
    NAV.find((n) =>
      n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
    )?.route || "";

  const settingsActive = pathname.startsWith("/settings");

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
    timer.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const data = await searchSuggest(query, { signal: ac.signal });
        setSuggestions(data.suggestions || []);
        setOpen(true);
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
    setQ(query);
    startTransition(() => {
      router.push(`/search?q=${encodeURIComponent(query)}`);
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
          <nav
            className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`}
            aria-label="Primary"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={item.route === active ? styles.active : undefined}
                onClick={() => setMenuOpen(false)}
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
              type="search"
              placeholder="Search movies, shows…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              disabled={pending}
              aria-autocomplete="list"
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
          ) : null}

          {!isPlayPage ? (
          <button
            type="button"
            className={styles.menuBtn}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
