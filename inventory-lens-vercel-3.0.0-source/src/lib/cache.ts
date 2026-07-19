export interface BoundedTtlCacheOptions {
  /** Maximum live entries retained by the cache. */
  maxEntries: number;
  /** Entry lifetime measured from the most recent write. */
  ttlMs: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Small module-memory TTL/LRU cache. Reads refresh recency but never extend an
 * entry's lifetime, so stale enrichment data cannot survive indefinitely.
 */
export class BoundedTtlCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: BoundedTtlCacheOptions) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) {
      throw new RangeError("Cache maxEntries must be a positive integer.");
    }
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
      throw new RangeError("Cache ttlMs must be positive.");
    }
    this.maxEntries = options.maxEntries;
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }

    // Map iteration order is the eviction order. Touch on successful reads.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as K | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    return this.entries.size;
  }
}
