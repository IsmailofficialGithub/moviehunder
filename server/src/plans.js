import { getRedis } from "./redis.js";

export const REDIS_PLANS_KEY = "offstream:plans:v1";
const PLANS_CACHE_TTL_SECONDS = 3600; // 1 hour

export const DEFAULT_PLANS = [
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
    sortOrder: 0,
    active: true,
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
    sortOrder: 1,
    active: true,
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
    sortOrder: 2,
    active: true,
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
    sortOrder: 3,
    active: true,
  },
];

let memoryCache = null;
let memoryCacheExpiry = 0;

export function clearPlansMemoryCache() {
  memoryCache = null;
  memoryCacheExpiry = 0;
}

/**
 * Seeds default subscription plans if table is empty.
 */
export async function seedDefaultPlansIfEmpty(db) {
  if (!db || !db.subscriptionPlan) return DEFAULT_PLANS;

  const count = await db.subscriptionPlan.count().catch(() => 0);
  if (count > 0) {
    return await db.subscriptionPlan.findMany({
      orderBy: { sortOrder: "asc" },
    });
  }

  const created = [];
  for (const plan of DEFAULT_PLANS) {
    const record = await db.subscriptionPlan.create({
      data: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
        resolution: plan.resolution,
        quality: plan.quality,
        screens: plan.screens,
        downloadDevices: plan.downloadDevices,
        spatialAudio: plan.spatialAudio,
        supportedDevices: plan.supportedDevices,
        isPopular: plan.isPopular,
        sortOrder: plan.sortOrder,
        active: plan.active,
      },
    });
    created.push(record);
  }

  return created;
}

/**
 * Retrieves public active subscription plans with dynamic minimum price.
 */
export async function getPublicPlans(db, redisInstance = null) {
  const now = Date.now();
  if (memoryCache && memoryCacheExpiry > now) {
    return memoryCache;
  }

  // Try Redis cache if available
  let redis = redisInstance;
  if (!redis && redisInstance !== null) {
    try {
      redis = await getRedis().catch(() => null);
    } catch {
      redis = null;
    }
  }

  if (redis && typeof redis.get === "function") {
    try {
      const cached = await redis.get(REDIS_PLANS_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        memoryCache = parsed;
        memoryCacheExpiry = now + 60000; // 1 min local fallback
        return parsed;
      }
    } catch (err) {
      // Redis error, proceed to db query
    }
  }

  // Query Database
  let plans = [];
  if (db && db.subscriptionPlan) {
    plans = await db.subscriptionPlan
      .findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
      })
      .catch(() => []);

    if (!plans || plans.length === 0) {
      plans = await seedDefaultPlansIfEmpty(db).catch(() => DEFAULT_PLANS);
    }
  }

  if (!plans || plans.length === 0) {
    plans = DEFAULT_PLANS.filter((p) => p.active);
  }

  const prices = plans.map((p) => p.price);
  const startingPrice = prices.length > 0 ? Math.min(...prices) : 250;
  const startingPriceText = `Rs${startingPrice}/month`;

  const payload = {
    plans,
    startingPrice,
    startingPriceText,
  };

  // Cache in Redis
  if (redis && typeof redis.set === "function") {
    try {
      await redis.set(REDIS_PLANS_KEY, JSON.stringify(payload), {
        EX: PLANS_CACHE_TTL_SECONDS,
      });
    } catch {
      // ignore cache write error
    }
  }

  memoryCache = payload;
  memoryCacheExpiry = now + 60000;

  return payload;
}
