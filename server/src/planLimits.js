// Single source of truth for plan tiers, profile allowances, stream limits, and quality caps.

export const PLAN_TIERS = {
  STANDARD_ADS: "STANDARD_ADS",
  STANDARD: "STANDARD",
  PREMIUM: "PREMIUM",
};

export const PLAN_LIMITS = {
  STANDARD_ADS: {
    tier: "STANDARD_ADS",
    label: "Standard with ads",
    maxProfiles: 1,
    maxConcurrentStreams: 1,
    maxQualityHeight: 1080,
    hasAds: true,
  },
  STANDARD: {
    tier: "STANDARD",
    label: "Standard",
    maxProfiles: 3,
    maxConcurrentStreams: 2,
    maxQualityHeight: 1080,
    hasAds: false,
  },
  PREMIUM: {
    tier: "PREMIUM",
    label: "Premium",
    maxProfiles: 5,
    maxConcurrentStreams: 4,
    maxQualityHeight: 2160,
    hasAds: false,
  },
};

export function getPlanLimits(tier) {
  const normalized = String(tier || "").toUpperCase();
  return PLAN_LIMITS[normalized] || PLAN_LIMITS.STANDARD;
}
