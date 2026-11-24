// Voice DSP bench — measures what a mic processing step does to speech, objectively.
//   node make-test-mic.mjs /tmp/bench/test.wav
//   node run-bench.mjs /tmp/bench name=path/to/processor.js [...]
// Each processor file must export processMic(rawStream) → MediaStream. Prints, per variant vs the
// browser-native mic: speech frames kept, word-onset loss, noise passed, peak, clipping, RMS.
// Headless Chrome: fake mic = test.wav (browser AEC/NS/AGC on), record raw + each processor
// variant from the SAME captured stream (aligned), then compare frame by frame.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core  CHROME=/usr/bin/google-chrome
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const dir = process.argv[2];
const variants = process.argv.slice(3); // name=path.js
const toScript = (name, file) =>
  "(() => {" + fs.readFileSync(file, "utf8").replace(/^"use client";/m, "").replace("export function processMic", `window["${name}"] = function processMic`) + "\n})();";

const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${dir}/test.wav`, "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
await page.route("https://audio.test/**", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>t</title>" }));
await page.goto("https://audio.test/");
for (const v of variants) { const [n, f] = v.split("="); await page.addScriptTag({ content: toScript(n, f) }); }
const out = await page.evaluate(async ({ names, seconds }) => {
  const raw = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  const settings = raw.getAudioTracks()[0].getSettings();
  const streams = { raw };
  for (const n of names) streams[n] = window[n](raw.clone ? raw : raw);
  const ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.resume();
  const rec = {};
  const sink = ctx.createGain(); sink.gain.value = 0; sink.connect(ctx.destination);
  for (const [k, s] of Object.entries(streams)) {
    rec[k] = [];
    const src = ctx.createMediaStreamSource(s);
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    sp.onaudioprocess = (e) => rec[k].push(Float32Array.from(e.inputBuffer.getChannelData(0)));
    src.connect(sp); sp.connect(sink);
  }
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const res = { settings, sampleRate: ctx.sampleRate };
  for (const [k, chunks] of Object.entries(rec)) {
    const n = chunks.reduce((a, c) => a + c.length, 0), all = new Float32Array(n);
    let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    res[k] = Array.from(all);
  }
  return res;
}, { names: variants.map((v) => v.split("=")[0]), seconds: 22 });
await browser.close();

// ── analysis ──
const SR = out.sampleRate, F = Math.round(0.02 * SR);
const frames = (a) => { const r = []; for (let i = 0; i + F <= a.length; i += F) { let s = 0; for (let j = 0; j < F; j++) s += a[i + j] ** 2; r.push(10 * Math.log10(s / F + 1e-12)); } return r; };
const raw = frames(out.raw);
const sorted = [...raw].sort((a, b) => a - b);
const floor = sorted[Math.floor(sorted.length * 0.1)];
const speech = raw.map((l) => l > floor + 12);
// contiguous speech runs >= 100 ms
const runs = []; let st = -1;
speech.forEach((s, i) => { if (s && st < 0) st = i; if ((!s || i === speech.length - 1) && st >= 0) { if (i - st >= 5) runs.push([st, i]); st = -1; } });
console.log("applied mic settings:", JSON.stringify(out.settings));
console.log(`raw noise floor ${floor.toFixed(1)} dBFS, speech runs detected: ${runs.length}`);
const report = (name, sig) => {
  const L = frames(sig);
  let kept = 0, sp = 0, leak = 0, ns = 0;
  for (let i = 0; i < Math.min(L.length, raw.length); i++) {
    if (speech[i]) { sp++; if (L[i] >= raw[i] - 6) kept++; }
    else { ns++; if (L[i] > raw[i] - 10) leak++; }
  }
  const onsets = runs.map(([a, b]) => { for (let i = a; i < b; i++) if (L[i] >= raw[i] - 6) return (i - a) * 20; return (b - a) * 20; });
  let peak = 0, clip = 0, sum = 0;
  for (const v of sig) { const a = Math.abs(v); if (a > peak) peak = a; if (a >= 0.99) clip++; sum += v * v; }
  const quietRuns = runs.filter(([a, b]) => Math.max(...raw.slice(a, b)) < floor + 25);
  const quietKept = quietRuns.map(([a, b]) => { let k = 0; for (let i = a; i < b; i++) if (L[i] >= raw[i] - 6) k++; return k / (b - a); });
  console.log(
    `${name.padEnd(14)} speech kept ${(100 * kept / sp).toFixed(1)}% | quiet-speech kept ${quietKept.length ? (100 * quietKept.reduce((a, b) => a + b, 0) / quietKept.length).toFixed(0) + "%" : "n/a"} | ` +
    `onset lost avg ${(onsets.reduce((a, b) => a + b, 0) / onsets.length).toFixed(0)} ms max ${Math.max(...onsets)} ms | ` +
    `noise passed ${(100 * leak / ns).toFixed(1)}% | peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS | clipped ${(100 * clip / sig.length).toFixed(3)}% | rms ${(10 * Math.log10(sum / sig.length)).toFixed(1)} dBFS`
  );
};
report("raw(native)", out.raw);
for (const v of variants) { const n = v.split("=")[0]; report(n, out[n]); }
