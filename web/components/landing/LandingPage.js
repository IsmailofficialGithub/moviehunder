"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getHome, getPlans, startOnboarding } from "../../lib/api";
import FaqAccordion from "./FaqAccordion";
import LazyPoster from "../LazyPoster";
import styles from "./LandingPage.module.css";

const FALLBACK_SHOWCASE = [
  {
    slug: "dhurandhar-the-revenge-g840HwnahE8",
    name: "Dhurandhar: The Revenge",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/06/2a9f78d2b295cf75d5a1716a744de8ff.jpg",
    year: "2026",
    rating: "8.2",
    badge: "Hindi Dubbed",
  },
  {
    slug: "coyote-vs-acme-EizvH4xqnd9",
    name: "Coyote vs. Acme",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/08/8678a90e88a0c592a5632f9c0fc8ddae.jpg",
    year: "2026",
    rating: "7.6",
    badge: "Dual Audio",
  },
  {
    slug: "the-ordinary-jackpot-ejKw9jdwAB6",
    name: "The Ordinary Jackpot",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/22/7649540bb8da7cd69978dd16bddef069.jpg",
    year: "2026",
    rating: "7.9",
    badge: "HD",
  },
  {
    slug: "day-off-2-ivrbOr1eQ09",
    name: "Day Off 2",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/07/01/9939b0d3e7d916e8bb9bcb7c9837a9c0.jpg",
    year: "2026",
    rating: "7.0",
    badge: "Action",
  },
  {
    slug: "human-cocaine-2dAtsmfUw4a",
    name: "Human Cocaine",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/11/b55243c3d1ea35bfd67dec12a87aad13.jpg",
    year: "2026",
    rating: "6.1",
    badge: "Crime",
  },
  {
    slug: "paw-patrol-the-dino-movie-qN015s0uAF4",
    name: "PAW Patrol: The Dino Movie",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/08/a524654812a5a8f0f8dc9b04cdf25b03.jpg",
    year: "2026",
    rating: "6.1",
    badge: "Animation",
  },
];

const HERO_BACKDROP_POSTERS = [
  {
    slug: "doing-life-EAAt8vDor51",
    name: "Doing Life",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/10/03/722fc7f56bab2fd28e5d95ac210019d0.webp",
  },
  {
    slug: "coven-academy-UQietRFFzK3",
    name: "Coven Academy",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/10/03/902874b08f6d0f9db1d65b58ab92966f-s.png",
  },
  {
    slug: "kill-jackie-s6kGOZV8E54",
    name: "Kill Jackie",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/10/03/cfbd63615f0f255c1135c2c7a83eee49.png",
  },
  {
    slug: "runner-QOMZhgKwwg",
    name: "Runner",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/28/0e35dc8679da7aba8cf1d4e62f802612.webp",
  },
  {
    slug: "blood-legacy-Aau1lZfiH57",
    name: "Blood Legacy Season 2",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/25/d61d99c796db5fcef8d8a767668115d0.png",
  },
  {
    slug: "a-different-world-S5nSQAifJg9",
    name: "A Different World",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/25/abade93fc0eabd7ebfba92fb488b52f8.webp",
  },
  {
    slug: "the-love-hypothesis-8CNfawlQEK8",
    name: "The Love Hypothesis",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/23/cfea48c317b394e757b5185782a70d75.webp",
  },
  {
    slug: "the-fix-U4maQqLbH",
    name: "The Fix",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/18/d03fc02fe897ffdb7b8b4f97477986ea.jpeg",
  },
  {
    slug: "neagley-kgfRKfjK46",
    name: "Neagley",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/16/258db67557b23779312dcad1458b9c0a.webp",
  },
  {
    slug: "mobland-wWHa6Cu6fa5",
    name: "MobLand Seaosn2",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/18/5fb7013fa1189d2ac3ce9d8b1127eb5a.jpeg",
  },
  {
    slug: "the-scandal-mlNU8SlJXV8",
    name: "The Scandal",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/18/816eea724206d8ae6f86778ab903c1fb.webp",
  },
  {
    slug: "paris-has-fallen-MECZzYIddA8",
    name: "Paris Has Fallen",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/23/dc4b3d7a95e7d56fd811f59c880cbad3.webp",
  },
  {
    slug: "lanterns-yrpqwiUJSn9",
    name: "Lanterns",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/08/17/54644d0c2c3709671a35bd0b366915e6.webp",
  },
  {
    slug: "bleach-thousand-year-blood-war-IKoyJ28zSi8",
    name: "Bleach: Thousand-Year Blood War",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/01/b4515dac7fe9fdf8fc461b299a9785df.png",
  },
  {
    slug: "lioness-yDLLAaCaND1",
    name: "Lioness",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/10/02/03390b80d1fe108c7513546c587f9db8.jpg",
  },
  {
    slug: "reacher-e1nw56h5sj4",
    name: "Reacher",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/30/2ada82f2c6c6eb0818608b97a3110281.jpg",
  },
  {
    slug: "swat-exiles-mJV89dPysl5",
    name: "SWAT Exiles",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/21/7f8f5c844960e6e6efd0c5481f7f52bb.jpg",
  },
  {
    slug: "american-horror-story-cE1NdZDUoN7",
    name: "American Horror Story",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/24/33a64a8c5d83773a95516d63a006c555.jpg",
  },
  {
    slug: "beauty-in-black-E6NEe5Ha927",
    name: "Beauty in Black",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/10/04/3f8487494d192c62311033753cb0bc55.jpg",
  },
  {
    slug: "monster-MY4FMlRoAFa",
    name: "Monster",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/10/04/a6124dff149feaab92d6c7e60498e328.jpg",
  },
  {
    slug: "city-of-blood-english-wQ2OI6CHYua",
    name: "City of Blood",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/15/89235d4d94850de617451ef8ee19bc3a.jpg",
  },
  {
    slug: "the-scandal-english-4qe9RAlXnk3",
    name: "The Scandal [English]",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/14/876fa95f0f03ebdfde01df32676be1fd.jpg",
  },
  {
    slug: "a-love-other-than-yours-W77cR5lvfL4",
    name: "A Love Other Than Yours",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/10/03/1b438cec5884144ef7d0a5674b095e2a.jpg",
  },
  {
    slug: "the-gentlemen-efKGpux2bB4",
    name: "The Gentlemen",
    poster_url: "https://pbcdnw.aoneroom.com/image/2026/09/16/fc1841aea1c1572162d5d7317593a37a.jpg",
  },
];

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
  const [activeSections, setActiveSections] = useState(Array.isArray(sections) ? sections : []);
  const [email, setEmail] = useState("");
  const [bottomEmail, setBottomEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [successEmail, setSuccessEmail] = useState("");
  const [error, setError] = useState("");

  // Keep active sections in sync with SSR prop, and fetch client-side if initial prop is empty
  useEffect(() => {
    if (Array.isArray(sections) && sections.length > 0) {
      setActiveSections(sections);
    } else {
      getHome()
        .then((data) => {
          if (Array.isArray(data?.sections) && data.sections.length > 0) {
            setActiveSections(data.sections);
          }
        })
        .catch(() => {});
    }
  }, [sections]);

  // Fetch updated dynamic plan pricing in the background without blocking render
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

  // Extract real movies from sections for the showcase section
  const trendingMovies = useMemo(() => {
    const list = [];
    if (Array.isArray(activeSections)) {
      activeSections.forEach((sec) => {
        if (Array.isArray(sec.movies)) {
          sec.movies.forEach((m) => {
            if (m?.poster_url && !list.some((item) => item.slug === m.slug)) {
              list.push(m);
            }
          });
        }
      });
    }
    return list.length > 0 ? list.slice(0, 12) : FALLBACK_SHOWCASE;
  }, [activeSections]);

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
    return plans.map((p, idx) => {
      const planCode = p.code || p.id || `tier-${idx}`;
      return {
        code: planCode,
        name: p.name || "Plan",
        priceText: p.priceText || (p.price ? `Rs ${p.price.toLocaleString()} / month` : "Rs 250 / month"),
        resolution: p.resolution || "HD",
        screens: p.screens || 1,
        devices: p.devices || (p.screens > 2 ? "All Devices and Smart TVs" : p.screens > 1 ? "TV, Laptop, Mobile" : "Phone and Tablet"),
        isPopular: planCode === "standard",
        isUltimate: planCode === "premium",
        features: Array.isArray(p.features) && p.features.length > 0
          ? p.features
          : [
              "Ads-Free Playback",
              `${p.resolution || "HD"} Quality`,
              `${p.screens || 1} Screen simultaneous`,
              "Cancel Anytime",
            ],
      };
    });
  }, [plans]);

  return (
    <div className={styles.landingWrapper}>
      {/* ── HERO SECTION (Cinema atmosphere with zero-blur poster backdrop) ── */}
      <section className={styles.hero} aria-label="Welcome">
        {/* Dynamic Movie Poster Mosaic Backdrop (Stable, hardware composited, zero CSS blur for 60fps smooth scrolling) */}
        <div className={styles.heroBackdropMosaic} aria-hidden="true">
          <div className={styles.mosaicRow}>
            {HERO_BACKDROP_POSTERS.slice(0, 12).map((m) => (
              <div key={`m1-${m.slug}`} className={styles.mosaicItem}>
                <img src={m.poster_url} alt="" loading="eager" decoding="async" />
              </div>
            ))}
          </div>
          <div className={styles.mosaicRow}>
            {HERO_BACKDROP_POSTERS.slice(12, 24).map((m) => (
              <div key={`m2-${m.slug}`} className={styles.mosaicItem}>
                <img src={m.poster_url} alt="" loading="eager" decoding="async" />
              </div>
            ))}
          </div>
        </div>

        <div className={styles.heroAtmosphere} aria-hidden="true" />

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

          {/* Quick Perks Bar */}
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
                key={item.slug ? `${item.slug}-${idx}` : `trending-${idx}`}
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
          {displayPlans.map((plan, idx) => (
            <div
              key={plan.code ? `${plan.code}-${idx}` : `plan-${idx}`}
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
                {plan.features.map((feat, featIdx) => (
                  <li key={`${plan.code}-feat-${featIdx}`}>
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
                onClick={() => router.push(`/signup/planform?step=2&plan=${encodeURIComponent(plan.code)}`)}
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
