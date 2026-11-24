// Mobile voice for a watch party (react-native-webrtc + mediasoup-client).
// Needs a native build with the @config-plugins/react-native-webrtc plugin — not available over OTA.
import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { PartyVoice } from "./voice";

const DUCK_TO = 0.3;
let webrtc = null;

/** Load react-native-webrtc lazily so a build without the native module still runs (voice just stays off). */
function loadWebRTC() {
  if (webrtc !== null) return webrtc;
  try {
    // eslint-disable-next-line global-require
    const mod = require("react-native-webrtc");
    mod.registerGlobals(); // RTCPeerConnection & co. for mediasoup-client
    webrtc = mod;
  } catch {
    webrtc = false;
  }
  return webrtc;
}

async function createDevice() {
  const { Device } = await import("mediasoup-client");
  return Device.factory({ handlerName: "ReactNative106" });
}

async function getUserMedia() {
  if (Platform.OS === "android") {
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: "Microphone",
      message: "Allow the microphone to talk in this watch party.",
      buttonPositive: "Allow",
    });
    if (res !== PermissionsAndroid.RESULTS.GRANTED) {
      throw Object.assign(new Error("MIC_BLOCKED"), { code: "MIC_BLOCKED" });
    }
  }
  return webrtc.mediaDevices.getUserMedia({ audio: true, video: false });
}

// Remote audio tracks play automatically in react-native-webrtc; stopping = disabling the track.
function playTrack(_userId, track) {
  return () => {
    try {
      track.enabled = false;
    } catch {
      /* closed */
    }
  };
}

export function usePartyVoice(party) {
  const [state, setState] = useState({ joined: false, micOn: false, micLive: false, speakers: [], mics: {}, forceMuted: false, error: null });
  const voiceRef = useRef(null);
  const supported = Boolean(loadWebRTC());
  const ready = supported && party.status === "open" && party.voiceAvailable;
  const myId = party.you?.userId;

  useEffect(() => {
    if (!ready || voiceRef.current) return;
    const client = party.getClient();
    if (!client) return;
    const v = new PartyVoice({ client, createDevice, getUserMedia, playTrack, onChange: setState });
    voiceRef.current = v;
    v.join().catch(() => {});
  }, [ready, party]);

  useEffect(
    () => () => {
      voiceRef.current?.leave();
      voiceRef.current = null;
    },
    []
  );

  // Duck the movie while others talk.
  const duckRef = useRef(null);
  const othersTalking = state.speakers.some((id) => id !== myId);
  useEffect(() => {
    const player = party.getPlayer();
    if (!player) return;
    try {
      if (othersTalking && !duckRef.current && !player.muted) {
        const original = player.volume;
        duckRef.current = { original, ducked: original * DUCK_TO };
        player.volume = duckRef.current.ducked;
      } else if (!othersTalking && duckRef.current) {
        const { original, ducked } = duckRef.current;
        duckRef.current = null;
        if (Math.abs(player.volume - ducked) < 0.01) player.volume = original;
      }
    } catch {
      /* player released */
    }
  }, [othersTalking, party]);

  const startMic = useCallback(async () => {
    try {
      await voiceRef.current?.startMic();
    } catch (err) {
      setState((s) => ({ ...s, error: err?.code || err?.message }));
    }
  }, []);

  return {
    supported,
    available: ready,
    ...state,
    startMic,
    setMic: (on) => voiceRef.current?.setMic(on),
    toggleMic: () => voiceRef.current?.setMic(!state.micOn),
    stopMic: () => voiceRef.current?.stopMic(),
    hostMute: (userId, muted = true) => voiceRef.current?.hostMute(userId, muted).catch(() => {}),
  };
}
