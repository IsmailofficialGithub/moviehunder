import { getPrisma, dbConfigured } from "./db.js";
import { requireUser } from "./auth.js";
import { getPublicPlans } from "./plans.js";

const PLAN_TO_TIER = {
  mobile: "STANDARD_ADS",
  basic: "BASIC",
  standard: "STANDARD",
  premium: "PREMIUM",
};

/**
 * GET /api/plans
 * Public endpoint to list active plans and starting price.
 */
export async function handleGetPlans(request, overrides = {}) {
  const db = overrides.db || (dbConfigured() ? getPrisma() : null);
  const redis = overrides.redis || null;

  try {
    const data = await getPublicPlans(db, redis);
    return {
      status: 200,
      body: {
        ok: true,
        ...data,
      },
    };
  } catch (err) {
    console.error("[plans/get]", err);
    return {
      status: 500,
      body: { ok: false, error: err.message || "Failed to load plans" },
    };
  }
}

/**
 * GET /api/subscription
 * Authenticated endpoint to view current user's subscription and active plan status.
 */
export async function handleGetSubscription(request, overrides = {}) {
  const db = overrides.db || (dbConfigured() ? getPrisma() : null);
  if (!db) {
    return { status: 503, body: { error: "Database not configured" } };
  }

  let user = overrides.user;
  if (!user) {
    const auth = await requireUser(request);
    if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
    user = auth.user;
  }

  let account = await db.account.findUnique({
    where: { ownerUserId: user.id },
    include: { plan: true },
  });

  if (!account) {
    account = await db.account.create({
      data: {
        ownerUserId: user.id,
        tier: "STANDARD",
        subscriptionStatus: "INACTIVE",
      },
    });
  }

  const now = new Date();
  const isExpired = account.planExpiresAt && account.planExpiresAt <= now;
  const hasActivePlan = account.subscriptionStatus === "ACTIVE" && !isExpired;

  return {
    status: 200,
    body: {
      ok: true,
      subscription: {
        status: isExpired ? "EXPIRED" : account.subscriptionStatus,
        hasActivePlan,
        tier: account.tier,
        planId: account.planId,
        plan: account.plan || null,
        planStartedAt: account.planStartedAt,
        planExpiresAt: account.planExpiresAt,
      },
    },
  };
}

/**
 * POST /api/subscription/subscribe
 * Authenticated endpoint to activate a subscription plan with simulated instant payment.
 */
export async function handleSubscribe(request, overrides = {}) {
  const db = overrides.db || (dbConfigured() ? getPrisma() : null);
  if (!db) {
    return { status: 503, body: { error: "Database not configured" } };
  }

  let user = overrides.user;
  if (!user) {
    const auth = await requireUser(request);
    if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
    user = auth.user;
  }

  const body = await request.json().catch(() => ({}));
  const planId = String(body.planId || "").trim().toLowerCase();

  if (!planId) {
    return { status: 400, body: { error: "planId is required" } };
  }

  const plan = await db.subscriptionPlan.findUnique({
    where: { id: planId },
  });

  if (!plan || !plan.active) {
    return { status: 400, body: { error: `Plan '${planId}' is invalid or inactive` } };
  }

  const tier = PLAN_TO_TIER[plan.id] || "STANDARD";
  const now = new Date();
  const planExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days active

  let account = await db.account.findUnique({
    where: { ownerUserId: user.id },
  });

  if (account) {
    account = await db.account.update({
      where: { ownerUserId: user.id },
      data: {
        planId: plan.id,
        tier,
        subscriptionStatus: "ACTIVE",
        planStartedAt: now,
        planExpiresAt,
      },
      include: { plan: true },
    });
  } else {
    account = await db.account.create({
      data: {
        ownerUserId: user.id,
        planId: plan.id,
        tier,
        subscriptionStatus: "ACTIVE",
        planStartedAt: now,
        planExpiresAt,
      },
      include: { plan: true },
    });
  }

  return {
    status: 200,
    body: {
      ok: true,
      message: "Subscription activated successfully",
      subscription: {
        status: "ACTIVE",
        hasActivePlan: true,
        planId: plan.id,
        tier,
        plan,
        planStartedAt: now,
        planExpiresAt,
      },
    },
  };
}
