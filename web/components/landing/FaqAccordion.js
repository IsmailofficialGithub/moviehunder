"use client";

import { useState } from "react";
import styles from "./FaqAccordion.module.css";

const FAQS = [
  {
    q: "What is OffStream & Movies Hunder?",
    a: "OffStream is a premier streaming service bringing you thousands of movies, TV series, Hindi dubbed blockbusters, Hollywood action, Bollywood releases, and anime in pristine quality without intrusive interruptions.",
  },
  {
    q: "How much does OffStream cost?",
    a: "Watch OffStream on your smartphone, tablet, Smart TV, laptop, or streaming device, all for one fixed monthly fee. Plans start as low as Rs250/month with no extra costs or contracts.",
  },
  {
    q: "Where can I watch?",
    a: "Watch anywhere, anytime. Sign in with your OffStream account to watch instantly on the web at offstream.co from your computer or on any internet-connected device including Smart TVs, phones, tablets, and media players.",
  },
  {
    q: "How do I cancel?",
    a: "OffStream is completely flexible. There are no annoying contracts or hidden commitments. You can easily cancel your account online anytime in just two clicks.",
  },
  {
    q: "What can I watch on OffStream?",
    a: "OffStream has an extensive catalog of feature films, series, documentaries, anime, Hindi dubbed releases, and audio tracks. Stream as much as you want, whenever you want.",
  },
  {
    q: "Is OffStream safe for family and kids?",
    a: "Yes! Family profiles and content filters are built in so kids can enjoy safe, age-appropriate entertainment while parents retain full control.",
  },
];

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState(null);

  const toggle = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className={styles.faqSection} aria-label="Frequently Asked Questions">
      <h2 className={styles.faqHeading}>Frequently Asked Questions</h2>
      <div className={styles.faqList}>
        {FAQS.map((item, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div key={idx} className={styles.faqItem}>
              <button
                type="button"
                className={styles.faqQuestion}
                onClick={() => toggle(idx)}
                aria-expanded={isOpen}
              >
                <span>{item.q}</span>
                <span className={`${styles.faqIcon} ${isOpen ? styles.faqIconOpen : ""}`}>
                  +
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
