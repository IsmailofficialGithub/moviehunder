"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchSuggest } from "../lib/api";
import BtnSpinner from "./BtnSpinner";
import styles from "./SiteHeader.module.css";

const NAV = [
  { href: "/", label: "Home", route: "home" },
  { href: "/movies", label: "Movies", route: "movies" },
  { href: "/tv-series", label: "TV Series", route: "tv-series" },
  { href: "/animation", label: "Animation", route: "animation" },
  { href: "/ranking", label: "Ranking", route: "ranking" },
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

  const active =
    NAV.find((n) =>
      n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
    )?.route || "";

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
      <Link className={styles.brand} href="/" aria-label="Flick home">
        <span className={styles.brandMark}>F</span>
        <span>Flick</span>
      </Link>
      <nav className={styles.nav}>
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
            placeholder="Search titles..."
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
        <button type="submit" disabled={pending} aria-busy={pending || undefined}>
          {pending ? <BtnSpinner /> : "Search"}
        </button>
      </form>
    </header>
  );
}
