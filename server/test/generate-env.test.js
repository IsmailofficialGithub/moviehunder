import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { validateAndGenerateEnv } from "../scripts/generate-env.mjs";

test("validateAndGenerateEnv writes valid .env and .dev.vars preserving special characters", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-test-"));
  const sampleEnv = `
# Sample production config
BASE_URL=https://moviebox.ph
APP_CLIENT_KEY=my$secret#key!with@symbols
DATABASE_URL=postgresql://postgres:postgrespassword@127.0.0.1:5432/Test_movies?schema=public
AUTH_JWT_SECRET=super-secure-jwt-secret-that-is-at-least-32-chars-long
APP_PUBLIC_URL=https://offstream.co
GOOGLE_REDIRECT_URI=https://api.offstream.co/api/auth/google/callback
CORS_ALLOWED_ORIGIN_SUFFIXES=offstream.co,ismailabbasi.qzz.io
`;

  const result = validateAndGenerateEnv(sampleEnv, tmpDir);
  assert.equal(result.valid, true);

  const envFile = fs.readFileSync(path.join(tmpDir, ".env"), "utf8");
  const devVars = fs.readFileSync(path.join(tmpDir, ".dev.vars"), "utf8");

  assert.equal(envFile, devVars);
  assert.match(envFile, /APP_CLIENT_KEY=my\$secret#key!with@symbols/);
  assert.match(envFile, /GOOGLE_REDIRECT_URI=https:\/\/api\.offstream\.co\/api\/auth\/google\/callback/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("validateAndGenerateEnv throws error on missing required keys or invalid formats", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-test-fail-"));

  // Missing DATABASE_URL
  assert.throws(
    () => {
      validateAndGenerateEnv("BASE_URL=https://moviebox.ph", tmpDir);
    },
    /Missing required key: DATABASE_URL/
  );

  // Invalid DATABASE_URL protocol
  assert.throws(
    () => {
      validateAndGenerateEnv(
        `
DATABASE_URL=mysql://user:pass@localhost/db
AUTH_JWT_SECRET=short
APP_PUBLIC_URL=https://offstream.co
GOOGLE_REDIRECT_URI=https://api.offstream.co/api/auth/google/callback
CORS_ALLOWED_ORIGIN_SUFFIXES=offstream.co
`,
        tmpDir
      );
    },
    /DATABASE_URL must be a PostgreSQL connection string/
  );

  // AUTH_JWT_SECRET too short
  assert.throws(
    () => {
      validateAndGenerateEnv(
        `
DATABASE_URL=postgresql://postgres:pass@localhost:5432/db
AUTH_JWT_SECRET=too-short
APP_PUBLIC_URL=https://offstream.co
GOOGLE_REDIRECT_URI=https://api.offstream.co/api/auth/google/callback
CORS_ALLOWED_ORIGIN_SUFFIXES=offstream.co
`,
        tmpDir
      );
    },
    /AUTH_JWT_SECRET must be at least 32 characters/
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
