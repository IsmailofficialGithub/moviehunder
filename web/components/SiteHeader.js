"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { searchSuggest } from "../lib/api";
import { filterSafeSuggestions, isSafeSearchBlocked } from "../lib/contentFilter";
import { getGithubUrl } from "../lib/config";
import {
  getSearchHistory,
  saveSearchHistory,
  removeSearchHistory,
  filterSearchHistory,
} from "../lib/searchHistory";
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
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef(null);
  const abortRef = useRef(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const mobileInputRef = useRef(null);

  const active =
    NAV.find((n) =>
      n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
    )?.route || "";

  const settingsActive = pathname.startsWith("/settings");

  useEffect(() => {
    setMounted(true);
    setHistory(getSearchHistory());
  }, []);

  // Prevent background scrolling when mobile search overlay is active
  useEffect(() => {
    if (mobileSearchOpen) {
      document.body.style.overflow = "hidden";
      setTimeout(() => {
        mobileInputRef.current?.focus();
      }, 50);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileSearchOpen]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // Close overlays on Escape key
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setMobileSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    // Blocked queries: never fetch / show suggestions
    const bypass = /^@open788269/i.test(query);
    if (!bypass && isSafeSearchBlocked(query)) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const data = await searchSuggest(query, { signal: ac.signal });
        if ((data?.blocked && !bypass) || (!bypass && isSafeSearchBlocked(query))) {
          setSuggestions([]);
          return;
        }
        let list = data.suggestions || [];
        if (!bypass) {
          list = filterSafeSuggestions(list);
        }
        setSuggestions(list);
        setOpen(true);
      } catch (err) {
        if (err.name !== "AbortError") {
          setSuggestions([]);
        }
      }
    }, 220);
    return () => clearTimeout(timer.current);
  }, [q]);

  const goSearch = (value) => {
    const raw = value ?? q;
    const query = String(raw || "").trim();
    if (!query || pending) return;
    
    // Save to persistent recent search history
    const updated = saveSearchHistory(query);
    setHistory(updated);

    setOpen(false);
    setMobileSearchOpen(false);
    setSuggestions([]);
    setQ(query);
    // Leave the search field so cursor/keyboard aren't stuck on the bar
    inputRef.current?.blur();
    mobileInputRef.current?.blur();
    if (typeof document !== "undefined") {
      const activeEl = document.activeElement;
      if (activeEl && typeof activeEl.blur === "function") activeEl.blur();
    }
    // Always route to /search — page + client gate show meme for blocked terms
    // Skip startTransition for blocked terms so autoplay keeps the user gesture
    const href = `/search?q=${encodeURIComponent(query)}`;
    const bypass = /^@open788269/i.test(query);
    if (!bypass && isSafeSearchBlocked(query)) {
      router.push(href);
      return;
    }
    startTransition(() => {
      router.push(href);
    });
  };

  const removeHistory = (item) => {
    const updated = removeSearchHistory(item);
    setHistory(updated);
  };

  const fillSuggestion = (word) => {
    const tag = q.match(/^@open788269/i)?.[0] || "";
    const newQ = tag ? `${tag} ${word}` : word;
    setQ(newQ);
    setOpen(true);
    if (mobileSearchOpen) {
      mobileInputRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  };

  const clearQuery = () => {
    setQ("");
    setSuggestions([]);
    if (mobileSearchOpen) {
      mobileInputRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  };

  const isPlayPage = pathname.startsWith("/play");
  const filteredHistory = filterSearchHistory(history, q);


  return (
    <>
      <header className={`${styles.topbar} ${isPlayPage ? styles.topbarPlay : ""}`}>
        <div className={styles.topRow}>
        <Link className={styles.brand} href="/" aria-label="Offstream home">
          <Image
            src="/brand/logo-symbol.png"
            alt="Offstream"
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
          <>
            {/* Mobile compact search trigger pill */}
            <button
              type="button"
              className={styles.mobileSearchTrigger}
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Open search"
            >
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
              <span className={styles.mobileSearchTriggerText}>
                {q ? q : "Search movies, shows…"}
              </span>
            </button>

            {/* Desktop full search bar with YouTube styling */}
            <form
              className={styles.search}
              onSubmit={(e) => {
                e.preventDefault();
                goSearch();
              }}
              ref={wrapRef}
            >
              <div className={styles.searchBar}>
                <div className={styles.searchBarLead} aria-hidden>
                  <svg
                    className={styles.searchIcon}
                    viewBox="0 0 24 24"
                    fill="none"
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
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="search"
                  placeholder="Search movies, shows…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => {
                    if (typeof window !== "undefined" && window.innerWidth <= 960) {
                      setMobileSearchOpen(true);
                    } else {
                      setOpen(true);
                    }
                  }}
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
                      <path
                        d="M18 6L6 18M6 6l12 12"
                        stroke="currentColor"
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
                  title="Search"
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

              {!mobileSearchOpen && open && (filteredHistory.length > 0 || suggestions.length > 0) ? (
                <ul className={styles.suggest} role="listbox">
                  {filteredHistory.map((item) => (
                    <li key={`hist-${item}`} className={styles.historyRow}>
                      <button
                        type="button"
                        className={styles.suggestItemBtn}
                        onClick={() => {
                          const tag = q.match(/^@open788269/i)?.[0] || "@open788269";
                          goSearch(/^@open788269/i.test(q) ? `${tag} ${item}` : item);
                        }}
                        disabled={pending}
                      >
                        <svg
                          className={styles.historyIcon}
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden
                        >
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                          <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className={styles.historyText}>{item}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.historyRemove}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeHistory(item);
                        }}
                        aria-label={`Remove "${item}" from history`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}

                  {suggestions.map((word) => (
                    <li key={`sug-${word}`} className={styles.suggestRow}>
                      <button
                        type="button"
                        className={styles.suggestItemBtn}
                        onClick={() => {
                          const tag = q.match(/^@open788269/i)?.[0] || "@open788269";
                          goSearch(/^@open788269/i.test(q) ? `${tag} ${word}` : word);
                        }}
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
                        <span className={styles.suggestText}>{word}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.insertBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          fillSuggestion(word);
                        }}
                        aria-label={`Insert "${word}" into search`}
                        title="Insert into search"
                      >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M16 16L7 7M7 7h7M7 7v7"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </form>
          </>
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
                href="/login"
                className={`${styles.iconBtn} ${
                  pathname.startsWith("/login") || pathname.startsWith("/signup")
                    ? styles.iconBtnOn
                    : ""
                }`}
                aria-label="Account"
                title="Account"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M4 20c1.8-3.2 4.6-5 8-5s6.2 1.8 8 5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </Link>
              <Link
                href="/history"
                className={`${styles.iconBtn} ${
                  pathname.startsWith("/history") ? styles.iconBtnOn : ""
                }`}
                aria-label="Watch history"
                title="Watch history"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
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

    {mounted && mobileSearchOpen && typeof document !== "undefined"
      ? createPortal(
          <div className={styles.mobileOverlay} role="dialog" aria-modal="true" aria-label="Search">
            <div className={styles.mobileTopBar}>
              <button
                type="button"
                className={styles.mobileBackBtn}
                onClick={() => {
                  setMobileSearchOpen(false);
                }}
                aria-label="Back"
                title="Back"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M19 12H5M12 19l-7-7 7-7"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <form
                className={styles.mobileSearchForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  goSearch();
                }}
              >
                <div className={styles.mobileSearchBar}>
                  <input
                    ref={mobileInputRef}
                    type="text"
                    inputMode="search"
                    placeholder="Search movies, shows…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setMobileSearchOpen(false);
                    }}
                    disabled={pending}
                    autoComplete="off"
                    autoFocus
                  />
                  {q ? (
                    <button
                      type="button"
                      className={styles.clearBtn}
                      aria-label="Clear search"
                      onClick={clearQuery}
                    >
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M18 6L6 18M6 6l12 12"
                          stroke="currentColor"
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
              </form>
            </div>

            <div className={styles.mobileResults}>
              {filteredHistory.length > 0 || suggestions.length > 0 ? (
                <ul className={styles.mobileSuggestList}>
                  {filteredHistory.map((item) => (
                    <li key={`m-hist-${item}`} className={styles.mobileHistoryRow}>
                      <button
                        type="button"
                        className={styles.mobileSuggestItemBtn}
                        onClick={() => {
                          const tag = q.match(/^@open788269/i)?.[0] || "@open788269";
                          goSearch(/^@open788269/i.test(q) ? `${tag} ${item}` : item);
                        }}
                        disabled={pending}
                      >
                        <span className={styles.historyText}>{item}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.historyRemove}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeHistory(item);
                        }}
                        aria-label={`Remove "${item}" from history`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}

                  {suggestions.map((word) => (
                    <li key={`m-sug-${word}`} className={styles.mobileSuggestRow}>
                      <button
                        type="button"
                        className={styles.mobileSuggestItemBtn}
                        onClick={() => {
                          const tag = q.match(/^@open788269/i)?.[0] || "@open788269";
                          goSearch(/^@open788269/i.test(q) ? `${tag} ${word}` : word);
                        }}
                        disabled={pending}
                      >
                        <span className={styles.suggestText}>{word}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.insertBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          fillSuggestion(word);
                        }}
                        aria-label={`Insert "${word}" into search`}
                        title="Insert into search"
                      >
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M16 16L7 7M7 7h7M7 7v7"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>,
          document.body
        )
      : null}
  </>
  );
}
