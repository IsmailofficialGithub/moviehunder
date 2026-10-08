"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./HomeSeoSection.module.css";

const FAQS = [
  {
    q: "Where can I watch free movies and TV shows online?",
    a: "You can watch free movies and TV shows online right here on Offstream (offstream.co). We offer a massive catalog of full movies, episodic television series, anime, and dramas available to stream in HD without registration or subscription fees.",
  },
  {
    q: "How can I stream free full movies online without paying?",
    a: "Offstream provides free movies to stream across all popular genres including Action, Drama, Comedy, Sci-Fi, Horror, and Romance. Simply select any movie title and start streaming full movies online instantly in HD quality.",
  },
  {
    q: "What makes Offstream one of the best free movie streaming sites in 2026?",
    a: "Offstream delivers high-speed playback, zero subscription paywalls, multi-server redundancy, Hindi dubbed cinema, and synchronized subtitles, making it one of the top free online movie streaming platforms in 2026.",
  },
  {
    q: "Does Offstream offer Hindi dubbed cinema and dual-audio titles?",
    a: "Yes. Offstream features a dedicated collection of Hindi dubbed Hollywood blockbusters, Bollywood releases, South Indian action hits, and Asian dramas with synchronized multi-language subtitles.",
  },
  {
    q: "Can I watch free movies on mobile and Smart TVs?",
    a: "Yes. Offstream is fully responsive and optimized for mobile browsers, Smart TVs, desktop, and tablets, with an official MovieHunter Android app available for fast mobile streaming.",
  },
];

export default function HomeSeoSection() {
  const [openIndex, setOpenIndex] = useState(0);

  const toggleFaq = (idx) => {
    setOpenIndex(openIndex === idx ? -1 : idx);
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <section className={styles.seoWrap} aria-label="About Offstream">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className={styles.header}>
        <h1 className={styles.mainTitle}>
          Watch Free Movies and TV Shows Online | Offstream
        </h1>
        <p className={styles.introText}>
          Welcome to <strong>Offstream</strong> (offstream.co) — one of the top free online movie streaming sites in 2026. Discover thousands of free movies to stream, watch free full movies online, and stream trending TV shows in ultra HD with zero subscription fees. Whether you want to watch free movies online, explore fresh movies to watch online for free, or enjoy Hollywood, Bollywood, and Hindi dubbed releases, Offstream delivers an uninterrupted streaming experience.
        </p>
      </div>

      <div className={styles.featuresGrid}>
        <div className={styles.featureCard}>
          <span className={styles.featureIcon} aria-hidden>🍿</span>
          <h2 className={styles.featureTitle}>Free HD Streaming</h2>
          <p className={styles.featureDesc}>
            Stream complete feature films and full episodic seasons without subscription paywalls or mandatory account signups.
          </p>
        </div>

        <div className={styles.featureCard}>
          <span className={styles.featureIcon} aria-hidden>⚡</span>
          <h2 className={styles.featureTitle}>Lightning Playback</h2>
          <p className={styles.featureDesc}>
            High-speed video delivery with adaptive quality options, multi-server redundancy, and instant timestamp resume.
          </p>
        </div>

        <div className={styles.featureCard}>
          <span className={styles.featureIcon} aria-hidden>🌐</span>
          <h2 className={styles.featureTitle}>Hindi Dubbed &amp; Subtitles</h2>
          <p className={styles.featureDesc}>
            Explore thousands of Hindi dubbed movies and regional Asian cinema with multi-language subtitle tracks.
          </p>
        </div>

        <div className={styles.featureCard}>
          <span className={styles.featureIcon} aria-hidden>📱</span>
          <h2 className={styles.featureTitle}>Cross-Device Experience</h2>
          <p className={styles.featureDesc}>
            Enjoy responsive streaming on mobile, desktop, tablet, and the official MovieHunter Android app.
          </p>
        </div>
      </div>

      <div className={styles.faqSection}>
        <h2 className={styles.faqHeading}>Frequently Asked Questions</h2>
        <div className={styles.faqList}>
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={i} className={styles.faqItem}>
                <button
                  type="button"
                  className={styles.faqQuestion}
                  onClick={() => toggleFaq(i)}
                  aria-expanded={isOpen}
                >
                  <span>{faq.q}</span>
                  <span
                    className={`${styles.faqArrow} ${isOpen ? styles.faqArrowOpen : ""}`}
                    aria-hidden
                  >
                    ▼
                  </span>
                </button>
                {isOpen ? (
                  <p className={styles.faqAnswer}>{faq.a}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <nav className={styles.browseLinks} aria-label="Quick Hubs">
        <span>Explore Offstream:</span>
        <Link href="/movies" className={styles.pillLink}>Free Movies</Link>
        <Link href="/tv-series" className={styles.pillLink}>TV Series</Link>
        <Link href="/animation" className={styles.pillLink}>Anime &amp; Animation</Link>
        <Link href="/ranking" className={styles.pillLink}>Top Ranked</Link>
        <Link href="/songs" className={styles.pillLink}>Music &amp; Songs</Link>
        <Link href="/sitemap" className={styles.pillLink}>Content Directory</Link>
      </nav>
    </section>
  );
}
