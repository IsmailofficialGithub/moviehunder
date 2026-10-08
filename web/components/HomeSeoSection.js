"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./HomeSeoSection.module.css";

const FAQS = [
  {
    q: "What is Offstream (offstream.co)?",
    a: "Offstream is a free online entertainment platform where you can stream thousands of movies, TV series, anime, and Asian dramas in high definition without subscription fees or registration.",
  },
  {
    q: "Is watching movies on Offstream completely free?",
    a: "Yes. All content across movies, series, animation, and music is 100% free to watch online in full HD quality with no hidden costs.",
  },
  {
    q: "Does Offstream offer Hindi dubbed cinema and dual-audio titles?",
    a: "Yes. Offstream features a dedicated collection of Hindi dubbed Hollywood blockbusters, Bollywood releases, South Indian action hits, and Asian dramas with synchronized multi-language subtitles.",
  },
  {
    q: "Can I download the Offstream / MovieHunter app on mobile?",
    a: "Yes. You can install the official MovieHunter Android app directly onto your phone or tablet for fast, native playback with episode tracking and offline download capabilities.",
  },
  {
    q: "How often is the movie and series catalog updated?",
    a: "Our catalog is refreshed multiple times every day with the latest theatrical releases, trending television episodes, anime broadcasts, and top rankings.",
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
          Offstream — Watch Free Movies &amp; TV Series Online
        </h1>
        <p className={styles.introText}>
          Welcome to <strong>Offstream</strong> (offstream.co), your premier home for streaming free movies and television series online with zero subscription walls. Experience Hollywood blockbusters, Bollywood releases, Hindi dubbed cinema, Korean dramas, anime, and trending TV shows in crisp high-definition video with synchronized multi-language subtitles.
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
