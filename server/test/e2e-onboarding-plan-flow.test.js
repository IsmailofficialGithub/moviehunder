import test from "node:test";
import assert from "node:assert/strict";
import { handleGetPlans, handleGetSubscription, handleSubscribe } from "../src/subscription.js";
import { handleStartOnboarding, handleMagicLogin, handleMe } from "../src/auth.js";
import { getPrisma, dbConfigured } from "../src/db.js";

test("Full End-to-End Onboarding & Subscription Lifecycle Flow", async () => {
  // Use real DB if configured, otherwise mock store
  const isRealDb = dbConfigured();
  const prisma = isRealDb ? getPrisma() : null;

  const testEmail = `test_e2e_${Date.now()}@example.com`;
  let capturedEmail = null;

  // 1. GET /api/plans -> dynamic plans & minimum starting price
  const reqPlans = new Request("http://localhost:8787/api/plans");
  const plansRes = await handleGetPlans(reqPlans, { db: prisma });
  assert.equal(plansRes.status, 200);
  assert.equal(plansRes.body.ok, true);
  assert.ok(plansRes.body.plans.length >= 4);
  assert.equal(plansRes.body.startingPrice, 250);
  assert.equal(plansRes.body.startingPriceText, "Rs250/month");

  // 2. Guest submits email on landing page -> POST /api/auth/start-onboarding
  const reqOnboarding = new Request("http://localhost:8787/api/auth/start-onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail }),
  });

  const onboardingRes = await handleStartOnboarding(reqOnboarding, {
    db: prisma,
    mailer: {
      sendMail: async (opts) => {
        capturedEmail = opts;
        return { messageId: "e2e_msg" };
      },
    },
  });

  assert.equal(onboardingRes.status, 200);
  assert.equal(onboardingRes.body.ok, true);
  assert.ok(capturedEmail);
  assert.equal(capturedEmail.to, testEmail);
  assert.match(capturedEmail.html, /Let's create your account/);
  assert.match(capturedEmail.html, /Plans start at[\s\S]*?Rs250\/month\./);
  assert.match(capturedEmail.html, /This link will expire in 15 minutes\./);
  assert.match(capturedEmail.creationUrl, /\/api\/auth\/magic-login\?token=/);

  // Extract token from magic link URL
  const tokenMatch = capturedEmail.creationUrl.match(/token=([^&]+)/);
  assert.ok(tokenMatch);
  const magicToken = decodeURIComponent(tokenMatch[1]);

  // 3. User clicks link in email -> GET /api/auth/magic-login?token=...
  const reqMagic = new Request(
    `http://localhost:8787/api/auth/magic-login?token=${encodeURIComponent(magicToken)}`
  );
  const magicRes = await handleMagicLogin(reqMagic, { db: prisma });

  assert.equal(magicRes.status, 302);
  const redirectLocation = magicRes.headers.Location || magicRes.redirect;
  assert.match(redirectLocation, /\/signup\/planform\?accountCreated=success/);
  assert.ok(magicRes.body.access_token);
  assert.ok(magicRes.body.refresh_token);

  const accessToken = magicRes.body.access_token;

  // 4. Verify initial subscription state is INACTIVE
  const reqSubInitial = new Request("http://localhost:8787/api/subscription", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const subInitialRes = await handleGetSubscription(reqSubInitial, { db: prisma });
  assert.equal(subInitialRes.status, 200);
  assert.equal(subInitialRes.body.subscription.hasActivePlan, false);
  assert.equal(subInitialRes.body.subscription.status, "INACTIVE");

  // Verify /api/auth/me initially reflects hasActivePlan = false
  const reqMeInitial = new Request("http://localhost:8787/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meInitialRes = await handleMe(reqMeInitial);
  assert.equal(meInitialRes.status, 200);
  assert.equal(meInitialRes.body.hasActivePlan, false);

  // 5. User selects Standard plan (PKR 800) and completes checkout
  const reqCheckout = new Request("http://localhost:8787/api/subscription/subscribe", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      planId: "standard",
      paymentMethod: { type: "card", last4: "4242" },
    }),
  });
  const checkoutRes = await handleSubscribe(reqCheckout, { db: prisma });
  assert.equal(checkoutRes.status, 200);
  assert.equal(checkoutRes.body.ok, true);
  assert.equal(checkoutRes.body.subscription.status, "ACTIVE");
  assert.equal(checkoutRes.body.subscription.hasActivePlan, true);
  assert.equal(checkoutRes.body.subscription.planId, "standard");
  assert.equal(checkoutRes.body.subscription.tier, "STANDARD");

  // 6. Confirms /api/subscription and /api/auth/me now report active subscription!
  const reqSubActive = new Request("http://localhost:8787/api/subscription", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const subActiveRes = await handleGetSubscription(reqSubActive, { db: prisma });
  assert.equal(subActiveRes.status, 200);
  assert.equal(subActiveRes.body.subscription.hasActivePlan, true);
  assert.equal(subActiveRes.body.subscription.status, "ACTIVE");
  assert.equal(subActiveRes.body.subscription.plan.id, "standard");

  const reqMeActive = new Request("http://localhost:8787/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meActiveRes = await handleMe(reqMeActive);
  assert.equal(meActiveRes.status, 200);
  assert.equal(meActiveRes.body.hasActivePlan, true);
  assert.equal(meActiveRes.body.subscription.status, "ACTIVE");

  // Cleanup created test user in database
  if (prisma) {
    const u = await prisma.user.findUnique({ where: { email: testEmail } });
    if (u) {
      await prisma.account.deleteMany({ where: { ownerUserId: u.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
    }
  }
});
