/**
 * Simple LRU Cache Implementation
 *
 * A minimal Least Recently Used cache with a max size cap.
 * Used for session management to prevent memory exhaustion from spam attacks.
 */

export interface LRUCacheOptions<V> {
  /** Maximum number of entries in the cache */
  maxSize: number;
  /** Optional callback when an entry is evicted */
  onEvict?: ((key: string, value: V) => void) | undefined;
}

/**
 * LRU (Least Recently Used) Cache
 *
 * Maintains a fixed-size cache where the least recently accessed items
 * are evicted when capacity is reached.
 */
export class LRUCache<V> {
  private readonly maxSize: number;
  private readonly cache = new Map<string, V>();
  private readonly onEvict: ((key: string, value: V) => void) | undefined;

  constructor(options: LRUCacheOptions<V>) {
    this.maxSize = options.maxSize;
    this.onEvict = options.onEvict;
  }

  /**
   * Get a value from the cache.
   * This marks the key as recently used.
   */
  get(key: string): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used) by deleting and re-adding
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  /**
   * Check if a key exists in the cache.
   * Does NOT update the access order.
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Set a value in the cache.
   * If the cache is full, evicts the least recently used entry.
   */
  set(key: string, value: V): void {
    // If key exists, delete it first (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest entry (first item in Map iteration order)
      const oldestKeyIterator = this.cache.keys().next();
      if (oldestKeyIterator.done) {
        throw new Error("Cache iteration failed unexpectedly");
      }
      const oldestKey = oldestKeyIterator.value;
      const oldestValue = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      if (this.onEvict && oldestValue !== undefined) {
        this.onEvict(oldestKey, oldestValue);
      }
    }
    this.cache.set(key, value);
  }

  /**
   * Delete a key from the cache.
   * Returns true if the key existed.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Get the current size of the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Iterate over all entries in the cache.
   * Order is from least recently used to most recently used.
   */
  *entries(): IterableIterator<[string, V]> {
    yield* this.cache.entries();
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }
}
