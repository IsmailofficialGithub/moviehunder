import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage for node environment
const storage = new Map();
global.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};

// Mock window and CustomEvent
global.window = {
  dispatchEvent: (event) => {
    global.lastDispatchedEvent = event;
  },
};
global.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};

import {
  getActiveProfile,
  setActiveProfile,
  clearActiveProfile,
  generateAvatarUrl,
  CURATED_AVATARS,
} from "../lib/profiles.js";

import { getWatchCacheKey } from "../lib/sync.js";

test("getActiveProfile and setActiveProfile manage active profile state in localStorage", () => {
  storage.clear();
  assert.equal(getActiveProfile(), null);

  const profile = { id: "prof_1", name: "Justin", isKids: false, avatarUrl: "https://example.com/avatar.png" };
  setActiveProfile(profile);

  const retrieved = getActiveProfile();
  assert.deepEqual(retrieved, profile);
  assert.equal(global.lastDispatchedEvent?.type, "mh:profile_changed");
  assert.deepEqual(global.lastDispatchedEvent?.detail, profile);

  clearActiveProfile();
  assert.equal(getActiveProfile(), null);
});

test("generateAvatarUrl creates DiceBear avatars with brand colors", () => {
  const avatar = generateAvatarUrl("Justin", { isKids: false });
  assert.match(avatar, /api\.dicebear\.com/);
  assert.match(avatar, /seed=Justin/);
  assert.match(avatar, /backgroundColor=(3d0081|5a00a2|bd84db|1a1a1f)/);

  const kidsAvatar = generateAvatarUrl("LittleOne", { isKids: true });
  assert.match(kidsAvatar, /backgroundColor=38bdf8/);
});

test("CURATED_AVATARS list contains valid brand avatar options", () => {
  assert.ok(Array.isArray(CURATED_AVATARS));
  assert.ok(CURATED_AVATARS.length >= 4);
  CURATED_AVATARS.forEach((av) => {
    assert.match(av.url, /^https:\/\/api\.dicebear\.com/);
    assert.ok(av.label);
  });
});

test("getWatchCacheKey partitions cache by userId and profileId", () => {
  const key1 = getWatchCacheKey("user_123", "prof_abc");
  assert.equal(key1, "mh.watch.cache.v2.user_123.prof_abc");

  const keyNoProf = getWatchCacheKey("user_123", null);
  assert.equal(keyNoProf, "mh.watch.cache.v2.user_123.default");

  const keyGuest = getWatchCacheKey(null, null);
  assert.equal(keyGuest, "mh.watch.cache.v2.guest.default");
});
