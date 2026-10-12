import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PRESET_AVATARS,
  MAX_PROFILES,
  getUserProfilesKey,
} from "../lib/profiles.js";
import {
  getHistoryStorageKeys,
} from "../lib/sync.js";

test("Profiles helper constants and key generation", () => {
  assert.equal(MAX_PROFILES, 5, "MAX_PROFILES must be 5 according to plan limit");
  assert.ok(PRESET_AVATARS.length >= 6, "Must define at least 6 preset avatars");
  assert.equal(getUserProfilesKey("u123"), "mh.profiles.u123");
  assert.equal(getUserProfilesKey(null), "mh.profiles.guest");
});

test("History storage keys partition by profile with profile 1 legacy fallback", () => {
  const p1Keys = getHistoryStorageKeys("1001", "1", "2", "1");
  assert.equal(p1Keys.key, "history_1001_1_2");
  assert.equal(p1Keys.legacyKey, "history_1001_1_2");
  assert.equal(p1Keys.timeKey, "history_time_1001_1_2");

  const p2Keys = getHistoryStorageKeys("1001", "1", "2", "2");
  assert.equal(p2Keys.key, "history_p2_1001_1_2");
  assert.equal(p2Keys.timeKey, "history_time_p2_1001_1_2");
  assert.equal(p2Keys.metaKey, "history_meta_p2_1001");
});

test("Profiles page contains Netflix-style management, PIN lock, and plan limit UI", () => {
  const pagePath = path.resolve("app/profiles/page.js");
  const pageSrc = fs.readFileSync(pagePath, "utf8");

  assert.match(pageSrc, /MAX_PROFILES/, "Profiles page must enforce MAX_PROFILES limit");
  assert.match(pageSrc, /isManaging/, "Profiles page must have Manage Profiles toggle mode");
  assert.match(pageSrc, /Kids Profile/i, "Profiles page must support Kids profile creation");
  assert.match(pageSrc, /Profile Lock/i, "Profiles page must support PIN lock configuration");
  assert.match(pageSrc, /handleUnlockSubmit/, "Profiles page must implement PIN verification handler");
  assert.match(pageSrc, /PRESET_AVATARS/, "Profiles page must offer avatar picker selection");
});

test("Auth redirects navigate to /profiles upon registration and callback", () => {
  const signupPath = path.resolve("app/signup/page.js");
  const signupSrc = fs.readFileSync(signupPath, "utf8");
  assert.match(
    signupSrc,
    /router\.(push|replace)\(["']\/profiles["']\)/,
    "Signup page must redirect user to /profiles"
  );

  const callbackPath = path.resolve("app/auth/callback/page.js");
  const callbackSrc = fs.readFileSync(callbackPath, "utf8");
  assert.match(
    callbackSrc,
    /router\.replace\(["']\/profiles["']\)/,
    "OAuth callback must redirect user to /profiles"
  );
});

test("Phase 1: ContinueWatchingRow and History page scope watch progress by active profile", () => {
  const rowPath = path.resolve("components/ContinueWatchingRow.js");
  const rowSrc = fs.readFileSync(rowPath, "utf8");
  assert.match(rowSrc, /getActiveProfileId/, "ContinueWatchingRow must import and use getActiveProfileId");
  assert.match(rowSrc, /getWatchCache\([^,]+,\s*activePid\)/, "ContinueWatchingRow must query watch cache with active profile ID");
  assert.match(rowSrc, /pullWatchProgress\(activePid\)/, "ContinueWatchingRow must pass active profile ID to pullWatchProgress");

  const histPath = path.resolve("app/history/page.js");
  const histSrc = fs.readFileSync(histPath, "utf8");
  assert.match(histSrc, /getActiveProfileId/, "History page must import and use getActiveProfileId");
  assert.match(histSrc, /syncGet\([`'"]\/api\/sync\/watch-progress\?profileId=/, "History page must request profile-scoped sync");
  assert.match(histSrc, /syncDelete\([`'"]\/api\/sync\/watch-progress\?profileId=/, "History clear-all must only delete records for the active profile");
});

