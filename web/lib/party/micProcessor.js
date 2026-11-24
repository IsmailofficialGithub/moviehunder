"use client";

// Cleans the microphone before it is sent to the party:
//   mic → high-pass (rumble/hum) → low-pass (hiss) → compressor (even level) → VAD gate → send
//
// The VAD gate sends silence whenever you are not speaking, which removes background "air"
// noise and most of the movie/other voices leaking from your speakers into the mic (the
// "repeats" people hear). Speech is detected from level above an adaptive noise floor plus how
// much of the energy sits in the voice band (300–3400 Hz), with a short hold so words aren't cut.

const TICK_MS = 20;
const OPEN_MARGIN_DB = 9; // speech must be this far above the noise floor
const MIN_SPEECH_DB = -58; // and at least this loud (dBFS)
const VOICE_BAND_RATIO = 0.45; // share of energy in 300–3400 Hz needed to count as speech
const HOLD_MS = 380; // keep the gate open this long after the last speech frame
const ATTACK_S = 0.012;
const RELEASE_S = 0.12;
const FLOOR_RISE_DB_PER_TICK = 0.03; // noise floor creeps up ~1.5 dB/s, drops instantly

/**
 * @param {MediaStream} raw  stream from getUserMedia (already with browser AEC/NS/AGC)
 * @param {{ onSpeaking?: (speaking: boolean) => void }} [opts]
 * @returns {MediaStream} processed stream; stopping its track also stops the mic and the graph
 */
export function processMic(raw, { onSpeaking } = {}) {
  const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  const rawTrack = raw.getAudioTracks()[0];
  if (!Ctx || !rawTrack) return raw;

  let ctx;
  try {
    ctx = new Ctx({ latencyHint: "interactive" });
  } catch {
    return raw;
  }
  ctx.resume?.().catch(() => {});

  const src = ctx.createMediaStreamSource(raw);

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 100;
  highpass.Q.value = 0.7;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7500;
  lowpass.Q.value = 0.7;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -26;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;

  const gate = ctx.createGain();
  gate.gain.value = 0;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.2;

  const dest = ctx.createMediaStreamDestination();

  src.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(gate);
  gate.connect(dest);
  lowpass.connect(analyser); // detect on the filtered (pre-compressor) signal

  const time = new Float32Array(analyser.fftSize);
  const freq = new Float32Array(analyser.frequencyBinCount);
  const binHz = ctx.sampleRate / analyser.fftSize;
  const lo = Math.max(1, Math.floor(300 / binHz));
  const hi = Math.min(freq.length - 1, Math.ceil(3400 / binHz));
  const top = Math.min(freq.length - 1, Math.ceil(7500 / binHz));

  let floor = -70;
  let open = false;
  let lastSpeech = 0;

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

    const speech = level > Math.max(floor + OPEN_MARGIN_DB, MIN_SPEECH_DB) && ratio > VOICE_BAND_RATIO;
    const now = performance.now();
    if (speech) {
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

  return new MediaStream([out]);
}
