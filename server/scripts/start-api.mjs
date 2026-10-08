/**
 * Ensure .dev.vars exists (copy from .env), then start Wrangler API.
 * Use this under PM2 so bindings are always present.
 */
import { copyFileSync, existsSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
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

function getTreeRssKb(parentPid) {
  try {
    const out = execSync("ps -eo pid,ppid,rss", { encoding: "utf8", timeout: 2000 });
    const lines = out.trim().split("\n").slice(1);
    const pidsByParent = new Map();
    const rssByPid = new Map();
    for (const line of lines) {
      const [pid, ppid, rss] = line.trim().split(/\s+/).map(Number);
      if (!pidsByParent.has(ppid)) pidsByParent.set(ppid, []);
      pidsByParent.get(ppid).push(pid);
      rssByPid.set(pid, rss);
    }
    let totalRss = rssByPid.get(parentPid) || 0;
    const queue = [...(pidsByParent.get(parentPid) || [])];
    while (queue.length) {
      const p = queue.shift();
      totalRss += rssByPid.get(p) || 0;
      if (pidsByParent.has(p)) queue.push(...pidsByParent.get(p));
    }
    return totalRss;
  } catch {
    return 0;
  }
}

// Check every 30 seconds. If workerd + wrangler tree exceeds 650MB,
// proactively and gracefully recycle worker before V8 hits 1.4GB OOM crash.
const MAX_TREE_RSS_KB = 650 * 1024;
let isRecycling = false;

const watchdogInterval = setInterval(() => {
  if (isRecycling || !child.pid) return;
  const rssKb = getTreeRssKb(child.pid);
  if (rssKb > MAX_TREE_RSS_KB) {
    isRecycling = true;
    const mb = Math.round(rssKb / 1024);
    console.warn(`[start-api] Watchdog: worker tree RSS is ${mb}MB (threshold: 650MB). Gracefully recycling worker...`);
    clearInterval(watchdogInterval);
    child.kill("SIGTERM");
    setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      process.exit(0);
    }, 3000);
  }
}, 30_000);

// Forward termination signals gracefully
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    clearInterval(watchdogInterval);
    if (!isRecycling) {
      isRecycling = true;
      child.kill(sig);
    }
  });
}

child.on("exit", (code, signal) => {
  clearInterval(watchdogInterval);
  if (isRecycling) {
    process.exit(0);
  }
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

