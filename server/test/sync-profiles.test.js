import test from "node:test";
import assert from "node:assert/strict";
import {
  handleGetWatchProgress,
  handlePutWatchProgress,
  handleDeleteWatchProgress,
} from "../src/sync.js";

test("watch progress queries and mutations are isolated per profile", async () => {
  const store = [];
  let idCounter = 1;

  const mockPrisma = {
    watchProgress: {
      findMany: async ({ where }) => {
        return store.filter((item) => {
          if (item.userId !== where.userId) return false;
          if (where.profileId !== undefined && item.profileId !== where.profileId) return false;
          return true;
        });
      },
      findFirst: async ({ where }) => {
        return store.find((item) => {
          if (item.userId !== where.userId) return false;
          if (where.progressKey && item.progressKey !== where.progressKey) return false;
          if (where.profileId !== undefined && item.profileId !== where.profileId) return false;
          return true;
        }) || null;
      },
      create: async ({ data }) => {
        const row = {
          id: `wp_${idCounter++}`,
          ...data,
          updatedAt: new Date(data.updatedAt || Date.now()),
          createdAt: new Date(),
        };
        store.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const idx = store.findIndex((i) => i.id === where.id);
        if (idx >= 0) {
          store[idx] = { ...store[idx], ...data, updatedAt: new Date(data.updatedAt || Date.now()) };
          return store[idx];
        }
        throw new Error("Not found");
      },
      deleteMany: async ({ where }) => {
        const before = store.length;
        for (let i = store.length - 1; i >= 0; i--) {
          const item = store[i];
          if (item.userId === where.userId && (where.profileId === undefined || item.profileId === where.profileId)) {
            if (!where.progressKey || item.progressKey === where.progressKey) {
              store.splice(i, 1);
            }
          }
        }
        return { count: before - store.length };
      },
    },
  };

  const optsProfileA = {
    authUser: { id: "u1" },
    dbConfiguredOverride: true,
    prismaOverride: mockPrisma,
    profileIdOverride: "prof_A",
  };

  const optsProfileB = {
    authUser: { id: "u1" },
    dbConfiguredOverride: true,
    prismaOverride: mockPrisma,
    profileIdOverride: "prof_B",
  };

  // 1. Put progress under Profile A
  const putReqA = new Request("http://localhost/api/sync/watch-progress", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Profile-Id": "prof_A" },
    body: JSON.stringify({
      item: {
        progressKey: "t:movie123:s0:e0",
        position: 120,
        duration: 3600,
        title: "Movie 123",
      },
    }),
  });
  const putResA = await handlePutWatchProgress(putReqA, optsProfileA);
  assert.equal(putResA.status, 200);

  // 2. Put progress under Profile B for the exact same movie
  const putReqB = new Request("http://localhost/api/sync/watch-progress", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Profile-Id": "prof_B" },
    body: JSON.stringify({
      item: {
        progressKey: "t:movie123:s0:e0",
        position: 500,
        duration: 3600,
        title: "Movie 123",
      },
    }),
  });
  const putResB = await handlePutWatchProgress(putReqB, optsProfileB);
  assert.equal(putResB.status, 200);

  // 3. Query Profile A -> position should be 120
  const getReqA = new Request("http://localhost/api/sync/watch-progress", {
    headers: { "X-Profile-Id": "prof_A" },
  });
  const getResA = await handleGetWatchProgress(getReqA, optsProfileA);
  assert.equal(getResA.status, 200);
  assert.equal(getResA.body.items.length, 1);
  assert.equal(getResA.body.items[0].position, 120);

  // 4. Query Profile B -> position should be 500
  const getReqB = new Request("http://localhost/api/sync/watch-progress", {
    headers: { "X-Profile-Id": "prof_B" },
  });
  const getResB = await handleGetWatchProgress(getReqB, optsProfileB);
  assert.equal(getResB.status, 200);
  assert.equal(getResB.body.items.length, 1);
  assert.equal(getResB.body.items[0].position, 500);

  // 5. Delete progress on Profile A -> Profile B should remain untouched
  const delReqA = new Request("http://localhost/api/sync/watch-progress?progressKey=t:movie123:s0:e0", {
    method: "DELETE",
    headers: { "X-Profile-Id": "prof_A" },
  });
  const delResA = await handleDeleteWatchProgress(delReqA, optsProfileA);
  assert.equal(delResA.status, 200);

  const afterDelA = await handleGetWatchProgress(getReqA, optsProfileA);
  assert.equal(afterDelA.body.items.length, 0);

  const afterDelB = await handleGetWatchProgress(getReqB, optsProfileB);
  assert.equal(afterDelB.body.items.length, 1);
  assert.equal(afterDelB.body.items[0].position, 500);
});
