import test from "node:test";
import assert from "node:assert/strict";
import {
  seedDefaultPlansIfEmpty,
  getPublicPlans,
  DEFAULT_PLANS,
  clearPlansMemoryCache,
} from "../src/plans.js";

test("seedDefaultPlansIfEmpty seeds 4 tiers if database is empty", async () => {
  const store = [];
  const mockDb = {
    subscriptionPlan: {
      count: async () => store.length,
      create: async ({ data }) => {
        store.push(data);
        return data;
      },
      findMany: async () => store,
    },
  };

  const seeded = await seedDefaultPlansIfEmpty(mockDb);
  assert.equal(seeded.length, 4);
  assert.equal(store.length, 4);

  const mobile = store.find((p) => p.id === "mobile");
  assert.ok(mobile);
  assert.equal(mobile.price, 250);
  assert.equal(mobile.resolution, "480p");
  assert.equal(mobile.quality, "Fair");
  assert.equal(mobile.screens, 1);

  const basic = store.find((p) => p.id === "basic");
  assert.ok(basic);
  assert.equal(basic.price, 450);
  assert.equal(basic.resolution, "720p (HD)");
  assert.equal(basic.quality, "Good");

  const standard = store.find((p) => p.id === "standard");
  assert.ok(standard);
  assert.equal(standard.price, 800);
  assert.equal(standard.resolution, "1080p (Full HD)");
  assert.equal(standard.isPopular, true);

  const premium = store.find((p) => p.id === "premium");
  assert.ok(premium);
  assert.equal(premium.price, 1100);
  assert.equal(premium.resolution, "4K (Ultra HD) + HDR");
  assert.equal(premium.spatialAudio, true);
  assert.equal(premium.screens, 4);

  // Calling again does not re-seed
  const secondRun = await seedDefaultPlansIfEmpty(mockDb);
  assert.equal(secondRun.length, 4);
  assert.equal(store.length, 4);
});

test("getPublicPlans returns sorted plans and calculates startingPrice", async () => {
  clearPlansMemoryCache();
  const plansData = [
    { id: "premium", name: "Premium", price: 1100, sortOrder: 3, active: true },
    { id: "mobile", name: "Mobile", price: 250, sortOrder: 0, active: true },
    { id: "standard", name: "Standard", price: 800, sortOrder: 2, active: true },
    { id: "basic", name: "Basic", price: 450, sortOrder: 1, active: true },
  ];

  const mockDb = {
    subscriptionPlan: {
      findMany: async () => [...plansData].sort((a, b) => a.sortOrder - b.sortOrder),
    },
  };

  const res = await getPublicPlans(mockDb, null);
  assert.equal(res.plans.length, 4);
  assert.equal(res.startingPrice, 250);
  assert.equal(res.startingPriceText, "Rs250/month");
  assert.equal(res.plans[0].id, "mobile");
  assert.equal(res.plans[3].id, "premium");
});

test("getPublicPlans returns cached plans when cache is present", async () => {
  clearPlansMemoryCache();
  let dbCalls = 0;
  const mockDb = {
    subscriptionPlan: {
      findMany: async () => {
        dbCalls++;
        return [{ id: "mobile", name: "Mobile", price: 250, sortOrder: 0, active: true }];
      },
    },
  };

  let redisStore = {};
  const mockRedis = {
    get: async (key) => redisStore[key] || null,
    set: async (key, val) => {
      redisStore[key] = val;
    },
  };

  const first = await getPublicPlans(mockDb, mockRedis);
  assert.equal(first.startingPrice, 250);
  assert.equal(dbCalls, 1);

  // Second call should hit redis cache without hitting db
  const second = await getPublicPlans(mockDb, mockRedis);
  assert.equal(second.startingPrice, 250);
  assert.equal(dbCalls, 1);
});
