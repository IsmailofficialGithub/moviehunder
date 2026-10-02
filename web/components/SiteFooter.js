"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  const pathname = usePathname();

  // Hide footer inside fullscreen player
  if (pathname?.startsWith("/play")) {
    return null;
  }

  return (
    <footer className={styles.footer} role="contentinfo">
      <div className={styles.inner}>
        <div className={styles.topSection}>
          <div className={styles.brandCol}>
            <div className={styles.logoRow}>
              <Image
                src="/brand/logo-symbol.png"
                alt="MovieHunter Logo"
                width={36}
                height={36}
              />
              <span className={styles.brandName}>MovieHunter</span>
            </div>
            <p className={styles.brandDesc}>
              Stream blockbusters, top TV series, anime hits, and trending music tracks anytime.
              Free catalog discovery and entertainment hub.
            </p>
          </div>

          <div className={styles.col}>
            <h3 className={styles.colTitle}>Streaming Hubs</h3>
            <ul className={styles.linkList}>
              <li className={styles.linkItem}><Link href="/movies">Movies</Link></li>
              <li className={styles.linkItem}><Link href="/tv-series">TV Series</Link></li>
              <li className={styles.linkItem}><Link href="/animation">Anime & Animation</Link></li>
              <li className={styles.linkItem}><Link href="/ranking">Top Ranked</Link></li>
              <li className={styles.linkItem}><Link href="/songs">Music & Songs</Link></li>
            </ul>
          </div>

          <div className={styles.col}>
            <h3 className={styles.colTitle}>Genres & Search</h3>
            <ul className={styles.linkList}>
              <li className={styles.linkItem}><Link href="/search?q=Action">Action</Link></li>
              <li className={styles.linkItem}><Link href="/search?q=Drama">Drama</Link></li>
              <li className={styles.linkItem}><Link href="/search?q=Sci-Fi">Sci-Fi & Fantasy</Link></li>
              <li className={styles.linkItem}><Link href="/search?q=Hindi">Hindi Dubbed</Link></li>
              <li className={styles.linkItem}><Link href="/search">Advanced Search</Link></li>
            </ul>
          </div>

          <div className={styles.col}>
            <h3 className={styles.colTitle}>Legal & Directory</h3>
            <ul className={styles.linkList}>
              <li className={styles.linkItem}>
                <Link href="/sitemap" className={styles.sitemapHighlight}>
                  Sitemap & Directory
                </Link>
              </li>
              <li className={styles.linkItem}><Link href="/privacy">Privacy Policy</Link></li>
              <li className={styles.linkItem}><Link href="/terms">Terms of Service</Link></li>
              <li className={styles.linkItem}><Link href="/support">Help & Support</Link></li>
            </ul>
          </div>
        </div>

        <div className={styles.bottomSection}>
          <span>&copy; {new Date().getFullYear()} MovieHunter. All rights reserved.</span>
          <div className={styles.bottomLinks}>
            <Link href="/sitemap">HTML Sitemap</Link>
            <span>&bull;</span>
            <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">XML Sitemap</a>
            <span>&bull;</span>
            <a href="/robots.txt" target="_blank" rel="noopener noreferrer">Robots.txt</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
