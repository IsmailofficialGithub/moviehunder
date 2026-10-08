#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Validates and writes .env and .dev.vars without shell variable expansion.
 * @param {string} rawContent - Raw text content of the environment file
 * @param {string} targetDir - Directory to write .env and .dev.vars
 */
export function validateAndGenerateEnv(rawContent, targetDir = ".") {
  if (!rawContent || typeof rawContent !== "string" || !rawContent.trim()) {
    throw new Error("RAW_ENV_FILE content is empty or invalid");
  }

  const lines = rawContent.split(/\r?\n/);
  const parsed = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    const val = line.slice(eqIndex + 1);
    parsed[key] = val;
  }

  // 1. Check required keys
  const requiredKeys = [
    "DATABASE_URL",
    "AUTH_JWT_SECRET",
    "APP_PUBLIC_URL",
    "GOOGLE_REDIRECT_URI",
    "CORS_ALLOWED_ORIGIN_SUFFIXES",
  ];

  for (const reqKey of requiredKeys) {
    if (!parsed[reqKey]) {
      throw new Error(`Missing required key: ${reqKey}`);
    }
  }

  // 2. Concrete format validations
  if (!/^postgres(ql)?:\/\/.+/.test(parsed.DATABASE_URL)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string (postgresql://...)");
  }

  if (parsed.AUTH_JWT_SECRET.length < 32) {
    throw new Error("AUTH_JWT_SECRET must be at least 32 characters long for security");
  }

  if (!parsed.CORS_ALLOWED_ORIGIN_SUFFIXES.includes("offstream.co")) {
    throw new Error("CORS_ALLOWED_ORIGIN_SUFFIXES must include 'offstream.co'");
  }

  if (!parsed.GOOGLE_REDIRECT_URI.startsWith("https://api.offstream.co")) {
    throw new Error("GOOGLE_REDIRECT_URI must point to https://api.offstream.co");
  }

  // 3. Write files cleanly preserving raw content
  const cleanedContent = rawContent.trim() + "\n";
  const envPath = path.join(targetDir, ".env");
  const devVarsPath = path.join(targetDir, ".dev.vars");

  fs.writeFileSync(envPath, cleanedContent, "utf8");
  fs.writeFileSync(devVarsPath, cleanedContent, "utf8");

  return {
    valid: true,
    keysCount: Object.keys(parsed).length,
    envPath,
    devVarsPath,
  };
}

// CLI Execution support
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  try {
    const rawContent = process.env.RAW_ENV_FILE;
    if (!rawContent) {
      console.error("ERROR: RAW_ENV_FILE environment variable is not set");
      process.exit(1);
    }
    const result = validateAndGenerateEnv(rawContent, process.cwd());
    console.log(`Successfully generated and validated ${result.envPath} and ${result.devVarsPath} (${result.keysCount} variables)`);
  } catch (err) {
    console.error(`ERROR validating environment: ${err.message}`);
    process.exit(1);
  }
}
