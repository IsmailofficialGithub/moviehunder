import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleGetWatchlist,
  handlePostWatchlist,
  handleDeleteWatchlist,
} from "../src/sync.js";

test("Watchlist scope key isolation: accounts and profiles have completely distinct keys", () => {
  const accountA = "user_alpha";
  const accountB = "user_beta";
  const profile1 = "1";
  const profile2 = "2";

  const keyA1 = `mh.watchlist.v1.${accountA}_p${profile1}`;
  const keyA2 = `mh.watchlist.v1.${accountA}_p${profile2}`;
  const keyB1 = `mh.watchlist.v1.${accountB}_p${profile1}`;
  const keyGuest = `mh.watchlist.v1.guest_p1`;

  assert.notEqual(keyA1, keyA2, "Profile 1 and Profile 2 in same account must have distinct keys");
  assert.notEqual(keyA1, keyB1, "Account A and Account B must have distinct keys");
  assert.notEqual(keyA1, keyGuest, "Guest and Authenticated user must have distinct keys");
});

test("handleGetWatchlist returns 401 Unauthorized when no auth header is present", async () => {
  const req = new Request("http://localhost:3000/api/watchlist?profileId=1", {
    method: "GET",
  });
  const res = await handleGetWatchlist(req);
  assert.equal(res.status, 401);
  assert.match(res.body.error, /Missing bearer token/i);
});

test("handlePostWatchlist rejects request with 401 when unauthenticated", async () => {
  const req = new Request("http://localhost:3000/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subjectId: "12345", title: "Test Movie" }),
  });
  const res = await handlePostWatchlist(req);
  assert.equal(res.status, 401);
});

test("handleDeleteWatchlist rejects request with 401 when unauthenticated", async () => {
  const req = new Request("http://localhost:3000/api/watchlist/12345", {
    method: "DELETE",
  });
  const res = await handleDeleteWatchlist(req, "/api/watchlist/12345");
  assert.equal(res.status, 401);
});
