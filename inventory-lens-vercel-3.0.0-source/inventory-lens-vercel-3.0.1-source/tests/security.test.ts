import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoundedTtlCache } from "../src/lib/cache";
import {
  endpointUrl,
  safeRobloxThumbnailUrl,
} from "../src/lib/endpoints";
import {
  clearFandomCache,
  fetchFandomItemMetadata,
} from "../src/lib/fandom";
import { clearLocalExtensionData } from "../src/lib/local-data";
import { RobloxHttpClient } from "../src/lib/http";
import {
  DEPRECATED_CREDENTIAL_STORAGE_KEYS,
  EXTENSION_STORAGE_KEYS,
  migrateExtensionStorage,
  readDashboardTabId,
  type ExtensionStorageLike,
  type StorageAreaLike,
} from "../src/lib/storage";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function fakeStorageArea(initial: Record<string, unknown> = {}): StorageAreaLike & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      const requested = typeof keys === "string" ? [keys] : [...keys];
      return Object.fromEntries(requested.filter((key) => key in data).map((key) => [key, data[key]]));
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const key of typeof keys === "string" ? [keys] : keys) delete data[key];
    },
  };
}

beforeEach(() => clearFandomCache());

describe("bounded enrichment caches", () => {
  it("expires entries, refreshes LRU order, enforces its bound, and clears", () => {
    let now = 1_000;
    const cache = new BoundedTtlCache<string, string>({ maxEntries: 2, ttlMs: 100, now: () => now });
    cache.set("a", "first");
    cache.set("b", "second");
    expect(cache.get("a")).toBe("first");
    cache.set("c", "third");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.size).toBe(2);

    now = 1_100;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);

    cache.set("d", "fourth");
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe("remote URL boundaries", () => {
  it("accepts only credential-free HTTPS Roblox CDN thumbnails", () => {
    expect(safeRobloxThumbnailUrl("https://tr.rbxcdn.com/asset.png?x=1"))
      .toBe("https://tr.rbxcdn.com/asset.png?x=1");
    expect(safeRobloxThumbnailUrl("https://t0.rbxcdn.com/image.png")).toBe("https://t0.rbxcdn.com/image.png");

    for (const malicious of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg onload=alert(1)>",
      "http://tr.rbxcdn.com/image.png",
      "https://rbxcdn.com.evil.example/image.png",
      "https://user:secret@tr.rbxcdn.com/image.png",
      "https://example.com/image.png",
      "not a url",
    ]) {
      expect(safeRobloxThumbnailUrl(malicious)).toBeUndefined();
    }
  });

  it("keeps attacker-controlled path data inside one encoded endpoint segment", () => {
    const url = endpointUrl("users", `/v1/users/${encodeURIComponent("1/../../evil.example")}`);
    expect(url.origin).toBe("https://users.roblox.com");
    expect(url.pathname).toBe("/v1/users/1%2F..%2F..%2Fevil.example");
    expect(() => endpointUrl("users", "//evil.example/steal")).toThrow(/configured origin/i);
    expect(() => endpointUrl("users", "\\\\evil.example\\steal")).toThrow(/configured origin/i);
  });

  it("blocks arbitrary, insecure, or credential-bearing URLs before fetch", async () => {
    const fetch = vi.fn(async () => jsonResponse({ ok: true }));
    const client = new RobloxHttpClient({ fetch });
    for (const url of [
      "https://evil.example/collect",
      "http://inventory.roblox.com/v1/test",
      "https://user:password@inventory.roblox.com/v1/test",
      "https://inventory.roblox.com.evil.example/v1/test",
      "https://roblox.fandom.com/api.php",
    ]) {
      await expect(client.request(url)).rejects.toMatchObject({ code: "network" });
    }
    expect(fetch).not.toHaveBeenCalled();

    await expect(client.json("https://inventory.roblox.com/v1/test")).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("extension-owned storage", () => {
  it("migrates stale credential keys without deleting unrelated data", async () => {
    const session = fakeStorageArea({
      [EXTENSION_STORAGE_KEYS.dashboardTabId]: "bad-tab-id",
      [DEPRECATED_CREDENTIAL_STORAGE_KEYS[0]]: "old-secret",
      unrelated: "keep",
    });
    const local = fakeStorageArea({
      [DEPRECATED_CREDENTIAL_STORAGE_KEYS[2]]: "old-secret",
      unrelated: "keep",
    });
    const storage: ExtensionStorageLike = { session, local };

    await expect(migrateExtensionStorage(storage)).resolves.toEqual({
      schemaVersion: 2,
      removedInvalidDashboardTab: true,
    });
    expect(await readDashboardTabId(storage)).toBeUndefined();
    expect(session.data).toEqual({ unrelated: "keep" });
    expect(local.data).toEqual({ unrelated: "keep" });
  });

  it("preserves a valid tab ID and the clear control removes only owned keys and memory caches", async () => {
    const session = fakeStorageArea({ dashboardTabId: 42, unrelated: true });
    const local = fakeStorageArea({ apiKey: "legacy", unrelated: true });
    const storage: ExtensionStorageLike = { session, local };
    const wikiFetch = vi.fn(async () => jsonResponse({ query: { pages: [{
      title: "Catalog:Sample Hat",
      revisions: [{ slots: { main: { content: "{{Infobox accessory\n| id = 77\n}}" } } }],
    }] } }));
    const request = { key: "asset:77", kind: "asset" as const, id: "77", name: "Sample Hat" };

    await fetchFandomItemMetadata([request], { fetch: wikiFetch, throttleMs: 0 });
    await fetchFandomItemMetadata([request], { fetch: wikiFetch, throttleMs: 0 });
    expect(wikiFetch).toHaveBeenCalledOnce();
    await clearLocalExtensionData(storage);
    await fetchFandomItemMetadata([request], { fetch: wikiFetch, throttleMs: 0 });

    expect(wikiFetch).toHaveBeenCalledTimes(2);
    expect(session.data).toEqual({ unrelated: true });
    expect(local.data).toEqual({ unrelated: true });
  });
});
