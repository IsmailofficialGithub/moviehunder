import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  DRIFT,
  applyCommand,
  correction,
  estimateClockOffset,
  expectedPosition,
  initialState,
  pickNextHost,
  reconcileHostReport,
} from "../party/syncMath.js";

test("expectedPosition extrapolates only while playing", () => {
  const paused = { playing: false, position: 10, rate: 1, updatedAt: 1000 };
  assert.equal(expectedPosition(paused, 61_000), 10);
  const playing = { ...paused, playing: true };
  assert.equal(expectedPosition(playing, 6000), 15);
  assert.equal(expectedPosition({ ...playing, rate: 2 }, 6000), 20);
  // clock skew backwards never rewinds
  assert.equal(expectedPosition(playing, 0), 10);
});

test("only the host controls playback; viewers and co-hosts follow", () => {
  const s = initialState(0);
  assert.deepEqual(applyCommand(s, { action: "play" }, ROLES.VIEWER, 0), { ok: false, error: "FORBIDDEN" });
  assert.equal(applyCommand(s, { action: "play" }, ROLES.HOST, 0).ok, true);
  assert.deepEqual(applyCommand(s, { action: "play" }, ROLES.COHOST, 0), { ok: false, error: "FORBIDDEN" });
});

test("play/pause re-anchor at the live position", () => {
  let s = applyCommand(initialState(0), { action: "play" }, ROLES.HOST, 0).state;
  s = applyCommand(s, { action: "pause" }, ROLES.HOST, 4000).state;
  assert.equal(s.playing, false);
  assert.equal(s.position, 4);
  assert.equal(s.updatedAt, 4000);
  assert.equal(expectedPosition(s, 99_000), 4);
});

test("seek and rate validate input", () => {
  const s = initialState(0);
  assert.equal(applyCommand(s, { action: "seek" }, ROLES.HOST, 0).error, "BAD_POSITION");
  assert.equal(applyCommand(s, { action: "seek", position: -5 }, ROLES.HOST, 0).state.position, 0);
  assert.equal(applyCommand(s, { action: "rate", rate: 9 }, ROLES.HOST, 0).error, "BAD_RATE");
  assert.equal(applyCommand(s, { action: "rate", rate: 1.5 }, ROLES.HOST, 0).state.rate, 1.5);
  assert.equal(applyCommand(s, { action: "dance" }, ROLES.HOST, 0).error, "BAD_ACTION");
});

test("host report re-anchors only when the host has really drifted", () => {
  const s = { playing: true, position: 0, rate: 1, updatedAt: 0 };
  assert.equal(reconcileHostReport(s, { position: 10.3, playing: true }, 10_000), null);
  const stalled = reconcileHostReport(s, { position: 7, playing: true }, 10_000);
  assert.equal(stalled.position, 7);
  assert.equal(stalled.updatedAt, 10_000);
  // A report can never flip play/pause — that only comes from commands.
  assert.equal(reconcileHostReport(s, { position: 3, playing: false }, 10_000), null, "paused report ignored while room plays");
  const pausedRoom = { playing: false, position: 50, rate: 1, updatedAt: 0 };
  const moved = reconcileHostReport(pausedRoom, { position: 80, playing: true }, 10_000);
  assert.equal(moved.playing, false, "report does not start a paused room");
  assert.equal(moved.position, 80);
});

test("correction: ignore small drift, nudge medium, seek large", () => {
  const s = { playing: true, position: 100, rate: 1, updatedAt: 0 };
  assert.equal(correction(s, 100.1, 0).kind, "none");
  const behind = correction(s, 99, 0);
  assert.equal(behind.kind, "nudge");
  assert.ok(behind.rate > 1.1, "1 s behind → strong catch-up");
  const slightly = correction(s, 99.6, 0);
  assert.ok(slightly.rate > 1 && slightly.rate < behind.rate, "smaller gap → gentler nudge");
  const ahead = correction(s, 101, 0);
  assert.ok(ahead.rate < 1);
  assert.equal(correction(s, 100 - DRIFT.HARD_SEEK - 1, 0).kind, "seek");
  // paused room: any meaningful drift is a seek (no speed nudging while paused)
  assert.equal(correction({ ...s, playing: false }, 99, 0).kind, "seek");
});

test("clock offset picks the lowest-RTT sample", () => {
  const { offset, rtt } = estimateClockOffset([
    { sent: 0, serverTime: 5100, received: 400 }, // slow sample
    { sent: 1000, serverTime: 6025, received: 1050 }, // rtt 50 → offset 5000
  ]);
  assert.equal(rtt, 50);
  assert.equal(offset, 5000);
  assert.equal(estimateClockOffset([]).offset, 0);
});

test("pickNextHost prefers earliest online co-host, then earliest member", () => {
  const members = [
    { userId: "a", role: ROLES.HOST, joinedAt: 1 },
    { userId: "b", role: ROLES.VIEWER, joinedAt: 2 },
    { userId: "c", role: ROLES.COHOST, joinedAt: 5 },
    { userId: "d", role: ROLES.COHOST, joinedAt: 3, online: false },
  ];
  assert.equal(pickNextHost(members, "a"), "c");
  assert.equal(pickNextHost(members.filter((m) => m.userId !== "c"), "a"), "b");
  assert.equal(pickNextHost([{ userId: "a" }], "a"), null);
});

test("simulated room: 5 viewers with different clock skews converge within 300ms", () => {
  // Each client knows its offset (as estimated from pings) and corrects using the room state.
  const host = { playing: true, position: 42, rate: 1, updatedAt: 1_000_000 };
  const serverNow = 1_012_345;
  const skews = [-800, -120, 0, 250, 1900];
  const positions = skews.map((skew) => {
    const clientNow = serverNow - skew;
    const { offset } = estimateClockOffset([{ sent: clientNow - 20, serverTime: serverNow - 10, received: clientNow }]);
    const c = correction(host, 0, clientNow + offset); // local player starts at 0 → hard seek
    assert.equal(c.kind, "seek");
    return c.target;
  });
  const spread = Math.max(...positions) - Math.min(...positions);
  assert.ok(spread < 0.3, `spread ${spread}s`);
});
