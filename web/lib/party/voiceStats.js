"use client";

// Opt-in voice diagnostics. Turn on in the browser console:
//   localStorage.partyVoiceDebug = "1"   (then reload)
// Every 5 s it logs a one-line summary per transport from RTCPeerConnection stats:
// transport (udp/tcp, direct/relay), round-trip time, jitter, packet loss, concealment
// (how much audio the receiver had to invent), bitrate and codec. No audio is recorded.

export function voiceDebugEnabled() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("partyVoiceDebug") === "1";
  } catch {
    return false;
  }
}

const last = new Map(); // id → { bytes, at }

function rate(id, bytes, at) {
  const prev = last.get(id);
  last.set(id, { bytes, at });
  if (!prev || at <= prev.at) return null;
  return Math.round(((bytes - prev.bytes) * 8) / ((at - prev.at) / 1000) / 1000); // kbps
}

function summarize(report, label) {
  const by = {};
  report.forEach((s) => {
    (by[s.type] ||= []).push(s);
  });
  const pair = (by["candidate-pair"] || []).find((p) => p.nominated && p.state === "succeeded");
  const local = pair && (by["local-candidate"] || []).find((c) => c.id === pair.localCandidateId);
  const codecs = Object.fromEntries((by.codec || []).map((c) => [c.id, c]));
  const out = {
    transport: local ? `${local.protocol}/${local.candidateType}` : "?",
    rttMs: pair?.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
    outKbpsAvail: pair?.availableOutgoingBitrate ? Math.round(pair.availableOutgoingBitrate / 1000) : null,
  };
  for (const r of by["inbound-rtp"] || []) {
    if (r.kind !== "audio") continue;
    const recv = r.packetsReceived || 0;
    const lost = r.packetsLost || 0;
    const codec = codecs[r.codecId];
    out[`in:${r.ssrc}`] = {
      codec: codec ? `${codec.mimeType}/${codec.clockRate}/${codec.channels || 1}` : undefined,
      kbps: rate(r.id, r.bytesReceived || 0, r.timestamp),
      lossPct: recv + lost > 0 ? +((100 * lost) / (recv + lost)).toFixed(2) : 0,
      jitterMs: r.jitter != null ? Math.round(r.jitter * 1000) : null,
      jitterBufMs:
        r.jitterBufferEmittedCount > 0 ? Math.round((1000 * r.jitterBufferDelay) / r.jitterBufferEmittedCount) : null,
      concealedPct: r.totalSamplesReceived > 0 ? +((100 * (r.concealedSamples || 0)) / r.totalSamplesReceived).toFixed(2) : null,
      level: r.audioLevel != null ? +r.audioLevel.toFixed(3) : null,
    };
  }
  for (const r of by["outbound-rtp"] || []) {
    if (r.kind !== "audio") continue;
    const codec = codecs[r.codecId];
    out[`out:${r.ssrc}`] = {
      codec: codec ? `${codec.mimeType}/${codec.clockRate}/${codec.channels || 1} ${codec.sdpFmtpLine || ""}` : undefined,
      kbps: rate(r.id, r.bytesSent || 0, r.timestamp),
      retransmitted: r.retransmittedPacketsSent ?? null,
    };
  }
  for (const r of by["remote-inbound-rtp"] || []) {
    if (r.kind !== "audio") continue;
    out[`remoteLoss:${r.ssrc}`] = r.fractionLost != null ? +(100 * r.fractionLost).toFixed(2) : null;
  }
  console.info(`[voice] ${label}`, out);
}

/** @param {import("./voice").PartyVoice | null} voice */
export async function logVoiceStats(voice) {
  if (!voice) return;
  if (voice.sendTransport) summarize(await voice.sendTransport.getStats(), "send");
  if (voice.recvTransport) summarize(await voice.recvTransport.getStats(), "recv");
}
