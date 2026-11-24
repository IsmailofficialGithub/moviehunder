import test from "node:test";
import assert from "node:assert/strict";
import { PartyHub, LIMITS } from "../party/hub.js";

function fakeStore({ members = {}, room = {} } = {}) {
  const calls = [];
  const rec = (name) => async (...args) => calls.push([name, ...args]);
  return {
    calls,
    loadRoom: async (id) => ({
      id,
      code: "ABC123",
      visibility: "PRIVATE",
      hostUserId: "host",
      maxMembers: 3,
      subjectId: "1",
      detailPath: "movie-x",
      se: "0",
      ep: "0",
      endedAt: null,
      ...room,
    }),
    loadMember: async (_roomId, userId) => (userId in members ? members[userId] : { role: "VIEWER", banned: false }),
    loadUser: async (userId) => ({ id: userId, displayName: userId.toUpperCase() }),
    loadState: async () => null,
    saveState: rec("saveState"),
    setOnline: rec("setOnline"),
    markLeft: rec("markLeft"),
    setRole: rec("setRole"),
    ban: rec("ban"),
    setHost: rec("setHost"),
    updateContent: rec("updateContent"),
    endRoom: rec("endRoom"),
  };
}

function fakeSocket() {
  return {
    sent: [],
    closed: null,
    send(m) {
      this.sent.push(m);
    },
    close(code, reason) {
      this.closed = { code, reason };
    },
    last(t) {
      return [...this.sent].reverse().find((m) => m.t === t);
    },
  };
}

function setup(opts) {
  let now = 1_000_000;
  const timers = [];
  const hub = new PartyHub({
    store: fakeStore(opts),
    now: () => now,
    setTimer: (fn, ms) => {
      const t = { fn, at: now + ms, done: false };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => t && (t.done = true),
    log: { error() {} },
  });
  return {
    hub,
    advance(ms) {
      now += ms;
      for (const t of timers) if (!t.done && t.at <= now) (t.done = true), t.fn();
    },
  };
}

const ticket = (userId) => ({ userId, roomId: "room1" });

test("join sends snapshot and announces member to others", async () => {
  const { hub } = setup();
  const h = fakeSocket();
  const v = fakeSocket();
  await hub.join(h, ticket("host"));
  await hub.join(v, ticket("v1"));
  const joined = v.last("joined");
  assert.equal(joined.you.role, "VIEWER");
  assert.equal(joined.members.length, 2);
  assert.equal(h.last("member_join").member.userId, "v1");
});

test("viewer commands are rejected; host commands broadcast state", async () => {
  const { hub } = setup();
  const h = fakeSocket();
  const v = fakeSocket();
  await hub.join(h, ticket("host"));
  await hub.join(v, ticket("v1"));
  await hub.handle(v, { t: "cmd", action: "pause", rid: 7 });
  assert.deepEqual(v.last("error"), { t: "error", code: "FORBIDDEN", rid: 7 });
  await hub.handle(h, { t: "cmd", action: "play", position: 12 });
  const st = v.last("state");
  assert.equal(st.state.playing, true);
  assert.equal(st.state.position, 12);
  assert.equal(st.action, "play");
});

test("room capacity is enforced, but the host can always rejoin", async () => {
  const { hub } = setup();
  for (const id of ["a", "b", "c"]) await hub.join(fakeSocket(), ticket(id));
  const late = fakeSocket();
  assert.equal(await hub.join(late, ticket("d")), false);
  assert.equal(late.closed.reason, "ROOM_FULL");
  assert.equal(await hub.join(fakeSocket(), ticket("host")), true);
});

test("banned users and non-members are refused", async () => {
  const { hub } = setup({ members: { bad: { role: "VIEWER", banned: true }, ghost: null } });
  const s1 = fakeSocket();
  await hub.join(s1, ticket("bad"));
  assert.equal(s1.closed.reason, "BANNED");
  const s2 = fakeSocket();
  await hub.join(s2, ticket("ghost"));
  assert.equal(s2.closed.reason, "NOT_A_MEMBER");
});

test("host gets 30s grace, then host passes to earliest co-host", async () => {
  const { hub, advance } = setup();
  const h = fakeSocket();
  const v1 = fakeSocket();
  const v2 = fakeSocket();
  await hub.join(h, ticket("host"));
  await hub.join(v1, ticket("v1"));
  advance(10);
  await hub.join(v2, ticket("v2"));
  await hub.handle(h, { t: "role", userId: "v2", role: "COHOST" });
  await hub.leave(h);
  advance(LIMITS.HOST_GRACE_MS - 1);
  assert.equal(v1.last("host"), undefined);
  advance(1);
  await new Promise((r) => setImmediate(r));
  assert.equal(v1.last("host").userId, "v2");
  assert.equal(hub.rooms.get("room1").hostUserId, "v2");
});

test("host returning inside grace keeps the host role", async () => {
  const { hub, advance } = setup();
  const h = fakeSocket();
  const v = fakeSocket();
  await hub.join(h, ticket("host"));
  await hub.join(v, ticket("v1"));
  await hub.leave(h);
  advance(5000);
  await hub.join(fakeSocket(), ticket("host"));
  advance(LIMITS.HOST_GRACE_MS);
  await new Promise((r) => setImmediate(r));
  assert.equal(v.last("host"), undefined);
});

test("a second tab of the same user does not trigger leave", async () => {
  const { hub } = setup();
  const h = fakeSocket();
  const tab1 = fakeSocket();
  const tab2 = fakeSocket();
  await hub.join(h, ticket("host"));
  await hub.join(tab1, ticket("v1"));
  await hub.join(tab2, ticket("v1"));
  await hub.leave(tab1);
  assert.equal(h.last("member_leave"), undefined);
  await hub.leave(tab2);
  assert.equal(h.last("member_leave").userId, "v1");
});

test("member names never fall back to the email address", async () => {
  const { hub } = setup();
  hub.store.loadUser = async (id) => ({ id, displayName: null, email: "john.smith@example.com" });
  const s = fakeSocket();
  await hub.join(s, ticket("host"));
  const me = s.last("joined").members[0];
  assert.match(me.name, /^Guest [0-9A-Z]{4}$/);
  assert.ok(!JSON.stringify(s.sent).includes("john.smith"));
});

test("chat is trimmed, rate limited and kept in history", async () => {
  const { hub } = setup();
  const v = fakeSocket();
  await hub.join(fakeSocket(), ticket("host"));
  await hub.join(v, ticket("v1"));
  for (let i = 0; i < LIMITS.CHAT_PER_5S + 2; i++) await hub.handle(v, { t: "chat", text: "  hi " + i });
  assert.equal(hub.rooms.get("room1").chat.length, LIMITS.CHAT_PER_5S);
  assert.equal(hub.rooms.get("room1").chat[0].text, "hi 0");
  assert.equal(v.last("error").code, "RATE_LIMITED");
});

test("kick: co-host can kick viewers but not the host", async () => {
  const { hub } = setup();
  const h = fakeSocket();
  const c = fakeSocket();
  const v = fakeSocket();
  await hub.join(h, ticket("host"));
  await hub.join(c, ticket("co"));
  await hub.join(v, ticket("v1"));
  await hub.handle(h, { t: "role", userId: "co", role: "COHOST" });
  await hub.handle(c, { t: "kick", userId: "host" });
  assert.equal(c.last("error").code, "FORBIDDEN");
  await hub.handle(c, { t: "kick", userId: "v1" });
  assert.equal(v.closed.reason, "KICKED");
  assert.equal(h.last("member_leave").kicked, true);
});

test("content change resets playback to paused at 0", async () => {
  const { hub } = setup();
  const h = fakeSocket();
  await hub.join(h, ticket("host"));
  await hub.handle(h, { t: "cmd", action: "play", position: 500 });
  await hub.handle(h, { t: "content", content: { subjectId: "99", detailPath: "show-y", se: "1", ep: "2" } });
  const msg = h.last("content");
  assert.equal(msg.content.ep, "2");
  assert.equal(msg.state.playing, false);
  assert.equal(msg.state.position, 0);
  await hub.handle(h, { t: "content", content: { subjectId: "abc", detailPath: "" } });
  assert.equal(h.last("error").code, "BAD_CONTENT");
});

test("empty room is ended after the idle timeout", async () => {
  const { hub, advance } = setup();
  const h = fakeSocket();
  await hub.join(h, ticket("host"));
  await hub.leave(h);
  advance(LIMITS.EMPTY_ROOM_MS);
  await new Promise((r) => setImmediate(r));
  assert.equal(hub.rooms.has("room1"), false);
  assert.ok(hub.store.calls.some(([n]) => n === "endRoom"));
});
