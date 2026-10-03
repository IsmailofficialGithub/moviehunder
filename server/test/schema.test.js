import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../prisma/schema.prisma");

test("schema.prisma contains required profile, account and watch progress fields", () => {
  const content = fs.readFileSync(schemaPath, "utf8");

  // Account model should have extraProfilesPurchased
  assert.match(
    content,
    /extraProfilesPurchased\s+Int\s+@default\(0\)\s+@map\("extra_profiles_purchased"\)/,
    "Account should define extraProfilesPurchased"
  );

  // Profile model should have isPrimary, createdAt, updatedAt, watchProgress
  assert.match(
    content,
    /isPrimary\s+Boolean\s+@default\(false\)\s+@map\("is_primary"\)/,
    "Profile should define isPrimary"
  );
  assert.match(
    content,
    /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)/,
    "Profile should define createdAt"
  );
  assert.match(
    content,
    /updatedAt\s+DateTime\s+@updatedAt\s+@map\("updated_at"\)/,
    "Profile should define updatedAt"
  );
  assert.match(
    content,
    /watchProgress\s+WatchProgress\[\]/,
    "Profile should define watchProgress relation"
  );

  // WatchProgress should have profileId and profile relation
  assert.match(
    content,
    /profileId\s+String\?\s+@map\("profile_id"\)/,
    "WatchProgress should define profileId"
  );
  assert.match(
    content,
    /profile\s+Profile\?\s+@relation\(fields:\s*\[profileId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/,
    "WatchProgress should define profile relation with cascade delete"
  );
});
