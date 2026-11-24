"use client";

// Cleans the microphone before it is sent to the party:
//   mic (browser echo-cancel / noise-suppress / auto-gain) → high-pass → low-pass → VAD gate → send
//
// • No compressor: Chrome's DynamicsCompressor adds automatic make-up gain on top of the
//   browser's auto-gain, which clipped loud speech ("crackling").
// • VAD gate: sends silence when you are not speaking — removes background "air" noise and
//   speaker bleed. Speech = level above an adaptive noise floor + most energy in 300–3400 Hz,
//   with hysteresis and a hold so words aren't chopped.
// • Echo guard: while someone else is talking, their voice comes out of your speakers and the
//   browser's echo canceller only removes part of it. The gate then needs a much louder (closer)
//   voice to open, so the leftover isn't sent back to them as an echo.

const TICK_MS = 20;
const OPEN_MARGIN_DB = 10; // open: this far above the noise floor
const STAY_MARGIN_DB = 6; // stay open while above floor + this (hysteresis)
const ECHO_GUARD_DB = 12; // extra margin to open while others are talking
const MIN_SPEECH_DB = -55; // and at least this loud (dBFS)
const VOICE_BAND_RATIO = 0.5; // share of energy in 300–3400 Hz needed to count as speech
const HOLD_MS = 450; // keep the gate open this long after the last speech frame
const ATTACK_S = 0.02;
const RELEASE_S = 0.18;
const FLOOR_RISE_DB_PER_TICK = 0.03; // noise floor creeps up ~1.5 dB/s, drops instantly

/**
 * @param {MediaStream} raw  stream from getUserMedia (with browser AEC/NS/AGC)
 * @param {{ onSpeaking?: (speaking: boolean) => void }} [opts]
 * @returns {MediaStream & { setRemoteActive?: (active: boolean) => void }} processed stream;
 *   stopping its track also stops the mic and the audio graph
 */
export function processMic(raw, { onSpeaking } = {}) {
  const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  const rawTrack = raw.getAudioTracks()[0];
  if (!Ctx || !rawTrack) return raw;

  // Match the mic's sample rate so the browser doesn't resample (another source of crackle).
  const micRate = rawTrack.getSettings?.().sampleRate;
  let ctx;
  try {
    ctx = new Ctx(micRate ? { latencyHint: "interactive", sampleRate: micRate } : { latencyHint: "interactive" });
  } catch {
    try {
      ctx = new Ctx({ latencyHint: "interactive" });
    } catch {
      return raw;
    }
  }
  ctx.resume?.().catch(() => {});

  const src = ctx.createMediaStreamSource(raw);

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 90;
  highpass.Q.value = 0.7;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 8000;
  lowpass.Q.value = 0.7;

  const gate = ctx.createGain();
  gate.gain.value = 0;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.2;

  const dest = ctx.createMediaStreamDestination();

  src.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(gate);
  gate.connect(dest);
  lowpass.connect(analyser);

  const time = new Float32Array(analyser.fftSize);
  const freq = new Float32Array(analyser.frequencyBinCount);
  const binHz = ctx.sampleRate / analyser.fftSize;
  const lo = Math.max(1, Math.floor(300 / binHz));
  const hi = Math.min(freq.length - 1, Math.ceil(3400 / binHz));
  const top = Math.min(freq.length - 1, Math.ceil(8000 / binHz));

  let floor = -70;
  let open = false;
  let lastSpeech = 0;
  let remoteActive = false;

  const setOpen = (next) => {
    if (next === open) return;
    open = next;
    const now = ctx.currentTime;
    gate.gain.cancelScheduledValues(now);
    gate.gain.setTargetAtTime(next ? 1 : 0, now, next ? ATTACK_S : RELEASE_S);
    try {
      onSpeaking?.(next);
    } catch {
      /* ignore */
    }
  };

  const tick = () => {
    if (!rawTrack.enabled || rawTrack.readyState !== "live") {
      setOpen(false);
      return;
    }
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
    const ratio = total > 0 ? band / total : 0;

    if (level < floor) floor = level;
    else floor = Math.min(level, floor + FLOOR_RISE_DB_PER_TICK);

    const guard = remoteActive ? ECHO_GUARD_DB : 0;
    const voiced = ratio > VOICE_BAND_RATIO;
    const opens = voiced && level > Math.max(floor + OPEN_MARGIN_DB + guard, MIN_SPEECH_DB + guard);
    const keeps = open && voiced && level > Math.max(floor + STAY_MARGIN_DB + guard, MIN_SPEECH_DB);
    const now = performance.now();
    if (opens || keeps) {
      lastSpeech = now;
      setOpen(true);
    } else if (open && now - lastSpeech > HOLD_MS) {
      setOpen(false);
    }
  };
  const timer = setInterval(tick, TICK_MS);

  const out = dest.stream.getAudioTracks()[0];
  // The voice code toggles `enabled` for mute — mirror it onto the real mic.
  const desc = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, "enabled");
  if (desc?.set && desc?.get) {
    Object.defineProperty(out, "enabled", {
      configurable: true,
      get: () => desc.get.call(out),
      set: (v) => {
        desc.set.call(out, v);
        desc.set.call(rawTrack, v);
      },
    });
  }
  const stopOut = out.stop.bind(out);
  out.stop = () => {
    clearInterval(timer);
    setOpen(false);
    stopOut();
    raw.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };

  const stream = new MediaStream([out]);
  stream.setRemoteActive = (active) => {
    remoteActive = Boolean(active);
  };
  return stream;
}
