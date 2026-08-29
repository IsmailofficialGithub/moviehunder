#!/usr/bin/env node
/**
 * MovieHunter release pipeline
 *
 *   npm run release:new
 *
 * Flow:
 *  1. Ensure GitHub CLI auth (or GH_TOKEN / GITHUB_TOKEN / GH_SEEKER in .env)
 *  2. Bump app version + android versionCode in app.json
 *  3. EAS production build (wait until finished)
 *  4. Download artifact into Release_app/apk or Release_app/ios
 *  5. Update version.json (repo root, web/public, version.example.json)
 *  6. Create GitHub release with the renamed artifact
 *  7. Commit + push version files so raw.githubusercontent.com updates
 *
 * Env (mobile/.env or repo root .env):
 *   GH_TOKEN | GITHUB_TOKEN | GH_SEEKER  — required if `gh auth` is not logged in
 *   GITHUB_REPO                          — default IsmailofficialGithub/moviehunder
 *   EAS_PROFILE                          — default production
 *   RELEASE_PLATFORM                     — android | ios | all (default android)
 *   RELEASE_NOTES                        — optional release notes override
 *
 * Flags:
 *   --platform android|ios|all
 *   --skip-build          skip EAS; use newest file already in Release_app/...
 *   --from-eas            skip rebuild; download latest finished EAS artifact
 *   --no-bump             keep current app.json version (use with --from-eas)
 *   --no-push             update files + GitHub release, but do not git push
 *   --force-update        set android.force=true in version.json
 *   --notes "text"
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(MOBILE_ROOT, "..");

const APP_JSON_PATH = path.join(MOBILE_ROOT, "app.json");
const RELEASE_ROOT = path.join(MOBILE_ROOT, "Release_app");
const VERSION_PATHS = [
  path.join(REPO_ROOT, "version.json"),
  path.join(REPO_ROOT, "web", "public", "version.json"),
  path.join(MOBILE_ROOT, "version.example.json"),
];
const RELEASE_METADATA_PATH = path.join(REPO_ROOT, "release-metadata.json");

function parseArgs(argv) {
  const out = {
    platform: process.env.RELEASE_PLATFORM || "android",
    skipBuild: false,
    fromEas: false,
    noBump: false,
    noPush: false,
    forceUpdate: false,
    notes: process.env.RELEASE_NOTES || "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--skip-build") out.skipBuild = true;
    else if (a === "--from-eas") out.fromEas = true;
    else if (a === "--no-bump") out.noBump = true;
    else if (a === "--no-push") out.noPush = true;
    else if (a === "--force-update") out.forceUpdate = true;
    else if (a === "--platform" && argv[i + 1]) {
      out.platform = String(argv[++i]).toLowerCase();
    } else if (a === "--notes" || a.startsWith("--notes=")) {
      if (a.startsWith("--notes=") && a.length > "--notes=".length) {
        out.notes = a.slice("--notes=".length);
      } else {
        const parts = [];
        while (i + 1 < argv.length && !String(argv[i + 1]).startsWith("--")) {
          parts.push(argv[++i]);
        }
        out.notes = parts.join(" ");
      }
    } else if (a.startsWith("--platform=")) {
      out.platform = a.slice("--platform=".length).toLowerCase();
    }
  }
  if (!["android", "ios", "all"].includes(out.platform)) {
    fail(`Invalid --platform ${out.platform} (use android|ios|all)`);
  }
  return out;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

function loadEnvFiles() {
  loadEnvFile(path.join(MOBILE_ROOT, ".env"));
  loadEnvFile(path.join(REPO_ROOT, ".env"));
  // Optional dedicated release secrets file (copy from release.env.example)
  loadEnvFile(path.join(MOBILE_ROOT, "release.env"));
}

function log(msg) {
  console.log(`[release] ${msg}`);
}

function fail(msg) {
  console.error(`[release] ERROR: ${msg}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  // On Windows, npm/npx shims need shell or *.cmd; never shell+path with spaces.
  const isWin = process.platform === "win32";
  let command = cmd;
  let useShell = Boolean(opts.shell);
  if (isWin && !useShell) {
    const base = path.basename(String(cmd)).toLowerCase();
    if (base === "npx") {
      command = "npx.cmd";
      useShell = true;
    } else if (base === "npm") {
      command = "npm.cmd";
      useShell = true;
    } else if (base === "eas") {
      // eas.cmd from npm global
      command = which("eas") || "eas.cmd";
      useShell = !path.isAbsolute(command) || !/\s/.test(command);
      if (/\s/.test(command)) {
        // Path has spaces — run via cmd /c with quotes
        return runCmdQuoted(command, args, opts);
      }
    }
  }

  const res = spawnSync(command, args, {
    cwd: opts.cwd || MOBILE_ROOT,
    env: { ...process.env, ...(opts.env || {}) },
    encoding: "utf8",
    shell: useShell,
    windowsHide: true,
    stdio: opts.stdio || "pipe",
  });
  if (opts.allowFail) return res;
  if (res.error) fail(`${cmd} failed to start: ${res.error.message}`);
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").trim();
    fail(`${cmd} ${args.join(" ")} failed (exit ${res.status})\n${err}`);
  }
  return res;
}

function runCmdQuoted(exe, args, opts = {}) {
  const quoted = `"${exe}" ${args.map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(" ")}`;
  const res = spawnSync(quoted, {
    cwd: opts.cwd || MOBILE_ROOT,
    env: { ...process.env, ...(opts.env || {}) },
    encoding: "utf8",
    shell: true,
    windowsHide: true,
    stdio: opts.stdio || "pipe",
  });
  if (opts.allowFail) return res;
  if (res.error) fail(`${exe} failed to start: ${res.error.message}`);
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").trim();
    fail(`${exe} failed (exit ${res.status})\n${err}`);
  }
  return res;
}

function which(bin) {
  const res = spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
    encoding: "utf8",
    shell: true,
    windowsHide: true,
  });
  return res.status === 0 ? String(res.stdout || "").split(/\r?\n/)[0].trim() : "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readReleaseMetadata(version) {
  if (!fs.existsSync(RELEASE_METADATA_PATH)) return null;
  try {
    const data = readJson(RELEASE_METADATA_PATH);
    const key = String(version || "").replace(/^v/i, "");
    const metadata = data?.releases?.[key];
    return metadata && typeof metadata === "object" ? metadata : null;
  } catch {
    return null;
  }
}

function notesFromMetadata(metadata) {
  if (!metadata) return "";
  const labels = [
    ["Added", metadata.added],
    ["Changed", metadata.changed],
    ["Fixed", metadata.fixed],
    ["Removed", metadata.removed],
  ];
  return [
    metadata.summary ? String(metadata.summary) : "",
    ...labels.flatMap(([label, values]) =>
      Array.isArray(values) && values.length
        ? [`\n${label}`, ...values.map((value) => `- ${value}`)]
        : []
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

function bumpSemverPatch(version) {
  const clean = String(version || "0.0.0").replace(/^v/i, "");
  const parts = clean.split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.slice(0, 3).join(".");
}

function ensureGhAuth() {
  loadEnvFiles();

  const token =
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_SEEKER ||
    "";

  if (token) {
    process.env.GH_TOKEN = token;
    process.env.GITHUB_TOKEN = token;
    log("Using GH token from env (.env / release.env: GH_TOKEN | GITHUB_TOKEN | GH_SEEKER)");
    return { token };
  }

  // Prefer bare `gh` on PATH (shell-less). Full path + shell breaks on "Program Files".
  const ghPath = which("gh");
  const status = run("gh", ["auth", "status"], { allowFail: true });
  const loggedIn =
    status.status === 0 ||
    /logged in to github\.com/i.test(
      `${status.stdout || ""}\n${status.stderr || ""}`
    );

  if (loggedIn || ghPath) {
    // Double-check via full path without shell if bare gh failed oddly
    if (!loggedIn && ghPath) {
      const again = run(ghPath, ["auth", "status"], { allowFail: true });
      const ok =
        again.status === 0 ||
        /logged in to github\.com/i.test(
          `${again.stdout || ""}\n${again.stderr || ""}`
        );
      if (!ok) {
        fail(
          "GitHub is not connected.\n" +
            "  Option A: run  gh auth login\n" +
            "  Option B: copy mobile/release.env.example → mobile/release.env and set GH_TOKEN=..."
        );
      }
    }
    log("GitHub CLI already authenticated");
    return { token: "" };
  }

  fail(
    "GitHub is not connected.\n" +
      "  Option A: run  gh auth login\n" +
      "  Option B: copy mobile/release.env.example → mobile/release.env and set GH_TOKEN=..."
  );
}

function githubRepo() {
  const fromEnv = String(process.env.GITHUB_REPO || "").trim();
  if (fromEnv) return fromEnv.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "");

  const remote = run("git", ["remote", "get-url", "origin"], {
    cwd: REPO_ROOT,
    allowFail: true,
  });
  if (remote.status === 0) {
    const url = String(remote.stdout || "").trim();
    const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/i);
    if (m) return m[1].replace(/\\/g, "/");
  }
  return "IsmailofficialGithub/moviehunder";
}

function easBin() {
  if (which("eas")) return "eas";
  return "npx";
}

function easArgs(extra) {
  const bin = easBin();
  if (bin === "eas") return extra;
  return ["eas-cli", ...extra];
}

function bumpAppJson() {
  const app = readJson(APP_JSON_PATH);
  const prev = app.expo?.version || "0.0.0";
  const next = bumpSemverPatch(prev);
  const prevCode = Number(app.expo?.android?.versionCode || 0);
  const nextCode = prevCode + 1;

  app.expo.version = next;
  app.expo.android = app.expo.android || {};
  app.expo.android.versionCode = nextCode;

  writeJson(APP_JSON_PATH, app);
  log(`Bumped app.json  ${prev} (code ${prevCode}) → ${next} (code ${nextCode})`);
  return { version: next, versionCode: nextCode, previousVersion: prev };
}

function ensureReleaseDirs() {
  fs.mkdirSync(path.join(RELEASE_ROOT, "apk"), { recursive: true });
  fs.mkdirSync(path.join(RELEASE_ROOT, "ios"), { recursive: true });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(res.headers.location, destPath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Download failed HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(destPath)));
    });
    req.on("error", (err) => {
      try {
        file.close();
        fs.unlinkSync(destPath);
      } catch {
        /* ignore */
      }
      reject(err);
    });
  });
}

function parseBuildJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  for (const open of ["[", "{"]) {
    const start = text.indexOf(open);
    if (start < 0) continue;
    const close = open === "[" ? "]" : "}";
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  const startObj = text.lastIndexOf("{");
  const startArr = text.lastIndexOf("[");
  const start = Math.max(startObj, startArr);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

function artifactUrlFromBuild(build) {
  if (!build || typeof build !== "object") return "";
  return (
    build.artifacts?.buildUrl ||
    build.artifacts?.applicationArchiveUrl ||
    build.applicationArchiveUrl ||
    build.buildUrl ||
    ""
  );
}

function easJson(args) {
  const bin = easBin();
  const res = run(bin, easArgs([...args, "--json", "--non-interactive"]), {
    stdio: ["ignore", "pipe", "pipe"],
    allowFail: true,
  });
  const combined = `${res.stdout || ""}\n${res.stderr || ""}`;
  const parsed = parseBuildJson(res.stdout) || parseBuildJson(combined);
  if (res.status !== 0 && !parsed) {
    fail(
      `eas ${args.join(" ")} failed (exit ${res.status})\n${(res.stderr || res.stdout || "").trim()}`
    );
  }
  return parsed;
}

function latestFinishedBuild(platform) {
  const profile = process.env.EAS_PROFILE || "production";
  const list = easJson([
    "build:list",
    "--platform",
    platform,
    "--status",
    "finished",
    "--limit",
    "1",
    "--build-profile",
    profile,
  ]);
  const build = Array.isArray(list) ? list[0] : list;
  if (!build?.id) {
    fail(`No finished EAS ${platform} build found for profile=${profile}`);
  }
  const url = artifactUrlFromBuild(build);
  if (!url) {
    fail(`EAS build ${build.id} has no artifact URL yet. Retry with --from-eas`);
  }
  log(`Using EAS build ${build.id}`);
  return { build, url };
}

function readAppVersion() {
  const app = readJson(APP_JSON_PATH);
  return {
    version: String(app.expo?.version || "0.0.0").replace(/^v/i, ""),
    versionCode: Number(app.expo?.android?.versionCode || 0),
  };
}

function runEasBuild(platform) {
  const profile = process.env.EAS_PROFILE || "production";
  log(`Starting EAS ${platform} build (profile=${profile}) — waiting until finished…`);
  const bin = easBin();
  run(
    bin,
    easArgs([
      "build",
      "--platform",
      platform,
      "--profile",
      profile,
      "--non-interactive",
      "--wait",
    ]),
    { stdio: "inherit" }
  );
  return latestFinishedBuild(platform);
}

async function saveArtifact(platform, version, url) {
  ensureReleaseDirs();
  const isIos = platform === "ios";
  const dir = path.join(RELEASE_ROOT, isIos ? "ios" : "apk");
  const ext = isIos ? "ipa" : "apk";
  const fileName = `moviehunter-${version}.${ext}`;
  const dest = path.join(dir, fileName);

  log(`Downloading → ${path.relative(REPO_ROOT, dest)}`);
  await downloadFile(url, dest);
  const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
  log(`Saved ${fileName} (${sizeMb} MB)`);
  return { dest, fileName, platform };
}

function findLocalArtifact(platform, version) {
  const isIos = platform === "ios";
  const dir = path.join(RELEASE_ROOT, isIos ? "ios" : "apk");
  const preferred = path.join(
    dir,
    `moviehunter-${version}.${isIos ? "ipa" : "apk"}`
  );
  if (fs.existsSync(preferred)) return preferred;
  if (!fs.existsSync(dir)) return "";
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(isIos ? ".ipa" : ".apk"))
    .map((f) => ({
      f,
      t: fs.statSync(path.join(dir, f)).mtimeMs,
    }))
    .sort((a, b) => b.t - a.t);
  return files[0] ? path.join(dir, files[0].f) : "";
}

function writeVersionFiles({
  version,
  versionCode,
  apkUrl,
  ipaUrl,
  notes,
  metadata,
  force,
}) {
  const payload = {
    latest_version: version,
    min_supported_version: version,
    release_notes: notes || `MovieHunter v${version}`,
    release_metadata: metadata || {},
    android: {
      version_code: versionCode,
      apk_url: apkUrl || "",
      force: Boolean(force),
    },
  };
  if (ipaUrl) {
    payload.ios = {
      ipa_url: ipaUrl,
    };
  }

  for (const filePath of VERSION_PATHS) {
    writeJson(filePath, payload);
    log(`Updated ${path.relative(REPO_ROOT, filePath)}`);
  }
  return payload;
}

function createGithubRelease({ repo, version, notes, files }) {
  const tag = `v${version}`;
  const gh = "gh";
  const title = `MovieHunter v${version}`;
  const body = notes || `MovieHunter v${version}`;

  // Replace assets if tag already exists (re-run safe)
  const exists = run(gh, ["release", "view", tag, "-R", repo], { allowFail: true });
  if (exists.status === 0) {
    log(`Release ${tag} already exists — uploading/replacing assets`);
    for (const file of files) {
      const name = path.basename(file);
      run(gh, ["release", "upload", tag, `${file}#${name}`, "-R", repo, "--clobber"]);
    }
    run(gh, [
      "release",
      "edit",
      tag,
      "-R",
      repo,
      "--title",
      title,
      "--notes",
      body,
      "--latest",
    ]);
  } else {
    const args = [
      "release",
      "create",
      tag,
      ...files.map((f) => `${f}#${path.basename(f)}`),
      "-R",
      repo,
      "--title",
      title,
      "--notes",
      body,
      "--latest",
    ];
    run(gh, args);
  }
  const url = `https://github.com/${repo}/releases/tag/${tag}`;
  log(`GitHub release: ${url}`);
  return { tag, url };
}

function gitCommitAndPush(version, noPush) {
  const relFiles = [
    "version.json",
    "web/public/version.json",
    "mobile/version.example.json",
    "mobile/app.json",
  ];
  run("git", ["add", ...relFiles], { cwd: REPO_ROOT, allowFail: true });
  const status = run("git", ["status", "--porcelain", ...relFiles], {
    cwd: REPO_ROOT,
    allowFail: true,
  });
  if (!String(status.stdout || "").trim()) {
    log("No version file changes to commit");
    return;
  }
  run(
    "git",
    ["commit", "-m", `Release MovieHunter v${version}`],
    { cwd: REPO_ROOT }
  );
  if (noPush) {
    log("Skipped git push (--no-push)");
    return;
  }
  run("git", ["push", "origin", "HEAD"], { cwd: REPO_ROOT });
  log("Pushed version bump to origin");
}

async function releasePlatform(platform, version, opts) {
  if (opts.skipBuild) {
    const local = findLocalArtifact(platform, version);
    if (!local) {
      fail(
        `--skip-build set but no ${platform} artifact in Release_app/${platform === "ios" ? "ios" : "apk"}`
      );
    }
    const fileName = path.basename(local);
    const expected = `moviehunter-${version}.${platform === "ios" ? "ipa" : "apk"}`;
    let dest = local;
    if (fileName !== expected) {
      dest = path.join(path.dirname(local), expected);
      fs.copyFileSync(local, dest);
      log(`Renamed/copied to ${expected}`);
    }
    return { dest, fileName: path.basename(dest), platform };
  }

  if (opts.fromEas) {
    const { url } = latestFinishedBuild(platform);
    return saveArtifact(platform, version, url);
  }

  const { url } = runEasBuild(platform);
  return saveArtifact(platform, version, url);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  ensureGhAuth();
  const repo = githubRepo();
  log(`Repo: ${repo}`);
  ensureReleaseDirs();

  const { version, versionCode } = opts.noBump ? readAppVersion() : bumpAppJson();
  if (opts.noBump) {
    log(`Using existing app.json version ${version} (code ${versionCode})`);
  }

  const metadata = readReleaseMetadata(version);
  const notes = opts.notes || notesFromMetadata(metadata) || `MovieHunter v${version}`;

  const platforms =
    opts.platform === "all" ? ["android", "ios"] : [opts.platform];

  const artifacts = [];
  for (const p of platforms) {
    artifacts.push(await releasePlatform(p, version, opts));
  }

  const apk = artifacts.find((a) => a.platform === "android");
  const ipa = artifacts.find((a) => a.platform === "ios");
  const tag = `v${version}`;
  const apkUrl = apk
    ? `https://github.com/${repo}/releases/download/${tag}/${apk.fileName}`
    : "";
  const ipaUrl = ipa
    ? `https://github.com/${repo}/releases/download/${tag}/${ipa.fileName}`
    : "";

  writeVersionFiles({
    version,
    versionCode,
    apkUrl,
    ipaUrl,
    notes,
    metadata,
    force: opts.forceUpdate,
  });

  createGithubRelease({
    repo,
    version,
    notes,
    files: artifacts.map((a) => a.dest),
  });

  gitCommitAndPush(version, opts.noPush);

  log("Done.");
  log(`Install / update from: ${apkUrl || ipaUrl}`);
}

const invokedAsMain = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedAsMain) {
  main().catch((err) => {
    fail(err?.stack || err?.message || String(err));
  });
}