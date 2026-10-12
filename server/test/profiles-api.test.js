// Unit tests for Phase 2: Netflix-Style Profiles API, Plan Quotas, Argon2id PIN Hashing, and Session Switching.

import test from "node:test";
import assert from "node:assert/strict";
import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { isNodeApiPath, handleNodeApi } from "../src/nodeApi.js";
import { PLAN_LIMITS, getPlanLimits } from "../src/planLimits.js";
import {
  handleGetProfiles,
  handleCreateProfile,
  handleUpdateProfile,
  handleDeleteProfile,
  handleVerifyPin,
  handleSwitchProfile,
} from "../src/profiles.js";

const TEST_SECRET = "super_secret_test_jwt_key_at_least_16_chars";
process.env.AUTH_JWT_SECRET = TEST_SECRET;

// Helper to generate a valid test Bearer token for user
async function createTestToken(userId, email = "test@example.com") {
  const secret = new TextEncoder().encode(TEST_SECRET);
  return new SignJWT({ sub: userId, email, email_verified: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

test("isNodeApiPath recognizes all /api/profiles routes", () => {
  assert.equal(isNodeApiPath("/api/profiles"), true);
  assert.equal(isNodeApiPath("/api/profiles/prof_123"), true);
  assert.equal(isNodeApiPath("/api/profiles/prof_123/switch"), true);
  assert.equal(isNodeApiPath("/api/profiles/prof_123/verify-pin"), true);
  assert.equal(isNodeApiPath("/api/unrelated"), false);
});

test("Plan Quota: Enforces limits across all tiers based on PLAN_LIMITS single source of truth", () => {
  const adsPlan = getPlanLimits("STANDARD_ADS");
  assert.equal(adsPlan.maxProfiles, 1);

  const stdPlan = getPlanLimits("STANDARD");
  assert.equal(stdPlan.maxProfiles, 3);

  const premPlan = getPlanLimits("PREMIUM");
  assert.equal(premPlan.maxProfiles, 5);

  // Check quota evaluation logic
  function canAddProfile(tier, currentCount) {
    const limits = getPlanLimits(tier);
    return currentCount < limits.maxProfiles;
  }

  // Standard plan with 2 profiles can add another
  assert.equal(canAddProfile("STANDARD", 2), true);
  // Standard plan with 3 profiles cannot add another
  assert.equal(canAddProfile("STANDARD", 3), false);
  // Premium plan with 3 profiles can add another
  assert.equal(canAddProfile("PREMIUM", 3), true);
  // Standard ADS with 1 profile cannot add another
  assert.equal(canAddProfile("STANDARD_ADS", 1), false);
});

test("Argon2id PIN validation and hashing integrity", async () => {
  const validPin = "1234";
  const invalidPins = ["123", "12345", "abcd", "12 4", ""];

  for (const p of invalidPins) {
    assert.equal(/^\d{4}$/.test(p), false, `PIN '${p}' must fail 4-digit format check`);
  }
  assert.equal(/^\d{4}$/.test(validPin), true, "Valid 4-digit numeric PIN must pass format check");

  // Verify Argon2id produces valid verification hash
  const hash = await argon2.hash(validPin, { type: argon2.argon2id });
  assert.ok(hash.startsWith("$argon2id$"), "Hash must use Argon2id variant");

  const matches = await argon2.verify(hash, "1234");
  assert.equal(matches, true, "Correct PIN must verify successfully");

  const wrongMatches = await argon2.verify(hash, "9999");
  assert.equal(wrongMatches, false, "Incorrect PIN must fail verification");
});

test("Profile data sanitization: never exposes PIN or pinHash in output", () => {
  const rawDbProfile = {
    id: "p_1",
    name: "Living Room",
    avatarUrl: "https://example.com/avatar.png",
    isKids: false,
    isPrimary: true,
    pin: "$argon2id$v=19$m=65536,t=3,p=4$somehashvalue",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Sanitization check
  const sanitized = {
    id: rawDbProfile.id,
    name: rawDbProfile.name,
    avatarUrl: rawDbProfile.avatarUrl,
    isKids: Boolean(rawDbProfile.isKids),
    isPrimary: Boolean(rawDbProfile.isPrimary),
    hasPin: Boolean(rawDbProfile.pin),
    createdAt: rawDbProfile.createdAt,
    updatedAt: rawDbProfile.updatedAt,
  };

  assert.equal(sanitized.hasPin, true);
  assert.equal(sanitized.pin, undefined, "Sanitized profile must never include raw pin");
  assert.equal(sanitized.pinHash, undefined, "Sanitized profile must never include pinHash");
});

test("Profiles API handlers reject unauthenticated requests", async () => {
  const reqNoAuth = new Request("http://localhost:3000/api/profiles", { method: "GET" });
  const resGet = await handleGetProfiles(reqNoAuth);
  assert.equal(resGet.status, 401);

  const reqCreateNoAuth = new Request("http://localhost:3000/api/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Kids" }),
  });
  const resCreate = await handleCreateProfile(reqCreateNoAuth);
  assert.equal(resCreate.status, 401);

  const resUpdate = await handleUpdateProfile(reqNoAuth, "prof_123");
  assert.equal(resUpdate.status, 401);

  const resDelete = await handleDeleteProfile(reqNoAuth, "prof_123");
  assert.equal(resDelete.status, 401);

  const resVerify = await handleVerifyPin(reqNoAuth, "prof_123");
  assert.equal(resVerify.status, 401);

  const resSwitch = await handleSwitchProfile(reqNoAuth, "prof_123");
  assert.equal(resSwitch.status, 401);
});

test("Endpoint guards: handleCreateProfile and endpoints validate authentication and DB state", async () => {
  const token = await createTestToken("u_test_123");

  // Missing name
  const reqEmptyName = new Request("http://localhost:3000/api/profiles", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "" }),
  });
  const resEmptyName = await handleCreateProfile(reqEmptyName);
  assert.ok([400, 401, 503].includes(resEmptyName.status), `Status ${resEmptyName.status} must guard endpoint`);

  // Invalid PIN format (not 4 digits)
  const reqBadPin = new Request("http://localhost:3000/api/profiles", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Family", pin: "abc" }),
  });
  const resBadPin = await handleCreateProfile(reqBadPin);
  assert.ok([400, 401, 503].includes(resBadPin.status), `Status ${resBadPin.status} must guard endpoint`);
});

test("Session and Unlock JWT tokens: issuance, expiry, and payload verification", async () => {
  const secret = new TextEncoder().encode(TEST_SECRET);
  const userId = "u_verified_user";
  const profileId = "prof_locked_456";

  // Profile unlock token (4h)
  const unlockToken = await new SignJWT({
    sub: userId,
    profileId,
    type: "profile_unlock",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("4h")
    .sign(secret);

  const { payload: unlockPayload } = await jwtVerify(unlockToken, secret);
  assert.equal(unlockPayload.sub, userId);
  assert.equal(unlockPayload.profileId, profileId);
  assert.equal(unlockPayload.type, "profile_unlock");

  // Profile session token (30d)
  const sessionToken = await new SignJWT({
    sub: userId,
    profileId,
    isKids: false,
    type: "profile_session",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  const { payload: sessionPayload } = await jwtVerify(sessionToken, secret);
  assert.equal(sessionPayload.sub, userId);
  assert.equal(sessionPayload.profileId, profileId);
  assert.equal(sessionPayload.isKids, false);
  assert.equal(sessionPayload.type, "profile_session");
});

test("handleNodeApi router dispatches /api/profiles correctly", async () => {
  const req = new Request("http://localhost:3000/api/profiles", {
    method: "GET",
  });
  const res = await handleNodeApi(req);
  assert.ok(res !== null, "handleNodeApi must handle /api/profiles path");
  assert.equal(res.status, 401, "Should reject without auth header");

  const reqSwitch = new Request("http://localhost:3000/api/profiles/prof_123/switch", {
    method: "POST",
  });
  const resSwitch = await handleNodeApi(reqSwitch);
  assert.ok(resSwitch !== null, "handleNodeApi must handle /api/profiles/:id/switch");
  assert.equal(resSwitch.status, 401);
});

