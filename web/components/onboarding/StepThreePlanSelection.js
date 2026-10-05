"use client";

import { useState, useEffect } from "react";
import { getPlans } from "../../lib/api";
import styles from "./StepThreePlanSelection.module.css";

const FALLBACK_PLANS = [
  {
    id: "mobile",
    name: "Mobile",
    price: 250,
    currency: "PKR",
    resolution: "480p",
    quality: "Fair",
    screens: 1,
    downloadDevices: 1,
    spatialAudio: false,
    supportedDevices: ["Mobile phone", "tablet"],
    isPopular: false,
  },
  {
    id: "basic",
    name: "Basic",
    price: 450,
    currency: "PKR",
    resolution: "720p (HD)",
    quality: "Good",
    screens: 1,
    downloadDevices: 1,
    spatialAudio: false,
    supportedDevices: ["TV", "computer", "mobile phone", "tablet"],
    isPopular: false,
  },
  {
    id: "standard",
    name: "Standard",
    price: 800,
    currency: "PKR",
    resolution: "1080p (Full HD)",
    quality: "Great",
    screens: 2,
    downloadDevices: 2,
    spatialAudio: false,
    supportedDevices: ["TV", "computer", "mobile phone", "tablet"],
    isPopular: true,
  },
  {
    id: "premium",
    name: "Premium",
    price: 1100,
    currency: "PKR",
    resolution: "4K (Ultra HD) + HDR",
    quality: "Best",
    screens: 4,
    downloadDevices: 4,
    spatialAudio: true,
    supportedDevices: ["TV", "computer", "mobile phone", "tablet"],
    isPopular: false,
  },
];

export default function StepThreePlanSelection({ onProceed }) {
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [selectedPlanId, setSelectedPlanId] = useState("standard");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getPlans()
      .then((data) => {
        if (mounted && data?.plans && data.plans.length > 0) {
          setPlans(data.plans);
          const popular = data.plans.find((p) => p.isPopular);
          if (popular) {
            setSelectedPlanId(popular.id);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];

  const handleSelect = (planId) => {
    setSelectedPlanId(planId);
  };

  const handleNext = () => {
    if (selectedPlan && onProceed) {
      onProceed(selectedPlan);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.stepIndicator}>STEP 3 OF 3</div>
        <h1 className={styles.title}>Choose the plan that's right for you</h1>
        <div className={styles.bullets}>
          <div className={styles.bulletItem}>
            <span className={styles.checkIcon}>✓</span>
            <span>Watch all you want.</span>
          </div>
          <div className={styles.bulletItem}>
            <span className={styles.checkIcon}>✓</span>
            <span>Recommendations just for you.</span>
          </div>
          <div className={styles.bulletItem}>
            <span className={styles.checkIcon}>✓</span>
            <span>Change or cancel your plan anytime.</span>
          </div>
        </div>
      </div>

      <div className={styles.cardsGrid}>
        {plans.map((plan) => {
          const isSelected = plan.id === selectedPlanId;
          const formattedPrice = `PKR ${plan.price.toLocaleString()}`;

          return (
            <div
              key={plan.id}
              className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
              onClick={() => handleSelect(plan.id)}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleSelect(plan.id);
              }}
            >
              {plan.isPopular && (
                <div className={styles.popularBadge}>Most Popular</div>
              )}

              <div className={styles.cardHeader}>
                <div className={styles.planName}>{plan.name}</div>
                <div className={styles.planPrice}>
                  {formattedPrice}
                  <span className={styles.planPriceSub}>/mo</span>
                </div>
              </div>

              <div className={styles.attrList}>
                <div className={styles.attrItem}>
                  <span className={styles.attrLabel}>Resolution</span>
                  <span className={styles.attrValue}>{plan.resolution}</span>
                </div>

                <div className={styles.attrItem}>
                  <span className={styles.attrLabel}>Video & sound quality</span>
                  <span className={styles.attrValue}>{plan.quality}</span>
                </div>

                <div className={styles.attrItem}>
                  <span className={styles.attrLabel}>Spatial audio</span>
                  <span className={styles.attrValue}>
                    {plan.spatialAudio ? "Included" : "—"}
                  </span>
                </div>

                <div className={styles.attrItem}>
                  <span className={styles.attrLabel}>Household screens</span>
                  <span className={styles.attrValue}>
                    {plan.screens} {plan.screens === 1 ? "screen" : "screens"}
                  </span>
                </div>

                <div className={styles.attrItem}>
                  <span className={styles.attrLabel}>Download devices</span>
                  <span className={styles.attrValue}>
                    {plan.downloadDevices} {plan.downloadDevices === 1 ? "device" : "devices"}
                  </span>
                </div>

                <div className={styles.attrItem}>
                  <span className={styles.attrLabel}>Supported devices</span>
                  <span className={styles.attrValue}>
                    {Array.isArray(plan.supportedDevices)
                      ? plan.supportedDevices.join(", ")
                      : "TV, phone, tablet"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.actionArea}>
        <p className={styles.termsText}>
          HD (720p), Full HD (1080p), Ultra HD (4K) and HDR availability subject to your internet service and device capabilities. Not all content is available in all resolutions.
        </p>
        <button
          type="button"
          className={styles.nextButton}
          onClick={handleNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}
