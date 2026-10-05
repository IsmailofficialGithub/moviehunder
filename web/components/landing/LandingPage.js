"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPlans, startOnboarding } from "../../lib/api";
import FaqAccordion from "./FaqAccordion";
import LazyPoster from "../LazyPoster";
import styles from "./LandingPage.module.css";

const FALLBACK_PLANS = [
  {
    code: "mobile",
    name: "Mobile",
    priceText: "Rs 250 / month",
    resolution: "480p SD",
    screens: 1,
    devices: "Mobile and Tablet",
    features: ["Ads-Free Playback", "Unlimited Catalog Access", "Cancel Anytime"],
  },
  {
    code: "basic",
    name: "Basic",
    priceText: "Rs 450 / month",
    resolution: "720p HD",
    screens: 1,
    devices: "TV, Laptop, Mobile",
    features: ["Ads-Free Playback", "HD 720p Quality", "Offline Downloads", "Cancel Anytime"],
  },
  {
    code: "standard",
    name: "Standard",
    priceText: "Rs 800 / month",
    resolution: "1080p Full HD",
    screens: 2,
    devices: "TV, Laptop, Mobile, Tablet",
    isPopular: true,
    features: [
      "Ads-Free Playback",
      "Full HD 1080p Quality",
      "2 Simultaneous Streams",
      "Offline Downloads",
      "Multi-Profile Support",
    ],
  },
  {
    code: "premium",
    name: "Premium",
    priceText: "Rs 1,100 / month",
    resolution: "4K Ultra HD and HDR",
    screens: 4,
    devices: "All Devices and Smart TVs",
    isUltimate: true,
    features: [
      "Ads-Free Playback",
      "Cinema 4K Ultra HD and HDR",
      "Dolby Audio Master",
      "4 Simultaneous Streams",
      "Family and Kids Profiles",
    ],
  },
];

export default function LandingPage({ sections = [] }) {
  const router = useRouter();
  const [startingPriceText, setStartingPriceText] = useState("Rs 250 / month");
  const [plans, setPlans] = useState([]);
  const [email, setEmail] = useState("");
  const [bottomEmail, setBottomEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [successEmail, setSuccessEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    getPlans()
      .then((data) => {
        if (!mounted) return;
        if (data?.startingPriceText) {
          setStartingPriceText(data.startingPriceText);
        }
        if (Array.isArray(data?.plans) && data.plans.length > 0) {
          setPlans(data.plans);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Extract real movies from sections
  const { trendingMovies, backdropMovies } = useMemo(() => {
    const list = [];
    if (Array.isArray(sections)) {
      sections.forEach((sec) => {
        if (Array.isArray(sec.movies)) {
          sec.movies.forEach((m) => {
            if (m?.poster_url && !list.some((item) => item.slug === m.slug)) {
              list.push(m);
            }
          });
        }
      });
    }
    return {
      trendingMovies: list.slice(0, 10),
      backdropMovies: list.slice(0, 24),
    };
  }, [sections]);

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

  const displayPlans = useMemo(() => {
    if (!plans.length) return FALLBACK_PLANS;
    return plans.map((p) => ({
      code: p.code,
      name: p.name,
      priceText: `Rs ${p.price?.toLocaleString()} / month`,
      resolution: p.resolution || "HD",
      screens: p.screens || 1,
      devices: p.screens > 2 ? "All Devices and Smart TVs" : p.screens > 1 ? "TV, Laptop, Mobile" : "Phone and Tablet",
      isPopular: p.code === "standard",
      isUltimate: p.code === "premium",
      features: Array.isArray(p.features) && p.features.length > 0
        ? p.features
        : ["Ads-Free Playback", `${p.resolution || "HD"} Quality`, `${p.screens || 1} Screen simultaneous`],
    }));
  }, [plans]);

  return (
    <div className={styles.landingWrapper}>
      {/* ── HERO SECTION ──────────────────────────────────────────────── */}
      <section className={styles.hero} aria-label="Welcome">
        {/* Dynamic Movie Poster Mosaic Backdrop */}
        {backdropMovies.length > 0 && (
          <div className={styles.heroBackdropMosaic} aria-hidden="true">
            <div className={styles.mosaicRow}>
              {backdropMovies.slice(0, 12).map((m, idx) => (
                <div key={`m1-${idx}`} className={styles.mosaicItem}>
                  <img src={m.poster_url} alt="" loading="lazy" />
                </div>
              ))}
            </div>
            <div className={styles.mosaicRow}>
              {backdropMovies.slice(12, 24).map((m, idx) => (
                <div key={`m2-${idx}`} className={styles.mosaicItem}>
                  <img src={m.poster_url} alt="" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.heroOverlay} />

        <div className={styles.heroContent}>
          <div className={styles.brandBadge}>
            <span>OFFSTREAM CINEMA • MOVIES HUNDER OFFICIAL</span>
          </div>

          <h1 className={styles.heroTitle}>
            Unlimited Cinema and TV Series. <br className={styles.breakSm} />
            <span className={styles.heroGradient}>Zero Ad Interruptions.</span>
          </h1>

          <p className={styles.heroSubtitle}>
            Stream premier Hollywood releases, Bollywood blockbusters, Hindi dubbed features, and Asian dramas in crystal-clear 4K HDR.
            Plans start at <strong className={styles.highlightText}>{startingPriceText}</strong>. Cancel anytime with one click.
          </p>

          {/* Quick Perks Bar - Clean text labels, no icons or emojis */}
          <div className={styles.heroPerksBar}>
            <span className={styles.perkChip}>Instant HD Playback</span>
            <span className={styles.perkChip}>100% Ads-Free</span>
            <span className={styles.perkChip}>Hindi and Dual Audio</span>
            <span className={styles.perkChip}>All Devices Supported</span>
            <span className={styles.perkChip}>4K Ultra HD</span>
          </div>

          {/* Email Onboarding Form */}
          {successEmail ? (
            <div className={styles.successCard}>
              <div className={styles.successCardHead}>
                <span>Check your inbox to get started</span>
              </div>
              <p className={styles.successCardText}>
                We sent an instant account setup link to <strong>{successEmail}</strong>.<br />
                Follow the link in your email to select your plan. Link expires in 15 minutes.
              </p>
            </div>
          ) : (
            <form
              className={styles.emailForm}
              onSubmit={(e) => handleSubmit(e, email)}
            >
              <div className={styles.inputContainer}>
                <input
                  type="email"
                  className={styles.emailInput}
                  placeholder="Enter your email to start watching..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  aria-label="Email address"
                />
              </div>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading}
              >
                {loading ? "Sending link..." : "Start Watching"}
              </button>
            </form>
          )}

          {error && <div className={styles.errorMessage}>{error}</div>}
        </div>
      </section>

      {/* ── TRENDING CATALOG PREVIEW SHOWCASE ─────────────────────────── */}
      {trendingMovies.length > 0 && (
        <section className={styles.showcaseSection} aria-label="Trending on OffStream">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTag}>
              <span>TRENDING NOW</span>
            </div>
            <h2 className={styles.sectionTitle}>Included with Your Membership</h2>
            <p className={styles.sectionSubtitle}>
              Stream thousands of cinema releases, binge-worthy series, and multi-audio exclusives immediately after joining.
            </p>
          </div>

          <div className={styles.showcaseScroller}>
            {trendingMovies.map((item, idx) => {
              const isHindi =
                item?.dub_lang === "hi" ||
                /hindi/i.test(String(item?.badge || "")) ||
                /\[\s*hindi\s*\]|\(\s*hindi\s*\)/i.test(String(item?.name || ""));

              return (
                <div
                  key={item.slug || `trending-${idx}`}
                  className={styles.showcaseCard}
                  onClick={() => router.push("/signup/planform?step=2")}
                >
                  <div className={styles.cardPosterWrap}>
                    <LazyPoster
                      src={item.poster_url}
                      alt={item.name || "Movie"}
                      className={styles.showcasePoster}
                    />
                    <div className={styles.cardBadges}>
                      <span className={styles.qualityBadge}>4K HDR</span>
                      {isHindi ? (
                        <span className={styles.hindiBadge}>HINDI DUBBED</span>
                      ) : item.badge ? (
                        <span className={styles.audioBadge}>{String(item.badge).toUpperCase()}</span>
                      ) : null}
                    </div>

                    <div className={styles.cardHoverOverlay}>
                      <span className={styles.overlayPill}>Unlock with Plan</span>
                    </div>
                  </div>

                  <div className={styles.cardMeta}>
                    <h3 className={styles.cardTitle}>{item.name || "Featured Title"}</h3>
                    <div className={styles.cardSub}>
                      {item.year && <span>{item.year}</span>}
                      {item.rating && (
                        <span className={styles.cardRating}>
                          Rating {item.rating}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.showcaseFooter}>
            <Link href="/signup/planform?step=2" className={styles.exploreBtn}>
              Explore All 10,000+ Titles
            </Link>
          </div>
        </section>
      )}

      {/* ── CINEMA FEATURES GRID ──────────────────────────────────────── */}
      <section className={styles.featuresSection} aria-label="Why OffStream">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTag}>
            <span>CINEMA EXCELLENCE</span>
          </div>
          <h2 className={styles.sectionTitle}>Why Movie Lovers Choose OffStream</h2>
          <p className={styles.sectionSubtitle}>
            Designed specifically for film connoisseurs and series viewers who demand pure fidelity without compromises.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureNumber}>01</div>
            <h3 className={styles.featureTitle}>100% Ads-Free Cinema</h3>
            <p className={styles.featureDescription}>
              Never get interrupted by popups, spam redirects, or mid-roll commercials. Experience pure, seamless movie immersion from beginning to end.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureNumber}>02</div>
            <h3 className={styles.featureTitle}>Massive Dual Audio Vault</h3>
            <p className={styles.featureDescription}>
              Watch Hollywood blockbusters, South Indian action hits, Turkish drama, and Anime with studio-grade Hindi dubbing and multi-language audio tracks.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureNumber}>03</div>
            <h3 className={styles.featureTitle}>Ultra HD 4K and Dolby Sound</h3>
            <p className={styles.featureDescription}>
              Theater-grade picture clarity and immersive surround sound optimized for large 4K Smart TVs, cinema projectors, and mobile OLED displays.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureNumber}>04</div>
            <h3 className={styles.featureTitle}>Stream on All Your Screens</h3>
            <p className={styles.featureDescription}>
              Switch effortlessly between Android, iPhone, iPad, Windows, Mac, and Smart TV apps with synchronized watch progress and continue watching.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureNumber}>05</div>
            <h3 className={styles.featureTitle}>Zero-Buffer Edge Streaming</h3>
            <p className={styles.featureDescription}>
              Powered by high-speed global relay nodes that start videos instantaneously without lag, stutter, or annoying buffering circles.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureNumber}>06</div>
            <h3 className={styles.featureTitle}>Profiles and Family Safe Zone</h3>
            <p className={styles.featureDescription}>
              Create personalized profiles for family members with custom avatars, tailored recommendations, and protected spaces for children.
            </p>
          </div>
        </div>
      </section>

      {/* ── PLANS & PRICING PREVIEW ───────────────────────────────────── */}
      <section className={styles.pricingSection} aria-label="Plans and Pricing">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTag}>
            <span>TRANSPARENT PRICING</span>
          </div>
          <h2 className={styles.sectionTitle}>Simple Plans for Every Viewer</h2>
          <p className={styles.sectionSubtitle}>
            Choose the membership that fits you best. No hidden fees, contracts, or commitments. Cancel anytime in one click.
          </p>
        </div>

        <div className={styles.pricingGrid}>
          {displayPlans.map((plan) => (
            <div
              key={plan.code}
              className={`${styles.planCard} ${plan.isPopular ? styles.planPopular : ""} ${
                plan.isUltimate ? styles.planUltimate : ""
              }`}
            >
              {plan.isPopular && <div className={styles.popularBadge}>Most Popular</div>}
              {plan.isUltimate && <div className={styles.ultimateBadge}>Cinema 4K</div>}

              <div className={styles.planHead}>
                <h3 className={styles.planName}>{plan.name}</h3>
                <div className={styles.planPrice}>{plan.priceText}</div>
                <div className={styles.planResBadge}>{plan.resolution}</div>
              </div>

              <div className={styles.planMeta}>
                <div className={styles.planMetaRow}>
                  <span>Simultaneous screens:</span>
                  <strong>{plan.screens} {plan.screens === 1 ? "Screen" : "Screens"}</strong>
                </div>
                <div className={styles.planMetaRow}>
                  <span>Supported devices:</span>
                  <strong>{plan.devices}</strong>
                </div>
              </div>

              <ul className={styles.planFeatures}>
                {plan.features.map((feat, idx) => (
                  <li key={idx}>
                    <span className={styles.bulletDot} />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={`${styles.planBtn} ${
                  plan.isPopular || plan.isUltimate ? styles.planBtnPrimary : styles.planBtnSecondary
                }`}
                onClick={() => router.push(`/signup/planform?step=2&plan=${plan.code}`)}
              >
                Select {plan.name}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ACCORDION ─────────────────────────────────────────────── */}
      <FaqAccordion />

      {/* ── BOTTOM CTA SECTION ────────────────────────────────────────── */}
      <section className={styles.bottomCtaSection}>
        <div className={styles.bottomCtaBox}>
          <div className={styles.bottomCtaHead}>
            <h2 className={styles.bottomTitle}>Ready for Unlimited Entertainment?</h2>
            <p className={styles.bottomSubtitle}>
              Join thousands of viewers enjoying ads-free movies, series, and Hindi dubbed cinema today.
            </p>
          </div>

          {successEmail ? (
            <div className={styles.successCard}>
              <p className={styles.successCardText}>
                Account setup link sent to <strong>{successEmail}</strong>. Check your inbox to get started.
              </p>
            </div>
          ) : (
            <form
              className={styles.emailForm}
              onSubmit={(e) => handleSubmit(e, bottomEmail)}
            >
              <div className={styles.inputContainer}>
                <input
                  type="email"
                  className={styles.emailInput}
                  placeholder="Enter your email to start watching..."
                  value={bottomEmail}
                  onChange={(e) => setBottomEmail(e.target.value)}
                  required
                  aria-label="Email address"
                />
              </div>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading}
              >
                {loading ? "Sending link..." : "Get Started"}
              </button>
            </form>
          )}

          <div className={styles.bottomSignIn}>
            <span>Already have an account? </span>
            <Link href="/login" className={styles.signInLink}>
              Sign In here
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
