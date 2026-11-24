"use client";

// Web voice for a watch party: listen automatically, opt in to the mic, push-to-talk ("V"),
// and duck the movie while other people talk.

import { useCallback, useEffect, useRef, useState } from "react";
import { PartyVoice } from "./voice";
import { watchSpeech } from "./micProcessor";
import { logVoiceStats, voiceDebugEnabled } from "./voiceStats";

const DUCK_TO = 0.3; // movie volume multiplier while someone else is talking

// Phones (iPhone especially): an open WebRTC audio session can silence or re-route the movie's
// sound, so on touch devices voice only connects when the user taps "Join voice".
function autoListenAllowed() {
  if (typeof window === "undefined") return false;
  try {
    return !window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return true;
  }
}
const PTT_KEY = "v";

async function createDevice() {
  const { Device } = await import("mediasoup-client");
  return Device.factory();
}

// Browser-native processing only (AEC + NS + AGC). No extra DSP on the send path — see micProcessor.js.
async function getUserMedia() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    video: false,
  });
  if (voiceDebugEnabled()) {
    // Applied settings can differ from what was requested (device / browser support).
    console.info("[voice] mic settings", stream.getAudioTracks()[0]?.getSettings?.());
  }
  return stream;
}

// Remote voices: one <audio> per voice. If autoplay is blocked (voice connected before any tap),
// retry on the next user gesture instead of staying silent.
const blockedAudio = new Set();
let gestureHooked = false;
function retryBlockedAudio() {
  for (const el of blockedAudio) el.play().then(() => blockedAudio.delete(el)).catch(() => {});
}
function playTrack(_userId, track) {
  const el = new Audio();
  el.autoplay = true;
  el.srcObject = new MediaStream([track]);
  el.play().catch((err) => {
    if (err?.name !== "NotAllowedError") return;
    blockedAudio.add(el);
    if (!gestureHooked && typeof window !== "undefined") {
      gestureHooked = true;
      for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, retryBlockedAudio, { capture: true });
    }
  });
  return () => {
    blockedAudio.delete(el);
    el.pause();
    el.srcObject = null;
  };
}

export function usePartyVoice(party) {
  const [state, setState] = useState({ joined: false, micOn: false, micLive: false, speakers: [], mics: {}, forceMuted: false, error: null });
  const [selfSpeaking, setSelfSpeaking] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const voiceRef = useRef(null);
  const myId = party.you?.userId;
  const ready = party.status === "open" && party.voiceAvailable;

  useEffect(() => {
    if (!ready || voiceRef.current) return;
    const client = party.getClient();
    if (!client) return;
    // The mic is sent untouched (browser AEC/NS/AGC only). Speech detection runs beside it, only to
    // duck the movie while you talk. A lost/unplugged mic turns voice off cleanly.
    const micWithWatch = async () => {
      const stream = await getUserMedia();
      const track = stream.getAudioTracks()[0];
      const stopWatch = watchSpeech(stream, setSelfSpeaking);
      if (track) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          stopWatch();
          stop();
        };
        track.addEventListener("ended", () => {
          stopWatch();
          voiceRef.current?.stopMic().catch(() => {});
          setState((s) => ({ ...s, error: "MIC_LOST" }));
        });
      }
      return stream;
    };
    const v = new PartyVoice({ client, createDevice, getUserMedia: micWithWatch, playTrack, onChange: setState });
    voiceRef.current = v;
    // Desktop: listen-only by default (no mic prompt until the user asks). Phones: wait for a tap.
    if (autoListenAllowed()) v.join().catch(() => {});
  }, [ready, party]);

  useEffect(
    () => () => {
      voiceRef.current?.leave();
      voiceRef.current = null;
    },
    []
  );

  // Push-to-talk: hold V to talk while the mic is enabled in PTT mode.
  useEffect(() => {
    if (!pushToTalk || !state.micLive) return undefined;
    voiceRef.current?.setMic(false);
    const typing = () => {
      const el = document.activeElement;
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const down = (e) => {
      if (e.key?.toLowerCase() !== PTT_KEY || e.repeat || typing()) return;
      voiceRef.current?.setMic(true);
    };
    const up = (e) => {
      if (e.key?.toLowerCase() !== PTT_KEY || typing()) return;
      voiceRef.current?.setMic(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [pushToTalk, state.micLive]);

  // Ducking: lower the movie while someone else is speaking, restore after.
  const duckRef = useRef(null); // { original, ducked }
  const remoteTalking = state.speakers.some((id) => id !== myId);

  // Opt-in diagnostics: localStorage.partyVoiceDebug = "1" logs WebRTC stats every 5 s.
  useEffect(() => {
    if (!state.joined || !voiceDebugEnabled()) return undefined;
    const iv = setInterval(() => logVoiceStats(voiceRef.current).catch(() => {}), 5000);
    return () => clearInterval(iv);
  }, [state.joined]);

  // Also duck while *you* talk, so less movie sound leaks from your speakers into your mic.
  const othersTalking = remoteTalking || selfSpeaking;
  useEffect(() => {
    const video = party.getVideo();
    if (!video) return;
    if (othersTalking && !duckRef.current && !video.muted) {
      const original = video.volume;
      const ducked = original * DUCK_TO;
      duckRef.current = { original, ducked };
      video.volume = ducked;
    } else if (!othersTalking && duckRef.current) {
      const { original, ducked } = duckRef.current;
      duckRef.current = null;
      // Only restore if the user didn't change the volume meanwhile.
      if (Math.abs(video.volume - ducked) < 0.01) video.volume = original;
    }
  }, [othersTalking, party]);

  const startMic = useCallback(async () => {
    try {
      await voiceRef.current?.startMic();
    } catch (err) {
      const code = err?.name === "NotAllowedError" ? "MIC_BLOCKED" : err?.code || err?.message;
      setState((s) => ({ ...s, error: code }));
    }
  }, []);

  return {
    available: ready,
    ...state,
    deferred: !state.joined && !autoListenAllowed(),
    pushToTalk,
    setPushToTalk,
    startMic,
    toggleMic: () => voiceRef.current?.setMic(!state.micOn),
    stopMic: () => voiceRef.current?.stopMic(),
    hostMute: (userId, muted = true) => voiceRef.current?.hostMute(userId, muted).catch(() => {}),
  };
}
