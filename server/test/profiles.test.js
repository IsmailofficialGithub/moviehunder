import test from "node:test";
import assert from "node:assert/strict";
import {
  getProfileLimits,
  handleGetProfiles,
  handleCreateProfile,
  handleUpdateProfile,
  handleDeleteProfile,
  handleBuyExtraSlot,
} from "../src/profiles.js";

test("getProfileLimits calculates correct limits based on tier and extra slots", () => {
  // STANDARD_ADS (1 screen, 2 included)
  const adsLimits = getProfileLimits({ tier: "STANDARD_ADS", extraProfilesPurchased: 0 }, 1);
  assert.equal(adsLimits.screens, 1);
  assert.equal(adsLimits.includedProfiles, 2);
  assert.equal(adsLimits.totalAllowedProfiles, 2);
  assert.equal(adsLimits.canAddMore, true);
  assert.equal(adsLimits.canPurchaseExtra, true);

  // When at capacity
  const adsAtCap = getProfileLimits({ tier: "STANDARD_ADS", extraProfilesPurchased: 0 }, 2);
  assert.equal(adsAtCap.canAddMore, false);
  assert.equal(adsAtCap.canPurchaseExtra, true);

  // When extra slot purchased
  const adsWithExtra = getProfileLimits({ tier: "STANDARD_ADS", extraProfilesPurchased: 1 }, 2);
  assert.equal(adsWithExtra.totalAllowedProfiles, 3);
  assert.equal(adsWithExtra.canAddMore, true);
  assert.equal(adsWithExtra.canPurchaseExtra, false); // hit max extra for ads tier

  // STANDARD (2 screens, 4 included)
  const stdLimits = getProfileLimits({ tier: "STANDARD", extraProfilesPurchased: 0 }, 4);
  assert.equal(stdLimits.screens, 2);
  assert.equal(stdLimits.includedProfiles, 4);
  assert.equal(stdLimits.canAddMore, false);
  assert.equal(stdLimits.canPurchaseExtra, true);

  // PREMIUM (4 screens, 5 included)
  const premLimits = getProfileLimits({ tier: "PREMIUM", extraProfilesPurchased: 0 }, 3);
  assert.equal(premLimits.screens, 4);
  assert.equal(premLimits.includedProfiles, 5);
  assert.equal(premLimits.canAddMore, true);
});

test("handleGetProfiles auto-seeds a primary profile when user has none", async () => {
  let createdProfileData = null;
  const mockDb = {
    account: {
      findFirst: async () => ({ tier: "STANDARD", extraProfilesPurchased: 0 }),
      findUnique: async () => ({ tier: "STANDARD", extraProfilesPurchased: 0 }),
    },
    profile: {
      findMany: async () => (createdProfileData ? [createdProfileData] : []),
      create: async ({ data }) => {
        createdProfileData = { id: "p1", ...data };
        return createdProfileData;
      },
    },
  };

  const req = new Request("http://localhost/api/profiles");
  const res = await handleGetProfiles(req, {
    authUser: { id: "u1", displayName: "Alex", email: "alex@example.com" },
    db: mockDb,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.profiles.length, 1);
  assert.equal(res.body.profiles[0].name, "Alex");
  assert.equal(res.body.profiles[0].isPrimary, true);
});

test("handleCreateProfile enforces plan profile limits", async () => {
  const existingProfiles = [
    { id: "p1", userId: "u1", name: "Main", isPrimary: true },
    { id: "p2", userId: "u1", name: "Guest", isPrimary: false },
  ];

  const mockDb = {
    account: {
      findFirst: async () => ({ tier: "STANDARD_ADS", extraProfilesPurchased: 0 }),
      findUnique: async () => ({ tier: "STANDARD_ADS", extraProfilesPurchased: 0 }),
    },
    profile: {
      findMany: async () => existingProfiles,
      create: async () => assert.fail("Should not call create when limit reached"),
    },
  };

  const req = new Request("http://localhost/api/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Third Profile" }),
  });

  const res = await handleCreateProfile(req, {
    authUser: { id: "u1" },
    db: mockDb,
  });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, "PROFILE_LIMIT_REACHED");
  assert.equal(res.body.limits.totalAllowedProfiles, 2);
});

test("handleDeleteProfile prevents deleting the last remaining profile", async () => {
  const mockDb = {
    profile: {
      findMany: async () => [{ id: "p1", userId: "u1", isPrimary: true }],
      delete: async () => assert.fail("Should not delete sole profile"),
    },
  };

  const req = new Request("http://localhost/api/profiles/p1", { method: "DELETE" });
  const res = await handleDeleteProfile(req, "p1", {
    authUser: { id: "u1" },
    db: mockDb,
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, "CANNOT_DELETE_LAST_PROFILE");
});

test("handleBuyExtraSlot increments extraProfilesPurchased on account", async () => {
  let updatedAccount = null;
  const mockDb = {
    account: {
      findFirst: async () => ({ id: "acc1", ownerUserId: "u1", tier: "STANDARD", extraProfilesPurchased: 0 }),
      findUnique: async () => ({ id: "acc1", ownerUserId: "u1", tier: "STANDARD", extraProfilesPurchased: 0 }),
      update: async ({ data }) => {
        const extra = data.extraProfilesPurchased?.increment
          ? 1
          : Number(data.extraProfilesPurchased) || 0;
        updatedAccount = { id: "acc1", ownerUserId: "u1", tier: "STANDARD", extraProfilesPurchased: extra };
        return updatedAccount;
      },
    },
    profile: {
      findMany: async () => [{ id: "p1", userId: "u1" }],
    },
  };

  const req = new Request("http://localhost/api/profiles/extra-slot", { method: "POST" });
  const res = await handleBuyExtraSlot(req, {
    authUser: { id: "u1" },
    db: mockDb,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.limits.extraProfilesPurchased, 1);
  assert.equal(res.body.limits.totalAllowedProfiles, 5); // 4 included + 1 extra
});
