import Link from "next/link";
import { Home, Compass, Search, Film } from "lucide-react";
import styles from "./not-found.module.css";

export const metadata = {
  title: "Page Not Found (404)",
  description: "The page or title you are looking for could not be found.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <main className={styles.container}>
      <div className={styles.glowBackdrop} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.badge}>
          <Film size={12} />
          <span>Error 404</span>
        </div>

        <h1 className={styles.code}>404</h1>
        <h2 className={styles.title}>Lost in the Stream?</h2>
        <p className={styles.desc}>
          The movie, series, or page you were looking for doesn&apos;t exist, was
          removed, or has been relocated to another address.
        </p>

        <div className={styles.actions}>
          <Link href="/" className={styles.primaryBtn}>
            <Home size={16} />
            <span>Back to Home</span>
          </Link>
          <Link href="/search" className={styles.secondaryBtn}>
            <Search size={16} />
            <span>Search Catalog</span>
          </Link>
          <Link href="/movies" className={styles.secondaryBtn}>
            <Compass size={16} />
            <span>Browse Movies</span>
          </Link>
        </div>

        <div className={styles.quickNav}>
          <span className={styles.quickLabel}>Popular Categories</span>
          <div className={styles.quickLinks}>
            <Link href="/movies" className={styles.quickLink}>
              Movies
            </Link>
            <Link href="/tv-series" className={styles.quickLink}>
              TV Series
            </Link>
            <Link href="/animation" className={styles.quickLink}>
              Anime & Animation
            </Link>
            <Link href="/ranking" className={styles.quickLink}>
              Top Ranking
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
