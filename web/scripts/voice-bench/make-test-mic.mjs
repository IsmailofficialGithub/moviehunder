// Synthetic test mic: speech-like voiced bursts (glottal harmonics shaped by 3 formants, syllable
// envelope) at quiet / normal / loud levels over constant pink-ish "fan" noise. 48 kHz mono 16-bit.
import fs from "node:fs";
const SR = 48000, DUR = 20;
const N = SR * DUR;
const x = new Float32Array(N);
// pink-ish noise (Voss-like 1-pole sum), -50 dBFS rms
let b0 = 0, b1 = 0, b2 = 0;
const noise = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const w = Math.random() * 2 - 1;
  b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
  noise[i] = b0 + b1 + b2 + w * 0.1848;
}
const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const nG = 10 ** (-50 / 20) / rms(noise);
for (let i = 0; i < N; i++) x[i] = noise[i] * nG;
// bursts: [start s, length s, level dBFS]
const bursts = [[1.0, 1.4, -20], [3.5, 1.0, -36], [5.5, 1.6, -20], [8.2, 0.6, -38], [9.8, 1.4, -15], [12.5, 1.2, -20], [15.0, 0.4, -30], [16.5, 1.8, -17]];
const formants = [[650, 80], [1300, 120], [2600, 180]];
const burstSig = (len, f0) => {
  const n = Math.floor(len * SR), out = new Float32Array(n);
  for (let h = 1; h * f0 < 6000; h++) {
    const f = h * f0;
    let g = 0; for (const [fc, bw] of formants) g += 1 / (1 + ((f - fc) / bw) ** 2);
    g /= h ** 0.5;
    const ph = Math.random() * 6.28;
    for (let i = 0; i < n; i++) out[i] += g * Math.sin(ph + 2 * Math.PI * f * (i / SR) * (1 + 0.04 * Math.sin(2 * Math.PI * 0.7 * i / SR)));
  }
  for (let i = 0; i < n; i++) {
    const t = i / SR; // syllable envelope ~4 Hz, 10 ms fades
    const syl = 0.35 + 0.65 * Math.max(0, Math.sin(Math.PI * 4 * t)) ** 0.6;
    const edge = Math.min(1, t / 0.01, (len - t) / 0.01);
    out[i] *= syl * edge;
  }
  return out;
};
const meta = [];
for (const [s, len, db] of bursts) {
  const sig = burstSig(len, 110 + Math.random() * 60);
  const g = 10 ** (db / 20) / rms(sig);
  const st = Math.floor(s * SR);
  for (let i = 0; i < sig.length; i++) x[st + i] += sig[i] * g;
  meta.push({ start: s, len, db });
}
const buf = Buffer.alloc(44 + N * 2);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
fs.writeFileSync(process.argv[2], buf);
fs.writeFileSync(process.argv[2] + ".json", JSON.stringify(meta));
console.log("wrote", process.argv[2], "peak", x.reduce((m, v) => Math.max(m, Math.abs(v)), 0).toFixed(3));
