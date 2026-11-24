"use client";

// Speech *detection* for your own mic — used only to duck the movie while you talk.
//
// It never touches the audio that is sent. The browser's own processing (echo cancellation,
// noise suppression, auto gain — requested in getUserMedia) is the only DSP on the send path.
//
// Why: measured in headless Chrome with a synthetic speech-over-fan-noise mic
// (see web/scripts/voice-bench/), browser noise suppression alone already brings the fan
// to about -69 dBFS. An extra gate in the send path removed almost nothing audible but cut the
// start of words by 113–124 ms on average (up to ~580 ms) and dropped ~10 % of speech frames;
// an extra compressor added make-up gain on top of the browser AGC (clipping/"crackle").

const TICK_MS = 50;
const OPEN_MARGIN_DB = 10; // speaking: this far above the adaptive noise floor
const MIN_SPEECH_DB = -55;
const VOICE_BAND_RATIO = 0.5; // share of energy in 300–3400 Hz
const HOLD_MS = 600;
const FLOOR_RISE_DB_PER_TICK = 0.075; // ~1.5 dB/s

/**
 * Watch a mic stream and report when you start/stop speaking. Detection only.
 * @param {MediaStream} stream
 * @param {(speaking: boolean) => void} onSpeaking
 * @returns {() => void} stop
 */
export function watchSpeech(stream, onSpeaking) {
  const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  const track = stream?.getAudioTracks?.()[0];
  if (!Ctx || !track) return () => {};
  let ctx;
  try {
    ctx = new Ctx({ latencyHint: "playback" });
  } catch {
    return () => {};
  }
  ctx.resume?.().catch(() => {});
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.3;
  src.connect(analyser); // analyser only — not connected to any output

  const time = new Float32Array(analyser.fftSize);
  const freq = new Float32Array(analyser.frequencyBinCount);
  const binHz = ctx.sampleRate / analyser.fftSize;
  const lo = Math.max(1, Math.floor(300 / binHz));
  const hi = Math.min(freq.length - 1, Math.ceil(3400 / binHz));
  const top = Math.min(freq.length - 1, Math.ceil(8000 / binHz));

  let floor = -70;
  let speaking = false;
  let last = 0;
  const set = (v) => {
    if (v === speaking) return;
    speaking = v;
    try {
      onSpeaking(v);
    } catch {
      /* ignore */
    }
  };

  const timer = setInterval(() => {
    if (!track.enabled || track.readyState !== "live") return set(false);
    analyser.getFloatTimeDomainData(time);
    let sum = 0;
    for (let i = 0; i < time.length; i++) sum += time[i] * time[i];
    const level = 10 * Math.log10(sum / time.length + 1e-12);
    analyser.getFloatFrequencyData(freq);
    let band = 0;
    let total = 0;
    for (let i = 1; i <= top; i++) {
      const p = 10 ** (freq[i] / 10);
      total += p;
      if (i >= lo && i <= hi) band += p;
    }
    if (level < floor) floor = level;
    else floor = Math.min(level, floor + FLOOR_RISE_DB_PER_TICK);
    const now = performance.now();
    if (level > Math.max(floor + OPEN_MARGIN_DB, MIN_SPEECH_DB) && total > 0 && band / total > VOICE_BAND_RATIO) {
      last = now;
      set(true);
    } else if (speaking && now - last > HOLD_MS) {
      set(false);
    }
  }, TICK_MS);

  return () => {
    clearInterval(timer);
    set(false);
    try {
      src.disconnect();
    } catch {
      /* ignore */
    }
    ctx.close().catch(() => {});
  };
}
