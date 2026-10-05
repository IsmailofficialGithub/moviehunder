"use client";

import { useState } from "react";
import { HelpCircle, ChevronDown } from "lucide-react";
import styles from "./FaqAccordion.module.css";

const FAQS = [
  {
    q: "What makes OffStream & Movies Hunder different from other streaming services?",
    a: "OffStream is built specifically for movie enthusiasts with a massive library of 10,000+ titles featuring 100% ads-free playback, zero commercial breaks, full multi-audio/Hindi dubbed audio options, and cinema-grade 4K Ultra HD streaming.",
  },
  {
    q: "How much does OffStream membership cost?",
    a: "Our plans start from just Rs250/month for Mobile, Rs450/month for Basic, Rs800/month for Standard (Full HD), and Rs1,100/month for Premium 4K Ultra HD. There are zero hidden fees, extra taxes, or long-term contracts.",
  },
  {
    q: "Do you have Hindi Dubbed, Bollywood, and Hollywood titles?",
    a: "Yes! We specialize in Hindi dubbed releases for Hollywood blockbusters, South Indian action hits, Korean dramas, and Anime, alongside thousands of original Bollywood releases with optional English subtitles.",
  },
  {
    q: "Which devices are supported?",
    a: "You can watch on any internet-connected screen: Smart TVs (Samsung, LG, Android TV), Apple TV, FireStick, Android phones & tablets, iPhones & iPads, and any modern web browser on PC, Mac, or Linux.",
  },
  {
    q: "Can I download movies to watch offline?",
    a: "Yes, our Basic, Standard, and Premium plans include offline caching. You can save your favorite shows and movies to watch while flying, commuting, or without internet access.",
  },
  {
    q: "How does cancellation work?",
    a: "You are in complete control. There are no contracts or cancellation penalties. You can easily pause or cancel your subscription online at any time in just two clicks from your Account Settings.",
  },
];

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState(null);

  const toggle = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className={styles.faqSection} aria-label="Frequently Asked Questions">
      <div className={styles.faqHeader}>
        <div className={styles.faqTag}>
          <HelpCircle size={16} color="#bd84db" />
          <span>Got Questions?</span>
        </div>
        <h2 className={styles.faqHeading}>Frequently Asked Questions</h2>
        <p className={styles.faqSub}>Everything you need to know about OffStream &amp; Movies Hunder membership.</p>
      </div>

      <div className={styles.faqList}>
        {FAQS.map((item, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div key={idx} className={`${styles.faqItem} ${isOpen ? styles.faqItemActive : ""}`}>
              <button
                type="button"
                className={styles.faqQuestion}
                onClick={() => toggle(idx)}
                aria-expanded={isOpen}
              >
                <span>{item.q}</span>
                <span className={`${styles.faqIcon} ${isOpen ? styles.faqIconOpen : ""}`}>
                  <ChevronDown size={22} />
                </span>
              </button>
              {isOpen && <div className={styles.faqAnswer}>{item.a}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
