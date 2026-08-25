/**
 * Ensure .dev.vars exists (copy from .env), then start Wrangler API.
 * Use this under PM2 so bindings are always present.
 */
import { copyFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const devVars = path.join(root, ".dev.vars");

if (existsSync(envPath)) {
  copyFileSync(envPath, devVars);
  console.log("[start-api] synced .env → .dev.vars");
} else if (!existsSync(devVars)) {
  console.error("[start-api] Missing .env and .dev.vars — copy .env.example first");
  process.exit(1);
}

const child = spawn(
  "node",
  [
    path.join(root, "node_modules/wrangler/bin/wrangler.js"),
    "dev",
    "--port",
    "8787",
    "--ip",
    "0.0.0.0",
  ],
  { cwd: root, stdio: "inherit", env: process.env }
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
