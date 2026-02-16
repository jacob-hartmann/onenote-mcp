import { describe, it, expect, vi } from "vitest";
import { LRUCache } from "./lru-cache.js";

describe("LRUCache", () => {
  // ---------------------------------------------------------------------------
  // Basic operations
  // ---------------------------------------------------------------------------

  describe("basic get/set/has/delete", () => {
    it("stores and retrieves a value", () => {
      const cache = new LRUCache<number>({ maxSize: 3 });
      cache.set("a", 1);
      expect(cache.get("a")).toBe(1);
    });

    it("returns undefined for missing keys", () => {
      const cache = new LRUCache<number>({ maxSize: 3 });
      expect(cache.get("missing")).toBeUndefined();
    });

    it("has returns true for existing keys", () => {
      const cache = new LRUCache<string>({ maxSize: 3 });
      cache.set("key", "value");
      expect(cache.has("key")).toBe(true);
    });

    it("has returns false for missing keys", () => {
      const cache = new LRUCache<string>({ maxSize: 3 });
      expect(cache.has("missing")).toBe(false);
    });

    it("delete removes a key and returns true", () => {
      const cache = new LRUCache<string>({ maxSize: 3 });
      cache.set("key", "value");
      expect(cache.delete("key")).toBe(true);
      expect(cache.has("key")).toBe(false);
      expect(cache.get("key")).toBeUndefined();
    });

    it("delete returns false for missing keys", () => {
      const cache = new LRUCache<string>({ maxSize: 3 });
      expect(cache.delete("missing")).toBe(false);
    });

    it("overwrites existing keys", () => {
      const cache = new LRUCache<number>({ maxSize: 3 });
      cache.set("a", 1);
      cache.set("a", 2);
      expect(cache.get("a")).toBe(2);
      expect(cache.size).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Eviction
  // ---------------------------------------------------------------------------

  describe("eviction", () => {
    it("evicts the least recently used entry when at capacity", () => {
      const cache = new LRUCache<number>({ maxSize: 2 });

      cache.set("a", 1);
      cache.set("b", 2);
      // Cache is at capacity [a, b]; adding "c" should evict "a"
      cache.set("c", 3);

      expect(cache.has("a")).toBe(false);
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
      expect(cache.size).toBe(2);
    });

    it("get updates access order so item is not evicted", () => {
      const cache = new LRUCache<number>({ maxSize: 2 });

      cache.set("a", 1);
      cache.set("b", 2);

      // Access "a" so it becomes most recently used
      cache.get("a");

      // Now add "c" -- "b" should be evicted since "a" was accessed more recently
      cache.set("c", 3);

      expect(cache.has("a")).toBe(true);
      expect(cache.has("b")).toBe(false);
      expect(cache.has("c")).toBe(true);
    });

    it("set on existing key updates access order", () => {
      const cache = new LRUCache<number>({ maxSize: 2 });

      cache.set("a", 1);
      cache.set("b", 2);

      // Re-set "a" with a new value (should move to most recently used)
      cache.set("a", 10);

      // Now add "c" -- "b" should be evicted
      cache.set("c", 3);

      expect(cache.get("a")).toBe(10);
      expect(cache.has("b")).toBe(false);
      expect(cache.get("c")).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // onEvict callback
  // ---------------------------------------------------------------------------

  describe("onEvict callback", () => {
    it("fires with correct key and value on eviction", () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<number>({ maxSize: 2, onEvict });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3); // Evicts "a"

      expect(onEvict).toHaveBeenCalledTimes(1);
      expect(onEvict).toHaveBeenCalledWith("a", 1);
    });

    it("fires multiple times for multiple evictions", () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<number>({ maxSize: 1, onEvict });

      cache.set("a", 1);
      cache.set("b", 2); // Evicts "a"
      cache.set("c", 3); // Evicts "b"

      expect(onEvict).toHaveBeenCalledTimes(2);
      expect(onEvict).toHaveBeenNthCalledWith(1, "a", 1);
      expect(onEvict).toHaveBeenNthCalledWith(2, "b", 2);
    });

    it("does not fire when key is overwritten (no eviction)", () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<number>({ maxSize: 2, onEvict });

      cache.set("a", 1);
      cache.set("a", 2); // Overwrite, not eviction

      expect(onEvict).not.toHaveBeenCalled();
    });

    it("does not fire when cache is not at capacity", () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<number>({ maxSize: 10, onEvict });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      expect(onEvict).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Size
  // ---------------------------------------------------------------------------

  describe("size", () => {
    it("starts at 0", () => {
      const cache = new LRUCache<number>({ maxSize: 3 });
      expect(cache.size).toBe(0);
    });

    it("increases when items are added", () => {
      const cache = new LRUCache<number>({ maxSize: 3 });
      cache.set("a", 1);
      expect(cache.size).toBe(1);
      cache.set("b", 2);
      expect(cache.size).toBe(2);
    });

    it("does not exceed maxSize", () => {
      const cache = new LRUCache<number>({ maxSize: 2 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      expect(cache.size).toBe(2);
    });

    it("decreases when items are deleted", () => {
      const cache = new LRUCache<number>({ maxSize: 3 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.delete("a");
      expect(cache.size).toBe(1);
    });

    it("does not increase when overwriting", () => {
      const cache = new LRUCache<number>({ maxSize: 3 });
      cache.set("a", 1);
      cache.set("a", 2);
      expect(cache.size).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  describe("clear", () => {
    it("removes all entries", () => {
      const cache = new LRUCache<number>({ maxSize: 3 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.has("a")).toBe(false);
      expect(cache.has("b")).toBe(false);
      expect(cache.has("c")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Entries iterator
  // ---------------------------------------------------------------------------

  describe("entries", () => {
    it("yields all entries in LRU to MRU order", () => {
      const cache = new LRUCache<number>({ maxSize: 3 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      const entries = [...cache.entries()];
      expect(entries).toEqual([
        ["a", 1],
        ["b", 2],
        ["c", 3],
      ]);
    });

    it("reflects access order after get", () => {
      const cache = new LRUCache<number>({ maxSize: 3 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      // Access "a" to make it most recently used
      cache.get("a");

      const entries = [...cache.entries()];
      expect(entries).toEqual([
        ["b", 2],
        ["c", 3],
        ["a", 1],
      ]);
    });

    it("yields nothing for empty cache", () => {
      const cache = new LRUCache<number>({ maxSize: 3 });
      const entries = [...cache.entries()];
      expect(entries).toEqual([]);
    });
  });
});
