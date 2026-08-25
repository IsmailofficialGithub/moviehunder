/**
 * Start catalog API (:8787) and play relay (:8788) together.
 * Usage: npm run dev
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(root, "..");

const kids = [];

function run(name, command, args, { fatal = true } = {}) {
  const child = spawn(command, args, {
    cwd: serverRoot,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] stopped (${signal})`);
      return;
    }
    if (code !== 0 && code != null) {
      console.error(`[${name}] exited with code ${code}`);
      if (fatal) shutdown(code);
      else console.error(`[${name}] catalog API is still running`);
    }
  });
  kids.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of kids) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("Starting Flick server…");
console.log("  Catalog API  → http://127.0.0.1:8787");
console.log("  Play relay   → http://127.0.0.1:8788");
console.log("");

// --ip 0.0.0.0 so phones on LAN can reach the catalog API
run("api", "npx", ["wrangler", "dev", "--ip", "0.0.0.0", "--port", "8787"], {
  fatal: true,
});
run("relay", "node", ["play-relay.mjs"], { fatal: false });
