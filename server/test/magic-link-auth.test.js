import test from "node:test";
import assert from "node:assert/strict";
import { generateAccountCreationEmailHtml } from "../src/emailTemplates.js";
import { handleStartOnboarding, handleMagicLogin } from "../src/auth.js";

test("generateAccountCreationEmailHtml produces expected Netflix/OffStream copy with dynamic starting price", () => {
  const html = generateAccountCreationEmailHtml({
    creationUrl: "https://offstream.co/api/auth/magic-login?token=test12345",
    startingPriceText: "Rs250/month",
  });

  assert.match(html, /Let's create your account/i);
  assert.match(html, /Plans start at[\s\S]*?Rs250\/month\./);
  assert.match(html, /This link will expire in 15 minutes\./);
  assert.match(html, /No password needed/);
  assert.match(html, /Cancel anytime/);
  assert.match(html, /Unlimited entertainment/);
  assert.match(html, /https:\/\/offstream\.co\/api\/auth\/magic-login\?token=test12345/);
  assert.match(html, /OffStream/i);
});

test("handleStartOnboarding creates user, creates 15-minute token and dispatches email", async () => {
  let createdUser = null;
  let createdAccount = null;
  let createdToken = null;
  let sentEmail = null;

  const mockDb = {
    user: {
      findUnique: async () => null,
      create: async ({ data }) => {
        createdUser = { id: "usr_123", email: data.email, displayName: data.displayName };
        return createdUser;
      },
    },
    account: {
      findUnique: async () => null,
      create: async ({ data }) => {
        createdAccount = { id: "acc_123", ...data };
        return createdAccount;
      },
    },
    emailToken: {
      deleteMany: async () => {},
      create: async ({ data }) => {
        createdToken = data;
        return data;
      },
    },
    subscriptionPlan: {
      findMany: async () => [{ id: "mobile", price: 250, active: true, sortOrder: 0 }],
      count: async () => 1,
    },
  };

  const mockMail = {
    sendMail: async (opts) => {
      sentEmail = opts;
      return { messageId: "msg_123" };
    },
  };

  const req = new Request("http://localhost:8787/api/auth/start-onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "newuser@example.com" }),
  });

  const res = await handleStartOnboarding(req, { db: mockDb, mailer: mockMail });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(createdUser);
  assert.equal(createdUser.email, "newuser@example.com");
  assert.ok(createdToken);
  assert.equal(createdToken.purpose, "onboarding_magic");

  // Check 15-minute expiration
  const fifteenMins = 15 * 60 * 1000;
  const expiryDiff = createdToken.expiresAt.getTime() - Date.now();
  assert.ok(expiryDiff > 14 * 60 * 1000 && expiryDiff <= fifteenMins + 2000, "Token expiry must be ~15 minutes");

  assert.ok(sentEmail);
  assert.equal(sentEmail.to, "newuser@example.com");
  assert.match(sentEmail.html, /Plans start at[\s\S]*?Rs250\/month\./);
});

test("handleMagicLogin rejects expired tokens and accepts valid tokens redirecting to planform", async () => {
  const activeUser = { id: "usr_valid", email: "valid@example.com" };
  const mockDb = {
    emailToken: {
      findFirst: async ({ where }) => {
        if (where.tokenHash === "expired_hash") {
          return null; // simulated expired where filter: expiresAt > now
        }
        return {
          id: "tok_1",
          userId: activeUser.id,
          purpose: "onboarding_magic",
          user: activeUser,
        };
      },
      deleteMany: async () => {},
    },
    user: {
      findUnique: async () => activeUser,
      update: async ({ data }) => ({ ...activeUser, ...data }),
    },
    account: {
      findUnique: async () => ({ id: "acc_1", ownerUserId: activeUser.id, subscriptionStatus: "INACTIVE" }),
      create: async ({ data }) => ({ id: "acc_1", ...data }),
    },
    session: {
      create: async ({ data }) => ({ id: "sess_1", ...data }),
    },
  };

  // 1. Expired token request
  const expiredReq = new Request("http://localhost:8787/api/auth/magic-login?token=expired_token");
  const expiredRes = await handleMagicLogin(expiredReq, { db: mockDb, tokenHasher: () => "expired_hash" });
  assert.equal(expiredRes.status, 400);

  // 2. Valid token request -> 302 redirect to planform with accountCreated=success
  const validReq = new Request("http://localhost:8787/api/auth/magic-login?token=valid_token");
  const validRes = await handleMagicLogin(validReq, { db: mockDb, tokenHasher: () => "valid_hash" });
  assert.equal(validRes.status, 302);
  const location = validRes.headers.Location || validRes.headers.location;
  assert.match(location, /\/signup\/planform\?accountCreated=success/);
  assert.match(location, /access_token=/);
  assert.match(location, /refresh_token=/);
});
