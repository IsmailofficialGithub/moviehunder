import test from "node:test";
import assert from "node:assert/strict";
import { resolveNuxt } from "../src/index.js";

test("resolveNuxt resolves basic values, nested objects and arrays correctly", () => {
  // Simulating Nuxt data: [0, 1, 2, ...] where indices point to other indices
  // nuxt[0] = { title: 1, year: 2, tags: 3 }
  // nuxt[1] = "Interstellar"
  // nuxt[2] = 2014
  // nuxt[3] = [4, 5]
  // nuxt[4] = "Sci-Fi"
  // nuxt[5] = "Adventure"
  const nuxt = [
    { title: 1, year: 2, tags: 3 },
    "Interstellar",
    2014,
    [4, 5],
    "Sci-Fi",
    "Adventure",
  ];

  const resolve = resolveNuxt(nuxt);
  const result = resolve(0);

  assert.deepEqual(result, {
    title: "Interstellar",
    year: 2014,
    tags: ["Sci-Fi", "Adventure"],
  });
});

test("resolveNuxt memoizes resolved objects to prevent duplicate allocations", () => {
  const nuxt = [
    { a: 1, b: 1 }, // both reference index 1
    { name: 2 },
    "Shared Object",
  ];

  const resolve = resolveNuxt(nuxt);
  const result = resolve(0);

  assert.equal(result.a, result.b, "result.a and result.b must reference the exact same memoized object");
  assert.equal(result.a.name, "Shared Object");
});

test("resolveNuxt safely handles circular references without crashing", () => {
  // index 0 points to index 1, index 1 points back to index 0
  const nuxt = [
    { ref: 1 },
    { back: 0 },
  ];

  const resolve = resolveNuxt(nuxt);
  const result = resolve(0);

  assert.ok(result);
  assert.equal(result.ref.back, result, "Circular reference must point back to memoized parent object");
});

test("resolveNuxt respects depth limits to prevent deep recursion explosions", () => {
  // Chain of 20 deep objects
  const nuxt = [];
  for (let i = 0; i < 20; i++) {
    nuxt.push({ next: i + 1 });
  }

  const resolve = resolveNuxt(nuxt);
  const result = resolve(0);

  assert.ok(result);
  // Traverse down
  let curr = result;
  let count = 0;
  while (curr && curr.next) {
    count++;
    curr = curr.next;
  }
  assert.ok(count <= 13, `Depth must be bounded by limit (got ${count})`);
});
