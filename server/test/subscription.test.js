import test from "node:test";
import assert from "node:assert/strict";
import {
  handleGetPlans,
  handleGetSubscription,
  handleSubscribe,
} from "../src/subscription.js";

test("handleGetPlans returns dynamic plans and startingPrice", async () => {
  const mockDb = {
    subscriptionPlan: {
      findMany: async () => [
        { id: "mobile", name: "Mobile", price: 250, active: true, sortOrder: 0 },
        { id: "basic", name: "Basic", price: 450, active: true, sortOrder: 1 },
        { id: "standard", name: "Standard", price: 800, active: true, sortOrder: 2 },
        { id: "premium", name: "Premium", price: 1100, active: true, sortOrder: 3 },
      ],
      count: async () => 4,
    },
  };

  const req = new Request("http://localhost:8787/api/plans");
  const res = await handleGetPlans(req, { db: mockDb });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.plans.length, 4);
  assert.equal(res.body.startingPrice, 250);
  assert.equal(res.body.startingPriceText, "Rs250/month");
});

test("handleSubscribe activates account subscription for 30 days and handleGetSubscription confirms it", async () => {
  const user = { id: "usr_buyer", email: "buyer@example.com" };
  let account = {
    id: "acc_buyer",
    ownerUserId: user.id,
    planId: null,
    tier: "STANDARD",
    subscriptionStatus: "INACTIVE",
    planStartedAt: null,
    planExpiresAt: null,
  };

  const planStandard = {
    id: "standard",
    name: "Standard",
    price: 800,
    currency: "PKR",
    resolution: "1080p (Full HD)",
    screens: 2,
    active: true,
  };

  const mockDb = {
    subscriptionPlan: {
      findUnique: async ({ where }) => {
        if (where.id === "standard") return planStandard;
        return null;
      },
    },
    account: {
      findUnique: async () => ({ ...account, plan: account.planId ? planStandard : null }),
      update: async ({ data }) => {
        account = { ...account, ...data };
        return account;
      },
      create: async ({ data }) => {
        account = { id: "acc_buyer", ...data };
        return account;
      },
    },
  };

  // 1. Initially check subscription status -> INACTIVE
  const getReq1 = new Request("http://localhost:8787/api/subscription");
  const getRes1 = await handleGetSubscription(getReq1, { db: mockDb, user });
  assert.equal(getRes1.status, 200);
  assert.equal(getRes1.body.ok, true);
  assert.equal(getRes1.body.subscription.hasActivePlan, false);
  assert.equal(getRes1.body.subscription.status, "INACTIVE");

  // 2. Subscribe to Standard plan
  const subReq = new Request("http://localhost:8787/api/subscription/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planId: "standard",
      paymentMethod: { type: "card", last4: "4242" },
    }),
  });

  const subRes = await handleSubscribe(subReq, { db: mockDb, user });
  assert.equal(subRes.status, 200);
  assert.equal(subRes.body.ok, true);
  assert.equal(subRes.body.subscription.status, "ACTIVE");
  assert.equal(subRes.body.subscription.planId, "standard");
  assert.equal(account.subscriptionStatus, "ACTIVE");
  assert.equal(account.planId, "standard");
  assert.ok(account.planExpiresAt.getTime() > Date.now() + 29 * 86400000);

  // 3. Confirm status is now ACTIVE
  const getReq2 = new Request("http://localhost:8787/api/subscription");
  const getRes2 = await handleGetSubscription(getReq2, { db: mockDb, user });
  assert.equal(getRes2.status, 200);
  assert.equal(getRes2.body.subscription.hasActivePlan, true);
  assert.equal(getRes2.body.subscription.status, "ACTIVE");
  assert.equal(getRes2.body.subscription.plan.name, "Standard");
});
