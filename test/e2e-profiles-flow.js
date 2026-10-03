/**
 * End-to-End Integration Test for Movies Hunder / Offstream Netflix-style Profiles
 * Verifies all 6 lifecycle stages:
 *  1. User Signup & JWT Issuance
 *  2. Auto-seeding of Default Primary Profile
 *  3. Profile Creation (Standard & Kids profiles with brand avatars)
 *  4. Plan Limit Enforcement (403 on limit) & Extra Add-on Slot Purchase
 *  5. Watch Progress Isolation (Same movie key on distinct profiles doesn't collide)
 *  6. Deletion Protection (Cannot delete last profile) & Profile Cleanup
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Ensure environment is loaded from server/.env
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(rootDir, "server", ".env");
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    let v = t.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }
}

import { handleNodeApi } from "../server/src/nodeApi.js";
import { getPrisma, disconnectPrisma } from "../server/src/db.js";

async function api(path, options = {}) {
  const url = `http://localhost${path}`;
  const req = new Request(url, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const res = await handleNodeApi(req);
  if (!res) throw new Error(`Unhandled path: ${path}`);
  const status = res.status;
  const json = await res.json().catch(() => ({}));
  return { status, body: json };
}

async function run() {
  console.log("============================================================");
  console.log("  Running E2E Netflix-Style Profiles Integration Test");
  console.log("============================================================\n");

  const prisma = getPrisma();
  const testId = Date.now();
  const testEmail = `profile_e2e_${testId}@example.com`;
  const testPassword = "SuperSecurePassword123!";
  let testUserId = null;
  let token = null;
  let profile1 = null;
  let profile2 = null;

  try {
    // ── STAGE 1: User Signup & JWT Issuance ─────────────────────────────
    console.log("▶ Stage 1: User Signup & JWT Token Issuance...");
    const signupRes = await api("/api/auth/signup", {
      method: "POST",
      body: {
        email: testEmail,
        password: testPassword,
        displayName: "E2E Tester",
      },
    });

    assert.equal(signupRes.status, 201, `Signup failed with status ${signupRes.status}`);
    assert.ok(signupRes.body.ok, "Signup response ok was not true");
    assert.ok(signupRes.body.access_token, "No access_token returned");
    assert.ok(signupRes.body.user?.id, "No user id returned");

    testUserId = signupRes.body.user.id;
    token = signupRes.body.access_token;
    console.log(`  ✓ Created user ${testUserId} (${testEmail}) with valid JWT.\n`);

    const authHeaders = { authorization: `Bearer ${token}` };

    // ── STAGE 2: Auto-seeding Default Profile ───────────────────────────
    console.log("▶ Stage 2: Fetch Profiles & Auto-seed Default Primary Profile...");
    const profilesRes1 = await api("/api/profiles", { headers: authHeaders });

    assert.equal(profilesRes1.status, 200, "Get profiles failed");
    assert.ok(profilesRes1.body.ok, "Profiles response ok was not true");
    assert.equal(profilesRes1.body.profiles.length, 1, "Expected exactly 1 auto-seeded profile");

    profile1 = profilesRes1.body.profiles[0];
    assert.equal(profile1.isPrimary, true, "First profile must be marked primary");
    assert.equal(profile1.name, "E2E Tester", "Profile name should default to displayName");
    assert.equal(profile1.isKids, false, "Default profile should not be kids");
    assert.ok(profile1.avatarUrl.includes("5a00a2"), "Default avatar should use brand primary purple");

    const limits1 = profilesRes1.body.limits;
    assert.equal(limits1.screens, 2, "Default standard plan has 2 screens");
    assert.equal(limits1.includedProfiles, 4, "Standard plan includes 4 profiles");
    assert.equal(limits1.totalAllowedProfiles, 4, "Total allowed should be 4");
    assert.equal(limits1.canAddMore, true, "Should be able to add more profiles");
    console.log(`  ✓ Auto-seeded primary profile: "${profile1.name}" (${profile1.id}) with Standard plan (4 profiles max).\n`);

    // ── STAGE 3: Create Secondary & Kids Profiles ───────────────────────
    console.log("▶ Stage 3: Create Secondary & Kids Profiles...");
    const createKidsRes = await api("/api/profiles", {
      method: "POST",
      headers: authHeaders,
      body: {
        name: "Kids Animation",
        isKids: true,
      },
    });

    assert.equal(createKidsRes.status, 201, "Creating kids profile failed");
    assert.ok(createKidsRes.body.ok, "Create kids profile response not ok");
    profile2 = createKidsRes.body.profile;
    assert.equal(profile2.name, "Kids Animation");
    assert.equal(profile2.isKids, true);
    assert.equal(profile2.isPrimary, false);
    assert.ok(profile2.avatarUrl.includes("38bdf8"), "Kids avatar must use sky blue");
    console.log(`  ✓ Created kids profile: "${profile2.name}" (${profile2.id}) with kids avatar color.\n`);

    // ── STAGE 4: Plan Limit Enforcement & Extra Slot Purchase ───────────
    console.log("▶ Stage 4: Enforce Plan Limits (4 max) & Purchase Extra Slot...");
    // Create Profile 3 and Profile 4 to hit the limit
    const p3Res = await api("/api/profiles", {
      method: "POST",
      headers: authHeaders,
      body: { name: "Profile 3" },
    });
    assert.equal(p3Res.status, 201);

    const p4Res = await api("/api/profiles", {
      method: "POST",
      headers: authHeaders,
      body: { name: "Profile 4" },
    });
    assert.equal(p4Res.status, 201);

    // Attempting to create 5th profile should fail with 403
    const p5FailRes = await api("/api/profiles", {
      method: "POST",
      headers: authHeaders,
      body: { name: "Profile 5 (Excess)" },
    });
    assert.equal(p5FailRes.status, 403, "Expected 403 when creating profile exceeding plan limit");
    assert.equal(p5FailRes.body.error, "PROFILE_LIMIT_REACHED");
    assert.equal(p5FailRes.body.limits.canPurchaseExtra, true, "Standard plan allows purchasing extra slots");
    console.log("  ✓ Correctly rejected 5th profile with 403 PROFILE_LIMIT_REACHED.");

    // Purchase extra profile slot
    const buySlotRes = await api("/api/profiles/extra-slot", {
      method: "POST",
      headers: authHeaders,
    });
    assert.equal(buySlotRes.status, 200, "Purchase extra slot failed");
    assert.ok(buySlotRes.body.ok);
    assert.equal(buySlotRes.body.limits.extraProfilesPurchased, 1);
    assert.equal(buySlotRes.body.limits.totalAllowedProfiles, 5, "Total allowed should now be 5");
    console.log("  ✓ Purchased extra slot: totalAllowedProfiles is now 5.");

    // Now creating 5th profile should succeed
    const p5SuccessRes = await api("/api/profiles", {
      method: "POST",
      headers: authHeaders,
      body: { name: "Profile 5 (Unlocked)" },
    });
    assert.equal(p5SuccessRes.status, 201, "Expected 201 after purchasing extra slot");
    const profile5 = p5SuccessRes.body.profile;
    console.log(`  ✓ Successfully created 5th profile "${profile5.name}" (${profile5.id}).\n`);

    // ── STAGE 5: Watch Progress Isolation Per Profile ───────────────────
    console.log("▶ Stage 5: Isolated Watch Progress for Profile 1 vs Profile 2...");
    const testMovieKey = "movie:interstellar-2014";

    // Profile 1 watches movie at 1500 seconds
    const syncPut1 = await api("/api/sync/watch-progress", {
      method: "PUT",
      headers: { ...authHeaders, "x-profile-id": profile1.id },
      body: {
        key: testMovieKey,
        title: "Interstellar",
        position: 1500,
        duration: 10140,
      },
    });
    assert.equal(syncPut1.status, 200, "Profile 1 sync put failed");

    // Profile 2 watches same movie at 4200 seconds
    const syncPut2 = await api("/api/sync/watch-progress", {
      method: "PUT",
      headers: { ...authHeaders, "x-profile-id": profile2.id },
      body: {
        key: testMovieKey,
        title: "Interstellar",
        position: 4200,
        duration: 10140,
      },
    });
    assert.equal(syncPut2.status, 200, "Profile 2 sync put failed");

    // Fetch watch progress for Profile 1
    const syncGet1 = await api("/api/sync/watch-progress", {
      headers: { ...authHeaders, "x-profile-id": profile1.id },
    });
    assert.equal(syncGet1.status, 200);
    assert.ok(Array.isArray(syncGet1.body.items), "Profile 1 items array missing");
    const item1 = syncGet1.body.items.find((p) => p.key === testMovieKey);
    assert.ok(item1, "Profile 1 watch progress missing");
    assert.equal(item1.position, 1500, `Profile 1 position expected 1500, got ${item1.position}`);

    // Fetch watch progress for Profile 2
    const syncGet2 = await api("/api/sync/watch-progress", {
      headers: { ...authHeaders, "x-profile-id": profile2.id },
    });
    assert.equal(syncGet2.status, 200);
    assert.ok(Array.isArray(syncGet2.body.items), "Profile 2 items array missing");
    const item2 = syncGet2.body.items.find((p) => p.key === testMovieKey);
    assert.ok(item2, "Profile 2 watch progress missing");
    assert.equal(item2.position, 4200, `Profile 2 position expected 4200, got ${item2.position}`);

    // Verify database rows directly
    const dbRecords = await prisma.watchProgress.findMany({ where: { userId: testUserId } });
    assert.equal(dbRecords.length, 2, "Expected 2 database watch progress records");
    const dbP1 = dbRecords.find((r) => r.profileId === profile1.id);
    const dbP2 = dbRecords.find((r) => r.profileId === profile2.id);
    assert.ok(dbP1 && dbP1.position === 1500, "DB Profile 1 record mismatch");
    assert.ok(dbP2 && dbP2.position === 4200, "DB Profile 2 record mismatch");

    console.log(`  ✓ Verified Profile 1 watch progress: ${item1.position}s (profileId: ${profile1.id})`);
    console.log(`  ✓ Verified Profile 2 watch progress: ${item2.position}s (profileId: ${profile2.id})`);
    console.log("  ✓ No collision detected between independent profile watch histories!\n");

    // ── STAGE 6: Profile Deletion & Protection Logic ───────────────────
    console.log("▶ Stage 6: Profile Deletion & Last Profile Protection...");
    // Delete non-primary profile 5
    const delP5 = await api(`/api/profiles/${profile5.id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    assert.equal(delP5.status, 200, "Delete profile 5 failed");
    console.log(`  ✓ Deleted profile 5 (${profile5.id}).`);

    // Delete profiles 3, 4, and kids profile
    await api(`/api/profiles/${p3Res.body.profile.id}`, { method: "DELETE", headers: authHeaders });
    await api(`/api/profiles/${p4Res.body.profile.id}`, { method: "DELETE", headers: authHeaders });
    await api(`/api/profiles/${profile2.id}`, { method: "DELETE", headers: authHeaders });
    console.log("  ✓ Deleted profiles 3, 4, and Kids profile.");

    // Now only 1 profile remains (profile1)
    const delLastRes = await api(`/api/profiles/${profile1.id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    assert.equal(delLastRes.status, 400, "Expected 400 when attempting to delete last profile");
    assert.equal(delLastRes.body.error, "CANNOT_DELETE_LAST_PROFILE");
    console.log("  ✓ Last profile deletion blocked: CANNOT_DELETE_LAST_PROFILE.");

    console.log("\n============================================================");
    console.log("  ALL 6 E2E INTEGRATION TEST STAGES PASSED SUCCESSFULLY!  ");
    console.log("============================================================\n");
  } finally {
    // Cleanup test data
    if (testUserId) {
      console.log(`🧹 Cleaning up test user ${testUserId}...`);
      await prisma.watchProgress.deleteMany({ where: { userId: testUserId } }).catch(() => {});
      await prisma.profile.deleteMany({ where: { userId: testUserId } }).catch(() => {});
      await prisma.account.deleteMany({ where: { userId: testUserId } }).catch(() => {});
      await prisma.session.deleteMany({ where: { userId: testUserId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: testUserId } }).catch(() => {});
      console.log("✓ Cleanup complete.");
    }
    await disconnectPrisma();
  }
}

run().catch((err) => {
  console.error("\n❌ E2E INTEGRATION TEST FAILED:\n", err);
  process.exit(1);
});
