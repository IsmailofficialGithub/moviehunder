import test from "node:test";
import assert from "node:assert/strict";
import robots from "../app/robots.js";
import { metadata as loginMeta } from "../app/login/layout.js";
import { metadata as signupMeta } from "../app/signup/layout.js";
import { metadata as settingsMeta } from "../app/settings/layout.js";
import { metadata as profilesMeta } from "../app/profiles/layout.js";
import { metadata as historyMeta } from "../app/history/layout.js";

test("robots.js allows crawling of login and signup for clean de-indexing", () => {
  const config = robots();
  assert.ok(config.rules, "rules should be defined");
  const rule = config.rules[0] || config.rules;
  
  // /login and /signup must NOT be in disallow array so Googlebot can read noindex
  assert.ok(!rule.disallow.includes("/login"), "robots.txt must not disallow /login");
  assert.ok(!rule.disallow.includes("/signup"), "robots.txt must not disallow /signup");

  // Private routes and player should be disallowed
  assert.ok(rule.disallow.includes("/api/"), "must disallow /api/");
  assert.ok(rule.disallow.includes("/settings/"), "must disallow /settings/");
  assert.ok(rule.disallow.includes("/profiles/"), "must disallow /profiles/");
  assert.ok(rule.disallow.includes("/history/"), "must disallow /history/");
  assert.ok(rule.disallow.includes("/auth/"), "must disallow /auth/");
  assert.ok(rule.disallow.includes("/play"), "must disallow /play");
  assert.ok(rule.disallow.includes("/search"), "must disallow /search");
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { metadata as supportMeta } from "../app/support/layout.js";

test("auth and account pages have robots noindex metadata", () => {
  for (const meta of [loginMeta, signupMeta, settingsMeta, profilesMeta, historyMeta]) {
    assert.strictEqual(meta?.robots?.index, false, "index must be false");
    assert.strictEqual(meta?.robots?.follow, false, "follow must be false");
  }
});

test("canonical tags and player indexing are properly configured", () => {
  // Root layout must NOT set default canonical: siteUrl (which causes all subpages to claim they are the homepage)
  const layoutContent = fs.readFileSync(path.join(__dirname, "../app/layout.js"), "utf-8");
  assert.ok(!layoutContent.includes("canonical: siteUrl"), "Root layout must not define a blanket canonical");
  assert.ok(!layoutContent.includes("canonical:"), "Root layout should not have blanket alternates canonical");

  // Play page must be noindex
  const playContent = fs.readFileSync(path.join(__dirname, "../app/play/page.js"), "utf-8");
  assert.ok(playContent.includes("index: false"), "Play page must have robots.index = false");
  assert.ok(playContent.includes("follow: false"), "Play page must have robots.follow = false");

  // Support page must have self-referential canonical
  assert.strictEqual(supportMeta?.alternates?.canonical, "https://offstream.co/support");
});

test("catalog and movie title pages allow search crawler discovery without SubscriptionGate bounce", () => {
  const categoryView = fs.readFileSync(path.join(__dirname, "../components/CategoryView.js"), "utf-8");
  assert.ok(!categoryView.includes("<SubscriptionGate>"), "CategoryView must not wrap catalog with SubscriptionGate");

  const searchResults = fs.readFileSync(path.join(__dirname, "../components/SearchResultsClient.js"), "utf-8");
  assert.ok(!searchResults.includes("<SubscriptionGate>"), "SearchResultsClient must not wrap search results with SubscriptionGate");

  const titlePage = fs.readFileSync(path.join(__dirname, "../app/title/[slug]/page.js"), "utf-8");
  assert.ok(!titlePage.includes("<SubscriptionGate>"), "TitlePage must not wrap DetailClient with SubscriptionGate");
  assert.ok(titlePage.includes("notFound()"), "TitlePage must call notFound() when title does not exist");
});



