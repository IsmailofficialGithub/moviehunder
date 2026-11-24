"use client";

// Web voice for a watch party: listen automatically, opt in to the mic, push-to-talk ("V"),
// and duck the movie while other people talk.

import { useCallback, useEffect, useRef, useState } from "react";
import { PartyVoice } from "./voice";

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

function getUserMedia() {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    video: false,
  });
}

function playTrack(_userId, track) {
  const el = new Audio();
  el.autoplay = true;
  el.srcObject = new MediaStream([track]);
  el.play().catch(() => {});
  return () => {
    el.pause();
    el.srcObject = null;
  };
}

export function usePartyVoice(party) {
  const [state, setState] = useState({ joined: false, micOn: false, micLive: false, speakers: [], mics: {}, forceMuted: false, error: null });
  const [pushToTalk, setPushToTalk] = useState(false);
  const voiceRef = useRef(null);
  const myId = party.you?.userId;
  const ready = party.status === "open" && party.voiceAvailable;

  useEffect(() => {
    if (!ready || voiceRef.current) return;
    const client = party.getClient();
    if (!client) return;
    const v = new PartyVoice({ client, createDevice, getUserMedia, playTrack, onChange: setState });
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
  const othersTalking = state.speakers.some((id) => id !== myId);
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
