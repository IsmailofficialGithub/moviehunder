import test from "node:test";
import assert from "node:assert/strict";
import * as mediasoup from "mediasoup";
import { PartyMedia, forwardSet, selectActiveSpeakers } from "../party/media.js";

test("selectActiveSpeakers keeps the most recent N speakers within the hold window", () => {
  const now = 10_000;
  const stats = new Map([
    ["a", { level: -20, lastActiveAt: now - 100 }],
    ["b", { level: -30, lastActiveAt: now - 50 }],
    ["c", { level: -10, lastActiveAt: now - 5000 }], // went quiet long ago
    ["d", { level: -40, lastActiveAt: now - 2000 }],
  ]);
  assert.deepEqual([...selectActiveSpeakers(stats, now, 6, 2500)].sort(), ["a", "b", "d"]);
  assert.deepEqual([...selectActiveSpeakers(stats, now, 2, 2500)], ["b", "a"]);
  assert.equal(selectActiveSpeakers(new Map(), now).size, 0);
});

test("forwardSet forwards every mic in small rooms, even silent ones (no onset clipping)", () => {
  const now = 10_000;
  // Nobody has spoken yet: small room still forwards all mics.
  assert.deepEqual([...forwardSet(["a", "b", "c"], new Map(), now, 6)].sort(), ["a", "b", "c"]);
  // Bigger room than max: only the recent speakers.
  const stats = new Map([
    ["a", { level: -20, lastActiveAt: now - 100 }],
    ["b", { level: -30, lastActiveAt: now - 50 }],
  ]);
  assert.deepEqual([...forwardSet(["a", "b", "c", "d"], stats, now, 3)].sort(), ["a", "b"]);
});

function fakeSocket(userId) {
  return {
    userId,
    roomId: "room-media",
    sent: [],
    send(m) {
      this.sent.push(m);
    },
  };
}

async function request(media, socket, msg, ctx) {
  const rid = Math.random();
  await media.handle(socket, { ...msg, rid }, ctx);
  return socket.sent.find((m) => m.t === "rtc" && m.rid === rid);
}

test("real mediasoup: caps, transports, permissions, cleanup", async (t) => {
  const media = new PartyMedia({ mediasoup, numWorkers: 1, basePort: 41000 + Math.floor(Math.random() * 500), listenIp: "127.0.0.1", log: { error() {} } });
  try {
    await media.init();
  } catch (err) {
    t.skip(`mediasoup worker unavailable: ${err.message}`);
    return;
  }
  const broadcasts = [];
  const ctx = { broadcast: (m) => broadcasts.push(m), hostMute: (uid) => uid === "viewer" };
  const alice = fakeSocket("alice");

  const caps = await request(media, alice, { t: "rtc.caps" }, ctx);
  assert.equal(caps.ok, true);
  assert.ok(caps.data.rtpCapabilities.codecs.some((c) => c.mimeType === "audio/opus"));
  assert.ok(!caps.data.rtpCapabilities.codecs.some((c) => c.kind === "video"), "audio only");

  const send = await request(media, alice, { t: "rtc.transport", direction: "send" }, ctx);
  assert.equal(send.ok, true);
  assert.ok(send.data.iceCandidates.length >= 1);
  assert.equal(send.data.iceCandidates[0].port, media.basePort, "uses the shared WebRtcServer port");

  const recv = await request(media, alice, { t: "rtc.transport", direction: "recv" }, ctx);
  assert.equal(recv.ok, true);
  assert.notEqual(recv.data.id, send.data.id);

  const badProduce = await request(media, alice, { t: "rtc.produce", transportId: recv.data.id, kind: "audio", rtpParameters: {} }, ctx);
  assert.equal(badProduce.error, "NO_TRANSPORT", "cannot produce on a recv transport");

  const video = await request(media, alice, { t: "rtc.produce", transportId: send.data.id, kind: "video", rtpParameters: {} }, ctx);
  assert.equal(video.error, "AUDIO_ONLY");

  const noConsume = await request(media, alice, { t: "rtc.consume", producerId: "nope", rtpCapabilities: caps.data.rtpCapabilities }, ctx);
  assert.equal(noConsume.error, "CANNOT_CONSUME");

  const forbidden = await request(media, alice, { t: "rtc.host_mute", userId: "host" }, ctx);
  assert.equal(forbidden.error, "FORBIDDEN");

  const list = await request(media, alice, { t: "rtc.producers" }, ctx);
  assert.deepEqual(list.data.producers, []);

  assert.equal(media.rooms.size, 1);
  media.removePeer("room-media", alice);
  assert.equal(media.rooms.size, 0, "room router closed when the last peer leaves");

  await media.close();
});

test("voice requests fail cleanly when the SFU is not running", async () => {
  const media = new PartyMedia({ mediasoup: null });
  const s = fakeSocket("x");
  const res = await request(media, s, { t: "rtc.caps" }, {});
  assert.equal(res.error, "VOICE_UNAVAILABLE");
});
