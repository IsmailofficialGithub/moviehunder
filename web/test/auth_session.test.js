import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("SiteHeader guards avatar and profile data when not signed in", () => {
  const headerPath = path.resolve("components/SiteHeader.js");
  const content = fs.readFileSync(headerPath, "utf8");

  assert.match(
    content,
    /if\s*\(!isSignedIn\)\s*\{\s*setActiveProfile\(null\);/s,
    "SiteHeader must clear activeProfile when not signed in"
  );
  assert.match(
    content,
    /const\s+userAvatar\s*=\s*isSignedIn\s*\?/,
    "userAvatar must be guarded with isSignedIn"
  );
  assert.match(
    content,
    /const\s+displayName\s*=\s*isSignedIn\s*\?/,
    "displayName must be guarded with isSignedIn"
  );
});

test("Server issues 30-day access TTL and web deduplicates refresh calls", () => {
  const serverAuthPath = path.resolve("../server/src/auth.js");
  const serverAuth = fs.readFileSync(serverAuthPath, "utf8");
  assert.match(
    serverAuth,
    /const\s+ACCESS_TTL\s*=\s*["']30d["']/,
    "server ACCESS_TTL must be 30d"
  );

  const webAuthPath = path.resolve("lib/auth.js");
  const webAuth = fs.readFileSync(webAuthPath, "utf8");
  assert.match(
    webAuth,
    /activeRefreshPromise/,
    "web auth must deduplicate concurrent refreshSession calls"
  );
  assert.match(
    webAuth,
    /localStorage\.removeItem\(["']active_profile["']\)/,
    "clearSession must remove active_profile"
  );
});

test("GuestSignInPrompt is configured with 24-hour browser dismissal and mounted in layout", () => {
  const promptPath = path.resolve("components/GuestSignInPrompt.js");
  assert.ok(fs.existsSync(promptPath), "GuestSignInPrompt.js must exist");
  const content = fs.readFileSync(promptPath, "utf8");

  assert.match(content, /mh\.guest_signin_prompt\.dismissed_at/);
  assert.match(content, /24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);

  const layoutPath = path.resolve("app/layout.js");
  const layoutContent = fs.readFileSync(layoutPath, "utf8");
  assert.match(layoutContent, /<GuestSignInPrompt\s*\/>/);
});

test("Mobile account screen deduplicates auth params and prevents loop", () => {
  const mobileAccountPath = path.resolve("../mobile/app/account.js");
  const content = fs.readFileSync(mobileAccountPath, "utf8");

  assert.match(content, /handledAuthRef/);
  assert.match(content, /router\.setParams/);
});

test("Frontend shields backend origin and proxies auth/sync endpoints same-origin", () => {
  const nextConfigPath = path.resolve("next.config.mjs");
  const nextConfig = fs.readFileSync(nextConfigPath, "utf8");
  assert.match(nextConfig, /async\s+rewrites\(\)/, "next.config.mjs must declare rewrites");
  assert.match(nextConfig, /\/api\/auth\/:path\*/, "next.config.mjs must rewrite /api/auth/:path*");
  assert.match(nextConfig, /\/api\/sync\/:path\*/, "next.config.mjs must rewrite /api/sync/:path*");

  const webAuthPath = path.resolve("lib/auth.js");
  const webAuth = fs.readFileSync(webAuthPath, "utf8");
  assert.match(
    webAuth,
    /typeof\s+window\s*!==\s*["']undefined["'][\s\S]*?return\s*["']["']/,
    "web auth must return empty string in browser context to enforce same-origin requests"
  );
  assert.match(
    webAuth,
    /Service temporarily unavailable/,
    "web auth must sanitize internal/infrastructure errors"
  );

  const webConfigPath = path.resolve("lib/config.js");
  const webConfig = fs.readFileSync(webConfigPath, "utf8");
  assert.match(
    webConfig,
    /typeof\s+window\s*!==\s*["']undefined["'][\s\S]*?return\s*["']["']/,
    "web config getApiBase must shield backend base from browser"
  );
});

