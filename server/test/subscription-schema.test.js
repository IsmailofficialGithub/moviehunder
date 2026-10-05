import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../prisma/schema.prisma");

test("schema.prisma defines SubscriptionPlan model, SubscriptionStatus enum, and Account subscription fields", () => {
  const content = fs.readFileSync(schemaPath, "utf8");

  // SubscriptionStatus enum
  assert.match(
    content,
    /enum\s+SubscriptionStatus\s+\{[\s\S]*?INACTIVE[\s\S]*?ACTIVE[\s\S]*?CANCELLED[\s\S]*?PAST_DUE[\s\S]*?\}/,
    "SubscriptionStatus enum must define INACTIVE, ACTIVE, CANCELLED, PAST_DUE"
  );

  // SubscriptionPlan model
  assert.match(
    content,
    /model\s+SubscriptionPlan\s+\{[\s\S]*?id\s+String\s+@id[\s\S]*?name\s+String[\s\S]*?price\s+Int[\s\S]*?currency\s+String[\s\S]*?resolution\s+String[\s\S]*?quality\s+String[\s\S]*?screens\s+Int[\s\S]*?downloadDevices\s+Int[\s\S]*?spatialAudio\s+Boolean[\s\S]*?supportedDevices\s+String\[\][\s\S]*?isPopular\s+Boolean[\s\S]*?sortOrder\s+Int[\s\S]*?active\s+Boolean[\s\S]*?accounts\s+Account\[\][\s\S]*?@@map\("subscription_plans"\)/,
    "SubscriptionPlan model must define all plan tiers fields and account relation"
  );

  // Account model should have planId, subscriptionStatus, planStartedAt, planExpiresAt, and plan relation
  assert.match(
    content,
    /planId\s+String\?\s+@map\("plan_id"\)/,
    "Account should define planId"
  );
  assert.match(
    content,
    /subscriptionStatus\s+SubscriptionStatus\s+@default\(INACTIVE\)\s+@map\("subscription_status"\)/,
    "Account should define subscriptionStatus with default INACTIVE"
  );
  assert.match(
    content,
    /planStartedAt\s+DateTime\?\s+@map\("plan_started_at"\)/,
    "Account should define planStartedAt"
  );
  assert.match(
    content,
    /planExpiresAt\s+DateTime\?\s+@map\("plan_expires_at"\)/,
    "Account should define planExpiresAt"
  );
  assert.match(
    content,
    /plan\s+SubscriptionPlan\?\s+@relation\(fields:\s*\[planId\],\s*references:\s*\[id\]\)/,
    "Account should define relation to SubscriptionPlan"
  );
});
