import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getSearchHistory,
  saveSearchHistory,
  removeSearchHistory,
  filterSearchHistory,
} from "../lib/searchHistory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("searchHistory manages localStorage recent searches cleanly", () => {
  // Mock localStorage
  const store = {};
  const mockStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
  };

  assert.deepEqual(getSearchHistory(mockStorage), []);

  // Adding queries
  let list = saveSearchHistory("sad song", mockStorage);
  assert.deepEqual(list, ["sad song"]);

  list = saveSearchHistory("samay raina", mockStorage);
  assert.deepEqual(list, ["samay raina", "sad song"]);

  // Deduplication & moving to top
  list = saveSearchHistory("sad song", mockStorage);
  assert.deepEqual(list, ["sad song", "samay raina"]);

  // Removing query
  list = removeSearchHistory("samay raina", mockStorage);
  assert.deepEqual(list, ["sad song"]);

  // Ignore empty or invalid queries
  list = saveSearchHistory("   ", mockStorage);
  assert.deepEqual(list, ["sad song"]);
});

test("filterSearchHistory filters recent queries by typed query prefix", () => {
  const history = ["sad song", "samay raina", "strap grip", "batman"];
  
  // Empty query returns all history
  assert.deepEqual(filterSearchHistory(history, ""), [
    "sad song",
    "samay raina",
    "strap grip",
    "batman",
  ]);

  // Prefix "s" matches all starting with s
  const sResults = filterSearchHistory(history, "s");
  assert.deepEqual(sResults, ["sad song", "samay raina", "strap grip"]);

  // Prefix "sa" matches "sad song" and "samay raina"
  assert.deepEqual(filterSearchHistory(history, "sa"), ["sad song", "samay raina"]);

  // Case insensitive
  assert.deepEqual(filterSearchHistory(history, "BAT"), ["batman"]);
});

test("SiteHeader.js includes YouTube-style insert arrow, remove history button, and mobile overlay", () => {
  const headerContent = fs.readFileSync(path.join(__dirname, "../components/SiteHeader.js"), "utf-8");
  const cssContent = fs.readFileSync(path.join(__dirname, "../components/SiteHeader.module.css"), "utf-8");

  // Check for insert-arrow functionality (fill suggestion without searching)
  assert.ok(headerContent.includes("fillSuggestion"), "SiteHeader must have fillSuggestion handler");
  assert.ok(headerContent.includes("removeHistory"), "SiteHeader must support removing history item");
  assert.ok(headerContent.includes("mobileSearchOpen"), "SiteHeader must support mobile fullscreen search mode");

  // Check for arrow icon / button in JSX
  assert.ok(headerContent.includes("insertBtn") || headerContent.includes("arrowBtn") || headerContent.includes("fillBtn"), "SiteHeader must render insert arrow button");

  // Check for CSS classes for YouTube pill, suggestions, insert arrow, and mobile overlay
  assert.ok(cssContent.includes("mobileOverlay") || cssContent.includes("mobileSearchOverlay"), "CSS must define mobile overlay");
  assert.ok(cssContent.includes("insertBtn") || cssContent.includes("arrowBtn") || cssContent.includes("fillBtn"), "CSS must style insert arrow button");
  assert.ok(cssContent.includes("historyItem") || cssContent.includes("historyRemove"), "CSS must style search history items");
});
