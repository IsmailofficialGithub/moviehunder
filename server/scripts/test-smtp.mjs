#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (v && (!process.env[k] || process.env[k] === "")) {
      process.env[k] = v;
    }
  }
}

loadDotEnv(path.join(root, ".env"));
loadDotEnv(path.join(root, ".dev.vars"));

const { sendVerificationEmail, smtpConfigured } = await import("../src/mail.js");

const to = process.argv[2] || process.env.SMTP_USER || "lalagggg786@gmail.com";
console.log("-----------------------------------------");
console.log(" SMTP Test Script");
console.log("-----------------------------------------");
console.log("SMTP_HOST:", process.env.SMTP_HOST || "(not set)");
console.log("SMTP_PORT:", process.env.SMTP_PORT || "(not set)");
console.log("SMTP_SECURE:", process.env.SMTP_SECURE || "(not set)");
console.log("SMTP_USER:", process.env.SMTP_USER || "(not set)");
console.log("SMTP_PASS:", process.env.SMTP_PASS ? `set (${process.env.SMTP_PASS.replace(/\s+/g, "").length} chars)` : "(not set)");
console.log("Target recipient:", to);
console.log("-----------------------------------------");

if (!smtpConfigured()) {
  console.error("❌ ERROR: SMTP is not configured in .env or .dev.vars!");
  process.exit(1);
}

try {
  console.log("Connecting to SMTP server and dispatching test verification email...");
  const result = await sendVerificationEmail({
    to,
    verifyUrl: "https://offstream.co/auth/callback?verify=test-token-123",
  });
  console.log("✅ SUCCESS! Verification email sent successfully.");
  console.log("Result:", result);
  process.exit(0);
} catch (err) {
  console.error("❌ ERROR: Failed to send email via SMTP:");
  console.error(err);
  process.exit(1);
}
