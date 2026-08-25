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
  { href: "/settings", label: "Settings", route: "settings" },
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

  return (
    <header className={styles.topbar}>
      <div className={styles.topRow}>
        <Link className={styles.brand} href="/" aria-label="MovieHunter home">
          <Image
            src="/brand/logo-symbol.png"
            alt=""
            width={36}
            height={36}
            className={styles.brandLogo}
            priority
          />
          <span className={styles.brandText}>
            Movie<span className={styles.brandAccent}>Hunter</span>
          </span>
        </Link>

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

        <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`}>
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

        <form
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault();
            goSearch();
          }}
          ref={wrapRef}
        >
          <div className={styles.searchWrap}>
            <input
              type="search"
              placeholder="Search movies, series..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              disabled={pending}
              aria-autocomplete="list"
            />
            {open && suggestions.length > 0 ? (
              <ul className={styles.suggest}>
                {suggestions.map((word) => (
                  <li key={word}>
                    <button
                      type="button"
                      onClick={() => goSearch(word)}
                      disabled={pending}
                    >
                      {word}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? <BtnSpinner /> : "Go"}
          </button>
        </form>
      </div>
    </header>
  );
}
