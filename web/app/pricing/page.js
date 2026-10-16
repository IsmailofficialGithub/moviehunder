"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  Check,
  X,
  CreditCard,
  Smartphone,
  ShieldCheck,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "../../components/AuthProvider";
import styles from "./pricing.module.css";

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn } = useAuth();

  const [billing, setBilling] = useState("annual");
  const [activeTier, setActiveTier] = useState("STANDARD_ADS");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTier = localStorage.getItem("user_tier");
      if (savedTier) setActiveTier(savedTier);
    }
  }, []);

  const plans = [
    {
      id: "free",
      tier: "STANDARD_ADS",
      name: "Free",
      desc: "Great for casual watching with standard catalog access and occasional ads.",
      priceMonthly: "$0",
      priceAnnual: "$0",
      period: "forever",
      featured: false,
      buttonText: "Watch Free Now",
      features: [
        { text: "720p HD Streaming", included: true },
        { text: "1 Active Screen", included: true },
        { text: "Watch Progress Sync across devices", included: true },
        { text: "Ad-Supported Playback", included: true },
        { text: "1080p Full HD & 4K Ultra HD", included: false },
        { text: "VIP Dedicated Fast Servers", included: false },
        { text: "Offline Downloads", included: false },
      ],
    },
    {
      id: "standard",
      tier: "STANDARD",
      name: "Standard",
      desc: "Perfect for everyday viewers wanting full HD and 100% ad-free streaming.",
      priceMonthly: "$6.99",
      priceAnnual: "$5.59",
      annualTotal: "$67.08/yr",
      period: "/ month",
      featured: false,
      buttonText: "Get Standard",
      features: [
        { text: "1080p Full HD Streaming", included: true },
        { text: "2 Devices Simultaneously", included: true },
        { text: "100% Ad-Free Uninterrupted Stream", included: true },
        { text: "Multi-Language Audio & Subtitles", included: true },
        { text: "Priority CDN Streaming Relay", included: true },
        { text: "4K Ultra HD + HDR", included: false },
        { text: "Offline Downloads", included: false },
      ],
    },
    {
      id: "vip",
      tier: "PREMIUM",
      name: "VIP Pass",
      desc: "The ultimate cinematic experience with 4K Ultra HD and VIP servers.",
      priceMonthly: "$11.99",
      priceAnnual: "$9.59",
      annualTotal: "$115.08/yr",
      period: "/ month",
      featured: true,
      ribbon: "Most Popular",
      buttonText: "Upgrade to VIP",
      features: [
        { text: "4K Ultra HD + HDR Streaming", included: true },
        { text: "4 Devices Simultaneously", included: true },
        { text: "100% Ad-Free & Zero Buffering", included: true },
        { text: "VIP Dedicated High-Speed Relays", included: true },
        { text: "Offline Downloads for Mobile", included: true },
        { text: "Multi-profile & Parental PIN Control", included: true },
        { text: "Early Access to New Releases", included: true },
      ],
    },
  ];

  // Auto-open modal if returning from login with ?plan=...
  useEffect(() => {
    const planParam = searchParams?.get("plan");
    const billingParam = searchParams?.get("billing");
    if (billingParam) setBilling(billingParam);

    if (planParam) {
      const match = plans.find((p) => p.id === planParam);
      if (match) {
        setSelectedPlan(match);
      }
    }
  }, [searchParams]);

  const handlePlanSelect = (plan) => {
    if (plan.id === "free") {
      setActiveTier("STANDARD_ADS");
      if (typeof window !== "undefined") {
        localStorage.setItem("user_tier", "STANDARD_ADS");
        localStorage.setItem(
          "mh.plan_quota",
          JSON.stringify({
            tier: "STANDARD_ADS",
            label: "Free",
            maxProfiles: 1,
            maxConcurrentStreams: 1,
            maxQualityHeight: 1080,
            hasAds: true,
          })
        );
        window.dispatchEvent(new CustomEvent("mh:plan:change", { detail: "STANDARD_ADS" }));
      }
      router.push("/");
      return;
    }

    setSelectedPlan(plan);
    setIsSuccess(false);
  };

  const handleConfirmActivation = () => {
    if (!selectedPlan) return;
    setIsProcessing(true);

    const token = typeof window !== "undefined" ? localStorage.getItem("mh.auth.access") : null;
    if (token) {
      fetch("/api/account/tier", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tier: selectedPlan.tier }),
      }).catch(() => {});
    }

    setTimeout(() => {
      setIsProcessing(false);
      setIsSuccess(true);
      setActiveTier(selectedPlan.tier);
      if (typeof window !== "undefined") {
        localStorage.setItem("user_tier", selectedPlan.tier);
        localStorage.setItem(
          "mh.plan_quota",
          JSON.stringify({
            tier: selectedPlan.tier,
            label: selectedPlan.name,
            maxProfiles: selectedPlan.tier === "PREMIUM" ? 5 : 3,
            maxConcurrentStreams: selectedPlan.tier === "PREMIUM" ? 4 : 2,
            maxQualityHeight: selectedPlan.tier === "PREMIUM" ? 2160 : 1080,
            hasAds: false,
          })
        );
        window.dispatchEvent(new CustomEvent("mh:plan:change", { detail: selectedPlan.tier }));
      }
    }, 700);
  };

  const faqs = [
    {
      q: "Can I cancel my subscription anytime?",
      a: "Yes, absolutely. You can cancel your subscription with a single click in your account settings. There are no cancellation fees or long-term commitments.",
    },
    {
      q: "How does the VIP Pass differ from Standard?",
      a: "VIP Pass members get 4K Ultra HD streaming, 4 simultaneous screens, offline downloads on mobile, and access to dedicated high-bandwidth VIP relay servers for instant playback without congestion.",
    },
    {
      q: "Which devices can I watch on?",
      a: "You can watch on modern web browsers (Chrome, Safari, Firefox, Edge), Android and iOS smartphones and tablets, Android TV, Google TV, and Apple TV via AirPlay/Cast.",
    },
    {
      q: "What payment methods are supported?",
      a: "We support major credit/debit cards (Visa, MasterCard, American Express), Google Pay, Apple Pay, and secure local payment gateways.",
    },
  ];

  return (
    <div className={styles.pageWrap}>
      <header className={styles.hero}>
        <div className={styles.badge}>
          <Sparkles size={13} />
          <span>VIP & Premium Access</span>
        </div>
        <h1 className={styles.title}>Simple, Transparent Pricing</h1>
        <p className={styles.subtitle}>
          Stream Hollywood blockbusters, trending series, and anime with pristine
          quality and zero buffering. Cancel anytime.
        </p>
      </header>

      <div className={styles.billingToggleWrap}>
        <button
          type="button"
          className={`${styles.toggleBtn} ${billing === "monthly" ? styles.toggleBtnActive : ""}`}
          onClick={() => setBilling("monthly")}
        >
          Monthly Billing
        </button>
        <button
          type="button"
          className={`${styles.toggleBtn} ${billing === "annual" ? styles.toggleBtnActive : ""}`}
          onClick={() => setBilling("annual")}
        >
          <span>Annual Billing</span>
          <span className={styles.saveBadge}>Save 20%</span>
        </button>
      </div>

      <div className={styles.pricingGrid}>
        {plans.map((plan) => {
          const isCurrent = activeTier === plan.tier;

          return (
            <div
              key={plan.id}
              className={`${styles.planCard} ${plan.featured ? styles.planCardFeatured : ""}`}
            >
              {plan.ribbon && <span className={styles.featuredRibbon}>{plan.ribbon}</span>}

              <div className={styles.planHead}>
                <h2 className={styles.planName}>{plan.name}</h2>
                <p className={styles.planDesc}>{plan.desc}</p>
              </div>

              <div className={styles.priceWrap}>
                <span className={styles.priceAmount}>
                  {billing === "annual" ? plan.priceAnnual : plan.priceMonthly}
                </span>
                <span className={styles.pricePeriod}>{plan.period}</span>
              </div>

              <ul className={styles.featureList}>
                {plan.features.map((feat, idx) => (
                  <li
                    key={idx}
                    className={`${styles.featureItem} ${!feat.included ? styles.featureItemDisabled : ""}`}
                  >
                    {feat.included ? (
                      <Check size={16} className={styles.checkIcon} />
                    ) : (
                      <X size={15} className={styles.featureItemDisabled} />
                    )}
                    <span>{feat.text}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={`${styles.planBtn} ${
                  isCurrent
                    ? styles.planBtnCurrent
                    : plan.featured
                      ? styles.planBtnFeatured
                      : styles.planBtnSecondary
                }`}
                onClick={() => handlePlanSelect(plan)}
                disabled={isCurrent}
              >
                {isCurrent ? (
                  <>
                    <Check size={16} />
                    <span>Current Plan</span>
                  </>
                ) : (
                  <>
                    {plan.name === "VIP Pass" && <Sparkles size={15} />}
                    <span>{plan.buttonText}</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <section className={styles.faqSection}>
        <h2 className={styles.faqTitle}>Frequently Asked Questions</h2>
        <div className={styles.faqGrid}>
          {faqs.map((faq, i) => (
            <div key={i} className={styles.faqCard}>
              <h3 className={styles.faqQuestion}>{faq.q}</h3>
              <p className={styles.faqAnswer}>{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {selectedPlan && (
        <div
          className={styles.modalOverlay}
          onClick={() => !isProcessing && setSelectedPlan(null)}
        >
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.modalCloseBtn}
              onClick={() => setSelectedPlan(null)}
              disabled={isProcessing}
            >
              <X size={18} />
            </button>

            {!isSuccess ? (
              <>
                <h3 className={styles.modalTitle}>Activate {selectedPlan.name}</h3>
                <p className={styles.modalSubtitle}>
                  Instant access to 100% ad-free playback and high-bandwidth servers.
                </p>

                <div className={styles.summaryBox}>
                  <div>
                    <div className={styles.summaryPlanName}>{selectedPlan.name} Plan</div>
                    <div className={styles.summaryBilling}>
                      {billing === "annual" ? "Billed annually" : "Billed monthly"} · Cancel anytime
                    </div>
                  </div>
                  <div className={styles.summaryPrice}>
                    {billing === "annual" ? selectedPlan.priceAnnual : selectedPlan.priceMonthly}
                    <span style={{ fontSize: "12px", color: "#8e8e99", display: "block" }}>
                      / month
                    </span>
                  </div>
                </div>

                <div className={styles.paymentMethodsGroup}>
                  <div className={styles.paymentMethodLabel}>Select Payment Method</div>

                  <div
                    className={`${styles.paymentOption} ${paymentMethod === "card" ? styles.paymentOptionActive : ""}`}
                    onClick={() => setPaymentMethod("card")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <CreditCard size={16} />
                      <span>Credit or Debit Card</span>
                    </div>
                    <div
                      className={`${styles.radioCircle} ${paymentMethod === "card" ? styles.radioCircleActive : ""}`}
                    >
                      {paymentMethod === "card" && <div className={styles.radioDot} />}
                    </div>
                  </div>

                  <div
                    className={`${styles.paymentOption} ${paymentMethod === "google" ? styles.paymentOptionActive : ""}`}
                    onClick={() => setPaymentMethod("google")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Smartphone size={16} />
                      <span>Google Pay / Apple Pay</span>
                    </div>
                    <div
                      className={`${styles.radioCircle} ${paymentMethod === "google" ? styles.radioCircleActive : ""}`}
                    >
                      {paymentMethod === "google" && <div className={styles.radioDot} />}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.confirmBtn}
                  disabled={isProcessing}
                  onClick={handleConfirmActivation}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                      <span>Activating Membership…</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} />
                      <span>Confirm & Activate {selectedPlan.name}</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <div className={styles.successCard}>
                <div className={styles.successIconWrap}>
                  <CheckCircle2 size={32} />
                </div>
                <h3 className={styles.successTitle}>Membership Activated!</h3>
                <p className={styles.successDesc}>
                  Congratulations! Your account is now upgraded to{" "}
                  <strong style={{ color: "#ffffff" }}>{selectedPlan.name}</strong>. Enjoy
                  unlimited, ad-free streaming in maximum resolution.
                </p>

                <button
                  type="button"
                  className={styles.confirmBtn}
                  onClick={() => {
                    setSelectedPlan(null);
                    router.push("/play");
                  }}
                >
                  <span>Start Streaming Now</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<div className={styles.pageWrap} />}>
      <PricingContent />
    </Suspense>
  );
}
