"use client";

import { useState, useEffect } from "react";
import { getPlans, startOnboarding } from "../../lib/api";
import FaqAccordion from "./FaqAccordion";
import styles from "./LandingPage.module.css";

export default function LandingPage() {
  const [startingPriceText, setStartingPriceText] = useState("Rs250/month");
  const [email, setEmail] = useState("");
  const [bottomEmail, setBottomEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [successEmail, setSuccessEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    getPlans()
      .then((data) => {
        if (mounted && data?.startingPriceText) {
          setStartingPriceText(data.startingPriceText);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e, inputEmail) => {
    if (e) e.preventDefault();
    const targetEmail = String(inputEmail || "").trim();
    if (!targetEmail || !targetEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await startOnboarding(targetEmail);
      setSuccessEmail(targetEmail);
      setEmail("");
      setBottomEmail("");
    } catch (err) {
      setError(err.message || "Failed to send link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.landingWrapper}>
      {/* Hero Section */}
      <section className={styles.hero} aria-label="Welcome">
        <div className={styles.heroContent}>
          <div className={styles.priceBadge}>
            Plans start at {startingPriceText}
          </div>
          <h1 className={styles.heroTitle}>
            Unlimited movies, TV shows, and more
          </h1>
          <p className={styles.heroSubtitle}>
            Watch anywhere. Cancel anytime.
          </p>
          <p className={styles.ctaPrompt}>
            Ready to watch? Enter your email to create or restart your membership.
          </p>

          {successEmail ? (
            <div className={styles.successCard}>
              <div className={styles.successCardTitle}>
                <span>✉️ Check your inbox!</span>
              </div>
              <p className={styles.successCardText}>
                We sent an account creation link to <strong>{successEmail}</strong>.<br />
                Tap the link in your email to get started. <em>This link expires in 15 minutes.</em>
              </p>
            </div>
          ) : (
            <form
              className={styles.emailForm}
              onSubmit={(e) => handleSubmit(e, email)}
            >
              <input
                type="email"
                className={styles.emailInput}
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="Email address"
              />
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading}
              >
                {loading ? "Sending..." : "Get Started >"}
              </button>
            </form>
          )}

          {error && <div className={styles.errorMessage}>{error}</div>}
        </div>
      </section>

      {/* Features Grid */}
      <section className={styles.featuresSection} aria-label="Features">
        <h2 className={styles.featuresHeading}>More reasons to join OffStream</h2>
        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>📺</span>
            <h3 className={styles.featureTitle}>Enjoy on your TV</h3>
            <p className={styles.featureDescription}>
              Watch on Smart TVs, PlayStation, Xbox, Chromecast, Apple TV, and more.
            </p>
          </div>

          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>📥</span>
            <h3 className={styles.featureTitle}>Download your shows</h3>
            <p className={styles.featureDescription}>
              Save your favorite movies and series to watch offline whenever you are on the go.
            </p>
          </div>

          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>📱</span>
            <h3 className={styles.featureTitle}>Watch everywhere</h3>
            <p className={styles.featureDescription}>
              Stream unlimited titles on your phone, tablet, laptop, and TV without extra fees.
            </p>
          </div>

          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>✨</span>
            <h3 className={styles.featureTitle}>Profiles for kids & family</h3>
            <p className={styles.featureDescription}>
              Safe family spaces and individual profiles with customizable maturity ratings.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <FaqAccordion />

      {/* Bottom CTA Section */}
      <section className={styles.bottomCtaSection}>
        <p className={styles.ctaPrompt}>
          Ready to watch? Enter your email to create or restart your membership.
        </p>
        {successEmail ? (
          <div className={styles.successCard}>
            <p className={styles.successCardText}>
              Account creation link sent to <strong>{successEmail}</strong> (valid for 15 minutes).
            </p>
          </div>
        ) : (
          <form
            className={styles.emailForm}
            onSubmit={(e) => handleSubmit(e, bottomEmail)}
          >
            <input
              type="email"
              className={styles.emailInput}
              placeholder="Email address"
              value={bottomEmail}
              onChange={(e) => setBottomEmail(e.target.value)}
              required
              aria-label="Email address"
            />
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading}
            >
              {loading ? "Sending..." : "Get Started >"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
