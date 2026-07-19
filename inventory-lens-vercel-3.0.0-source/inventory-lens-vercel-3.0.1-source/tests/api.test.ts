import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFandomCache,
  fandomTitleCandidates,
  fetchFandomItemMetadata,
  fetchFandomPurchaseMetadata,
  parseFandomItemWikitext,
  parseFandomPurchaseWikitext,
} from "../src/lib/fandom";
import { groupInventoryRecords } from "../src/lib/grouping";
import { parseGiftRewardReference, parseGiftSourceReference } from "../src/lib/gifts";
import { RobloxHttpClient, retryDelay, type FetchLike } from "../src/lib/http";
import { canViewInventory } from "../src/lib/inventory";
import { listCreatedPlaces, listLegacyMakeup, listOwnedBundles, listPublicAssets } from "../src/lib/legacy";
import { clearMetadataCaches, fetchCatalogMetadata, fetchThumbnails } from "../src/lib/metadata";
import { scanInventory } from "../src/lib/scanner";
import { ScanError, type NormalizedInventoryRecord } from "../src/lib/types";
import { fetchUserAvatarThumbnail, resolveUserInput } from "../src/lib/users";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(init.headers)) },
  });
}

function fetchMock(handler: (url: URL, init: RequestInit) => Response | Promise<Response>): FetchLike {
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => handler(new URL(input.toString()), init));
}

beforeEach(() => {
  clearMetadataCaches();
  clearFandomCache();
});

describe("RobloxHttpClient", () => {
  it("always omits cookies and strips supplied credential headers", async () => {
    const fetch = fetchMock((_url, init) => {
      expect(init.credentials).toBe("omit");
      return jsonResponse({ ok: true });
    });
    const client = new RobloxHttpClient({ fetch });
    await client.json("https://inventory.roblox.com/v1/test", {
      credentials: "include",
      headers: {
        "x-api-key": "secret",
        authorization: "Bearer secret",
        cookie: ".ROBLOSECURITY=secret",
      },
    });

    const headers = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers);
    expect(headers.has("x-api-key")).toBe(false);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
  });

  it("honors Retry-After on 429 and then succeeds", async () => {
    const waits: number[] = [];
    const fetch = fetchMock(() =>
      vi.mocked(fetch).mock.calls.length === 1
        ? jsonResponse({}, { status: 429, headers: { "Retry-After": "0.25" } })
        : jsonResponse({ value: 1 }),
    );
    const client = new RobloxHttpClient({ fetch, sleep: async (milliseconds) => { waits.push(milliseconds); } });
    await expect(client.json("https://inventory.roblox.com/test")).resolves.toEqual({ value: 1 });
    // Retry-After is defined in whole seconds. Be conservative if Roblox
    // emits a fractional value so the retry cannot immediately hit 429 again.
    expect(waits).toEqual([1_000]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("maps authentication, privacy, not-found, and exhausted rate errors", async () => {
    const cases: Array<[number, Parameters<RobloxHttpClient["request"]>[2], string]> = [
      [401, {}, "permissionDenied"],
      [403, { inventoryRequest: true }, "privateInventory"],
      [404, {}, "notFound"],
      [429, {}, "rateLimited"],
    ];
    for (const [status, context, code] of cases) {
      const client = new RobloxHttpClient({
        fetch: fetchMock(() => jsonResponse({ message: status === 403 ? "Inventory is private" : "failed" }, { status })),
        sleep: async () => undefined,
        maxRateLimitRetries: 0,
      });
      await expect(client.request("https://inventory.roblox.com/test", {}, context)).rejects.toMatchObject({ code });
    }
  });

  it("understands reset headers", () => {
    const response = jsonResponse({}, { status: 429, headers: { "x-ratelimit-reset": "5" } });
    expect(retryDelay(response, 0, 1_000)).toBe(4_000);
  });

  it("uses the longest reset when Fetch combines Roblox quota headers", () => {
    const response = jsonResponse({}, {
      status: 429,
      headers: { "x-ratelimit-reset": "41, 0", "x-ratelimit-remaining": "99, 0" },
    });
    expect(retryDelay(response, 0, 1_700_000_000_000)).toBe(41_000);
  });

  it("distinguishes an explicit private-inventory response from a generic denial", async () => {
    const privateInventory = new RobloxHttpClient({
      fetch: fetchMock(() => jsonResponse({ message: "Inventory is private" }, { status: 403 })),
    });
    await expect(privateInventory.request("https://inventory.roblox.com/test", {}, { inventoryRequest: true }))
      .rejects.toMatchObject({ code: "privateInventory" });

    const forbidden = new RobloxHttpClient({
      fetch: fetchMock(() => jsonResponse({
        code: "PERMISSION_DENIED",
        message: "The request does not have sufficient permissions.",
      }, { status: 403 })),
    });
    await expect(forbidden.request("https://inventory.roblox.com/test", {}, { inventoryRequest: true }))
      .rejects.toMatchObject({ code: "permissionDenied" });
  });
});

describe("user resolution", () => {
  it("resolves a username and attaches a completed headshot", async () => {
    const fetch = fetchMock((url, init) => {
      if (url.hostname === "users.roblox.com") {
        expect(init.method).toBe("POST");
        return jsonResponse({ data: [{ id: 10, name: "SamplePlayer", displayName: "Sample Player", hasVerifiedBadge: true }] });
      }
      return jsonResponse({ data: [{ state: "Completed", imageUrl: "https://tr.rbxcdn.com/head.png" }] });
    });
    await expect(resolveUserInput("SamplePlayer", { client: new RobloxHttpClient({ fetch }) })).resolves.toEqual({
      id: "10",
      name: "SamplePlayer",
      displayName: "Sample Player",
      hasVerifiedBadge: true,
      thumbnailUrl: "https://tr.rbxcdn.com/head.png",
    });
  });

  it("reports a missing username", async () => {
    const client = new RobloxHttpClient({ fetch: fetchMock(() => jsonResponse({ data: [] })) });
    await expect(resolveUserInput("NoSuchPlayer", { client })).rejects.toMatchObject({ code: "notFound" });
  });

  it("loads a completed full-body avatar render for the graphic builder", async () => {
    const fetch = fetchMock((url, init) => {
      expect(url.pathname).toBe("/v1/users/avatar");
      expect(url.searchParams.get("userIds")).toBe("10");
      expect(url.searchParams.get("size")).toBe("720x720");
      expect(init.credentials).toBe("omit");
      return jsonResponse({ data: [{ state: "Completed", imageUrl: "https://tr.rbxcdn.com/avatar.png" }] });
    });

    await expect(fetchUserAvatarThumbnail("10", { client: new RobloxHttpClient({ fetch }) }))
      .resolves.toBe("https://tr.rbxcdn.com/avatar.png");
  });

  it("polls a bounded pending full-body avatar render until it completes", async () => {
    let request = 0;
    const sleep = vi.fn(async () => undefined);
    const fetch = fetchMock(() => {
      request += 1;
      return jsonResponse({ data: [request === 1
        ? { state: "Pending" }
        : { state: "Completed", imageUrl: "https://tr.rbxcdn.com/avatar-ready.png" }] });
    });

    await expect(fetchUserAvatarThumbnail("10", {
      client: new RobloxHttpClient({ fetch }),
      pendingRetries: 2,
      pendingRetryDelayMs: 1,
      sleep,
    })).resolves.toBe("https://tr.rbxcdn.com/avatar-ready.png");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1, undefined);
  });
});

describe("public asset inventory pagination", () => {
  it("requests one numeric AssetType at a time, paginates at 100, and preserves userAssetId", async () => {
    const seenUrls: URL[] = [];
    const fetch = fetchMock((url) => {
      seenUrls.push(url);
      if (!url.searchParams.has("cursor")) {
        return jsonResponse({
          data: [{ userAssetId: 46364, assetId: 1039432, assetName: "O NOES", created: "2009-01-01T00:00:00Z" }],
          nextPageCursor: "next",
        });
      }
      return jsonResponse({ data: [], nextPageCursor: "" });
    });
    const result = await listPublicAssets([8], {
      userId: "24680",
      client: new RobloxHttpClient({ fetch }),
    });

    expect(result.pages).toBe(2);
    expect(result.completedAssetTypeIds).toEqual([8]);
    expect(result.items).toEqual([expect.objectContaining({
      assetTypeId: 8,
      userAssetId: 46364,
      assetId: 1039432,
    })]);
    expect(seenUrls.map((url) => url.pathname)).toEqual([
      "/v2/users/24680/inventory/8",
      "/v2/users/24680/inventory/8",
    ]);
    expect(seenUrls.map((url) => url.searchParams.get("limit"))).toEqual(["100", "100"]);
    expect(seenUrls.map((url) => url.searchParams.get("cursor"))).toEqual([null, "next"]);
  });

  it("stops safely when Roblox repeats a public cursor", async () => {
    const fetch = fetchMock((url) => jsonResponse({
      data: [{ userAssetId: url.searchParams.has("cursor") ? 2 : 1, assetId: 5 }],
      nextPageCursor: "repeat",
    }));
    const result = await listPublicAssets([8], {
      userId: "1",
      client: new RobloxHttpClient({ fetch }),
    });
    expect(result.stoppedBecause).toBe("repeatedToken");
    expect(result.partialAssetTypeIds).toEqual([8]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops safely at configured page and item ceilings", async () => {
    const pageFetch = fetchMock((url) => jsonResponse({
      data: [{ userAssetId: url.searchParams.get("cursor") || "first", assetId: 5 }],
      nextPageCursor: `page-${url.searchParams.get("cursor") || "one"}`,
    }));
    const pageLimited = await listPublicAssets([8, 41], {
      userId: "1",
      client: new RobloxHttpClient({ fetch: pageFetch }),
      maxPages: 2,
    });
    expect(pageLimited.stoppedBecause).toBe("safetyLimit");
    expect(pageLimited.partialAssetTypeIds).toEqual([8]);
    expect(pageLimited.unscannedAssetTypeIds).toEqual([41]);
    expect(pageFetch).toHaveBeenCalledTimes(2);

    const itemFetch = fetchMock(() => jsonResponse({
      data: [{ userAssetId: 1, assetId: 5 }, { userAssetId: 2, assetId: 6 }],
      nextPageCursor: "more",
    }));
    const itemLimited = await listPublicAssets([8], {
      userId: "1",
      client: new RobloxHttpClient({ fetch: itemFetch }),
      maxItems: 1,
    });
    expect(itemLimited.items).toHaveLength(1);
    expect(itemLimited.stoppedBecause).toBe("safetyLimit");
    expect(itemFetch).toHaveBeenCalledOnce();
  });

  it("honors pause checkpoints and cancellation", async () => {
    const waitIfPaused = vi.fn(async () => undefined);
    const fetch = fetchMock(() => jsonResponse({ data: [] }));
    await listPublicAssets([8], {
      userId: "1",
      client: new RobloxHttpClient({ fetch }),
      waitIfPaused,
    });
    expect(waitIfPaused).toHaveBeenCalledOnce();

    const controller = new AbortController();
    controller.abort();
    await expect(listPublicAssets([8], {
      userId: "1",
      client: new RobloxHttpClient({ fetch }),
      signal: controller.signal,
    })).rejects.toMatchObject({ code: "cancelled" });
  });

  it("keeps completed pages and stops before hammering later types after a persistent 429", async () => {
    const fetch = fetchMock((url) => {
      if (!url.searchParams.has("cursor")) {
        return jsonResponse({
          data: [{ userAssetId: 1, assetId: 5 }],
          nextPageCursor: "checkpoint-a",
        });
      }
      return jsonResponse({}, { status: 429 });
    });
    const result = await listPublicAssets([8, 41], {
      userId: "1",
      client: new RobloxHttpClient({ fetch, maxRateLimitRetries: 0 }),
    });

    expect(result.items).toHaveLength(1);
    expect(result.partialAssetTypeIds).toEqual([8]);
    expect(result.unscannedAssetTypeIds).toEqual([41]);
    expect(result.stoppedBecause).toBe("rateLimited");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("uses Roblox's public visibility signal", async () => {
    for (const value of [true, false]) {
      const fetch = fetchMock((url, init) => {
        expect(url.pathname).toBe("/v1/users/1/can-view-inventory");
        expect(init.credentials).toBe("omit");
        return jsonResponse({ canView: value });
      });
      await expect(canViewInventory({
        userId: "1",
        client: new RobloxHttpClient({ fetch }),
      })).resolves.toBe(value);
    }
  });
});

describe("compatibility adapters", () => {
  it("requests makeup 88/89/90 separately with legacy userAsset IDs", async () => {
    const seenTypes: string[] = [];
    const fetch = fetchMock((url) => {
      seenTypes.push(url.pathname.split("/").at(-1)!);
      expect(url.searchParams.get("limit")).toBe("100");
      return jsonResponse({ data: [{ userAssetId: 100, assetId: 200, assetName: "Makeup" }] });
    });
    const result = await listLegacyMakeup([88, 89, 90], { userId: "1", client: new RobloxHttpClient({ fetch }) });
    expect(seenTypes).toEqual(["88", "89", "90"]);
    expect(result.items.map(({ assetTypeId }) => assetTypeId)).toEqual([88, 89, 90]);
  });

  it("paginates bundles separately", async () => {
    const fetch = fetchMock((url) => {
      expect(url.hostname).toBe("catalog.roblox.com");
      expect(url.searchParams.get("sortOrder")).toBe("1");
      return jsonResponse({ data: [{ id: 7, name: "Robot" }] });
    });
    const result = await listOwnedBundles({ userId: "1", client: new RobloxHttpClient({ fetch }) });
    expect(result.items[0]).toMatchObject({ id: 7, name: "Robot" });
  });

  it("loads only the public Created places tab", async () => {
    const fetch = fetchMock((url) => {
      expect(url.pathname).toBe("/v1/users/1/places/inventory");
      expect(url.searchParams.get("placesTab")).toBe("Created");
      expect(url.searchParams.get("itemsPerPage")).toBe("100");
      return jsonResponse({ data: [{ universeId: 6, placeId: 9, name: "Home" }] });
    });
    const result = await listCreatedPlaces({ userId: "1", client: new RobloxHttpClient({ fetch }) });
    expect(result.items[0]).toMatchObject({ universeId: 6, placeId: 9, name: "Home" });
  });
});

describe("Roblox Wiki historical purchase enrichment", () => {
  const sinisterWikitext = `{{Infobox accessory
|description = Ironically Sinister^2 is round.
|id = 313545101
}}
It could have been purchased for 150 Robux before going off-sale.
As of November 16, 2023, it has been [[Marketplace|purchased]] 8,857 times.
It was purchased 7,000 times in an older undated snapshot.`;

  it("extracts an ID-validated purchase count and its nearest as-of date", () => {
    expect(parseFandomPurchaseWikitext(sinisterWikitext)).toEqual({
      ids: ["313545101"],
      count: 8_857,
      asOf: "November 16, 2023",
    });
    expect(parseFandomPurchaseWikitext(`{{Infobox accessory|id = 1}}
      It could have been purchased for 70 Robux.`)).toBeUndefined();
    expect(parseFandomPurchaseWikitext(`{{Infobox accessory|id = 1}}
      It was purchased approximately 70 times.`)).toBeUndefined();
  });

  it("keeps event, publication, favorite, and distribution evidence typed separately", () => {
    const ghost = parseFandomItemWikitext(`{{Infobox accessory
| id = 181434601
}}
Ghost Fedora is a hat that was published in the marketplace on October 13, 2014.
It could have been obtained as a prize in the Hallow's Eve 2014 event.
As of March 20, 2026, it has been favorited 23,459 times.
[[Category:Event prizes]]`);
    expect(ghost).toMatchObject({
      ids: ["181434601"],
      publishedAt: "October 13, 2014",
      favoriteCount: 23_459,
      favoriteAsOf: "March 20, 2026",
      acquisitionKinds: ["eventPrize"],
    });
    expect(ghost?.purchaseCount).toBeUndefined();
    expect(ghost?.distributionCount).toBeUndefined();

    const festive = parseFandomItemWikitext(`{{Infobox accessory
| id = 189963816
}}
Festive Sword Valkyrie was published in the marketplace on December 10, 2014.
It could have been obtained as a prize during the ROBLOX Holiday 2014 event.
As of January 8, 2022, it has been obtained 88,527 times and favorited 19,888 times.`);
    expect(festive).toMatchObject({
      publishedAt: "December 10, 2014",
      favoriteCount: 19_888,
      favoriteAsOf: "January 8, 2022",
      distributionCount: 88_527,
      distributionLabel: "awards",
      distributionAsOf: "January 8, 2022",
      acquisitionKinds: ["eventPrize"],
    });

    const chicago = parseFandomItemWikitext(`{{Infobox accessory
| id = 110892235
}}
Chicago BLOXcon Black Fedora was published in the marketplace on July 16, 2013.
It was given to BLOXcon Chicago 2013 attendees who purchased their tickets before the deadline.
As of March 20, 2026, it has been favorited 130 times.`);
    expect(chicago).toMatchObject({
      publishedAt: "July 16, 2013",
      favoriteCount: 130,
      acquisitionKinds: ["inPersonEvent"],
    });
  });

  it("retains an ID-matched event page even when it has no purchase statement", async () => {
    const content = `{{Infobox accessory
| id = 181434601
}}
Ghost Fedora was published in the marketplace on October 13, 2014.
It could have been obtained as a prize in the Hallow's Eve 2014 event.`;
    const fetch = fetchMock(() => jsonResponse({ query: { pages: [{
      pageid: 1,
      title: "Catalog:Ghost Fedora",
      revisions: [{ slots: { main: { content } } }],
    }] } }));
    const request = { key: "asset:181434601", kind: "asset" as const, id: "181434601", name: "Ghost Fedora" };

    const itemHistory = await fetchFandomItemMetadata([request], { fetch, throttleMs: 0 });
    expect(itemHistory.get(request.key)).toMatchObject({
      id: "181434601",
      purchaseCount: undefined,
      publishedAt: "October 13, 2014",
      acquisitionKinds: ["eventPrize"],
    });
    await expect(fetchFandomPurchaseMetadata([request], { fetch, throttleMs: 0 })).resolves.toEqual(new Map());
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("normalizes superscript names to Roblox Wiki's caret title", () => {
    expect(fandomTitleCandidates("Sinister²")).toEqual([
      "Catalog:Sinister²",
      "Catalog:Sinister^2",
    ]);
  });

  it("uses batched anonymous MediaWiki requests and caches Sinister's 8,857 purchases", async () => {
    const fetch = fetchMock((url, init) => {
      expect(url.origin + url.pathname).toBe("https://roblox.fandom.com/api.php");
      expect(url.searchParams.get("action")).toBe("query");
      expect(url.searchParams.get("prop")).toBe("revisions");
      expect(url.searchParams.get("redirects")).toBe("1");
      expect(url.searchParams.get("titles")?.split("|")).toEqual([
        "Catalog:Sinister²",
        "Catalog:Sinister^2",
      ]);
      expect(init.method).toBe("GET");
      expect(init.credentials).toBe("omit");
      expect(new Headers(init.headers).has("x-api-key")).toBe(false);
      return jsonResponse({ query: { pages: [{
        pageid: 113269,
        title: "Catalog:Sinister^2",
        revisions: [{ slots: { main: { content: sinisterWikitext } } }],
      }] } });
    });
    const request = { key: "asset:313545101", kind: "asset" as const, id: "313545101", name: "Sinister²" };
    const first = await fetchFandomPurchaseMetadata([request], { fetch, throttleMs: 0 });
    const second = await fetchFandomPurchaseMetadata([request], { fetch, throttleMs: 0 });

    expect(first.get(request.key)).toEqual({
      key: request.key,
      id: "313545101",
      count: 8_857,
      pageTitle: "Catalog:Sinister^2",
      sourceUrl: "https://roblox.fandom.com/wiki/Catalog%3ASinister%5E2",
      asOf: "November 16, 2023",
    });
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("limits a request to 20 titles, throttles batches, and negative-caches mismatches", async () => {
    const waits: number[] = [];
    const fetch = fetchMock(() => jsonResponse({ query: { pages: [{
      pageid: 1,
      title: "Catalog:Wrong item",
      revisions: [{ slots: { main: { content: "{{Infobox accessory\n| id = 999\n}} Purchased 10 times." } } }],
    }] } }));
    const requests = Array.from({ length: 21 }, (_, index) => ({
      key: `asset:${index + 1}`,
      kind: "asset" as const,
      id: String(index + 1),
      name: `Item ${index + 1}`,
    }));
    const first = await fetchFandomPurchaseMetadata(requests, {
      fetch,
      throttleMs: 125,
      sleep: async (milliseconds) => { waits.push(milliseconds); },
    });
    const second = await fetchFandomPurchaseMetadata(requests, { fetch, throttleMs: 0 });

    expect(first.size).toBe(0);
    expect(second.size).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([125]);
    for (const [input] of vi.mocked(fetch).mock.calls) {
      expect(new URL(input.toString()).searchParams.get("titles")!.split("|").length).toBeLessThanOrEqual(20);
    }
  });

  it("caps optional wiki rate-limit waiting and stops later batches", async () => {
    const waits: number[] = [];
    const warnings: string[] = [];
    const fetch = fetchMock(() => jsonResponse({}, {
      status: 429,
      headers: { "retry-after": "120" },
    }));
    const requests = Array.from({ length: 21 }, (_, index) => ({
      key: `asset:${index + 1}`,
      kind: "asset" as const,
      id: String(index + 1),
      name: `Rate limited item ${index + 1}`,
    }));

    await expect(fetchFandomPurchaseMetadata(requests, {
      fetch,
      throttleMs: 0,
      sleep: async (milliseconds) => { waits.push(milliseconds); },
      onWarning: (warning) => warnings.push(warning),
    })).resolves.toEqual(new Map());

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([10_000]);
    expect(warnings).toEqual(["Roblox Wiki item history was unavailable (429)."]);
  });

  it("keeps encoded MediaWiki request URLs within a conservative length", async () => {
    const lengths: number[] = [];
    const fetch = fetchMock((url) => {
      lengths.push(url.toString().length);
      return jsonResponse({ query: { pages: [] } });
    });
    const requests = Array.from({ length: 18 }, (_, index) => ({
      key: `asset:${index + 1}`,
      kind: "asset" as const,
      id: String(index + 1),
      name: `Unicode ${"🧪".repeat(80)} ${index + 1}`,
    }));

    await fetchFandomPurchaseMetadata(requests, { fetch, throttleMs: 0 });

    expect(lengths.length).toBeGreaterThan(1);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(6_000);
  });
});

describe("official gift reward descriptions", () => {
  it("extracts Ghost Tie's named source gift without including the release date", () => {
    expect(parseGiftSourceReference(
      `Ghosts usually like \"Boo\" ties, but in this case they made an exception.
       This item came out of the Gift of the Ghastly Ghostie on Oct 5, 2012`,
    )).toEqual({
      sourceName: "Gift of the Ghastly Ghostie",
      evidence: "officialDescription",
    });
    expect(parseGiftSourceReference(
      "This item came out of the Gift of the Ghastly Ghostie on Oct. 5, 2012.",
    )).toEqual({
      sourceName: "Gift of the Ghastly Ghostie",
      evidence: "officialDescription",
    });
  });

  it("accepts only explicit item-to-named-gift relationships", () => {
    expect(parseGiftSourceReference("This item was contained in the Opened Gift of Testing."))
      .toMatchObject({ sourceName: "Opened Gift of Testing" });
    expect(parseGiftSourceReference("This item came from the Gift of Testing."))
      .toMatchObject({ sourceName: "Gift of Testing" });
    expect(parseGiftSourceReference("This item came from out of the Gift of Testing."))
      .toMatchObject({ sourceName: "Gift of Testing" });
    expect(parseGiftSourceReference("A ghost came out of the gift shop.")).toBeUndefined();
    expect(parseGiftSourceReference("This item makes a great Gift for your friends.")).toBeUndefined();
    expect(parseGiftSourceReference("This item came out of the Gift Shop downtown.")).toBeUndefined();
    expect(parseGiftSourceReference("This item came out of a Gift.")).toBeUndefined();
    expect(parseGiftSourceReference("Owners of this Gift received a surprise.")).toBeUndefined();
  });

  it("parses only a single, explicit source-side reward", () => {
    expect(parseGiftRewardReference("Inside you find... the Ghost Tie!")).toEqual({
      rewardName: "Ghost Tie",
      evidence: "officialDescription",
    });
    expect(parseGiftRewardReference("Inside you find\u2026 Ghost Tie!")).toMatchObject({ rewardName: "Ghost Tie" });
    expect(parseGiftRewardReference("Inside you might find... the Ghost Tie!")).toBeUndefined();
    expect(parseGiftRewardReference("Inside you find... Ghost Tie and Ghost Fedora!")).toBeUndefined();
    expect(parseGiftRewardReference("Inside you find... a surprise!")).toBeUndefined();
    expect(parseGiftRewardReference("Open it! Inside you find... the Ghost Tie!")).toBeUndefined();
  });
});

describe("metadata enrichment", () => {
  it("batches catalog details at 120 and completes one anonymous CSRF challenge", async () => {
    let call = 0;
    const batchSizes: number[] = [];
    const fetch = fetchMock((_url, init) => {
      call += 1;
      expect(init.credentials).toBe("omit");
      const token = new Headers(init.headers).get("x-csrf-token");
      if (call === 1) return jsonResponse({}, { status: 403, headers: { "x-csrf-token": "challenge" } });
      expect(token).toBe("challenge");
      const items = (JSON.parse(String(init.body)) as { items: Array<{ id: number; itemType: "Asset" }> }).items;
      batchSizes.push(items.length);
      return jsonResponse({ data: items.map(({ id, itemType }) => ({
        id,
        itemType,
        name: `Item ${id}`,
        assetType: 8,
        creatorName: "Roblox",
        creatorType: "User",
        creatorTargetId: 1,
        itemStatus: ["Sale"],
        itemRestrictions: [],
        totalQuantity: 0,
        price: 0,
        priceStatus: "Free",
        isOffSale: false,
        favoriteCount: id === 1 ? 23_858 : 0,
        itemCreatedUtc: id === 1 ? "2014-10-13T00:00:00Z" : undefined,
        description: id === 1 ? "This item came out of the Gift of Testing on October 5, 2012." : undefined,
      })) });
    });
    const metadata = await fetchCatalogMetadata(
      Array.from({ length: 121 }, (_, index) => ({ id: String(index + 1), itemType: "Asset" as const })),
      { client: new RobloxHttpClient({ fetch }) },
    );
    expect(batchSizes).toEqual([120, 1]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(metadata.get("asset:1")).toMatchObject({
      assetType: 8,
      creatorName: "Roblox",
      creatorType: "User",
      creatorTargetId: "1",
      itemStatus: ["Sale"],
      price: 0,
      priceStatus: "Free",
      isOffSale: false,
      favoriteCount: 23_858,
      createdAt: "2014-10-13T00:00:00Z",
      description: "This item came out of the Gift of Testing on October 5, 2012.",
    });
  });

  it("preserves ambiguous and missing official sale fields as unknown", async () => {
    let call = 0;
    const fetch = fetchMock(() => {
      call += 1;
      if (call === 1) return jsonResponse({}, { status: 403, headers: { "x-csrf-token": "challenge" } });
      return jsonResponse({ data: [
        {
          id: 901,
          itemType: "Asset",
          name: "No resellers",
          itemRestrictions: [],
          itemStatus: [],
          price: 100,
          priceStatus: "NoResellers",
        },
        {
          id: 902,
          itemType: "Asset",
          name: "Missing status",
          itemRestrictions: [],
        },
      ] });
    });
    const metadata = await fetchCatalogMetadata([
      { id: "901", itemType: "Asset" },
      { id: "902", itemType: "Asset" },
    ], { client: new RobloxHttpClient({ fetch }) });
    const records: NormalizedInventoryRecord[] = [
      { key: "asset:901", kind: "asset", id: "901", categoryId: "accessories.head", copy: { instanceId: "a", source: "legacy" } },
      { key: "asset:902", kind: "asset", id: "902", categoryId: "accessories.head", copy: { instanceId: "b", source: "legacy" } },
    ];

    expect(metadata.get("asset:901")).toMatchObject({ price: 100, priceStatus: "NoResellers", itemStatus: [] });
    expect(metadata.get("asset:902")).toMatchObject({ itemStatus: [] });
    expect(groupInventoryRecords(records, { catalog: metadata }).map(({ saleStatus }) => saleStatus))
      .toEqual(["unknown", "unknown"]);
  });

  it("uses asset, bundle, badge, and game-pass thumbnail routes in batches of at most 100", async () => {
    const batchCounts: number[] = [];
    const fetch = fetchMock((url) => {
      const parameter = ["assetIds", "bundleIds", "badgeIds", "gamePassIds"].find((name) => url.searchParams.has(name))!;
      const ids = url.searchParams.get(parameter)!.split(",");
      batchCounts.push(ids.length);
      return jsonResponse({ data: ids.map((id) => ({ targetId: id, state: "Completed", imageUrl: `https://tr.rbxcdn.com/${id}.png` })) });
    });
    const records: NormalizedInventoryRecord[] = [
      ...Array.from({ length: 101 }, (_, i): NormalizedInventoryRecord => ({
        key: `asset:${i}`, kind: "asset", id: String(i), categoryId: "accessories.head", copy: { instanceId: String(i), source: "legacy" },
      })),
      { key: "bundle:1", kind: "bundle", id: "1", categoryId: "bundles", copy: { instanceId: "b", source: "bundle" } },
      { key: "badge:2", kind: "badge", id: "2", categoryId: "badges", copy: { instanceId: "c", source: "legacy" } },
      { key: "gamePass:3", kind: "gamePass", id: "3", categoryId: "passes", copy: { instanceId: "d", source: "legacy" } },
    ];
    const thumbnails = await fetchThumbnails(records, { client: new RobloxHttpClient({ fetch }) });
    expect(batchCounts).toEqual([100, 1, 1, 1, 1]);
    expect(thumbnails.get("gamePass:3")).toBe("https://tr.rbxcdn.com/3.png");
  });
});

describe("scan orchestration", () => {
  it("stops a bundle-only private scan at the public visibility preflight", async () => {
    const visited: string[] = [];
    const fetch = fetchMock((url) => {
      visited.push(`${url.hostname}${url.pathname}`);
      if (url.hostname === "users.roblox.com") return jsonResponse({ id: 1, name: "Player", displayName: "Player" });
      if (url.hostname === "thumbnails.roblox.com") return jsonResponse({ data: [] });
      if (url.pathname === "/v1/users/1/can-view-inventory") return jsonResponse({ canView: false });
      throw new Error(`Unexpected request ${url}`);
    });
    await expect(scanInventory({ input: "1", categoryIds: ["bundles"], fetch }))
      .rejects.toMatchObject({ code: "privateInventory" });
    expect(visited.some((url) => url.startsWith("catalog.roblox.com"))).toBe(false);
  });

  it("counts Sinister² copies and keeps 8,857 wiki purchases distinct from owners", async () => {
    const fetch = fetchMock((url, init) => {
      if (url.hostname === "users.roblox.com") {
        return jsonResponse({ data: [{ id: 1, name: "Player", displayName: "Player" }] });
      }
      if (url.pathname.includes("avatar-headshot")) return jsonResponse({ data: [] });
      if (url.pathname === "/v1/users/1/can-view-inventory") return jsonResponse({ canView: true });
      if (url.pathname === "/v2/users/1/inventory/8") return jsonResponse({ data: [
        { userAssetId: "one", assetId: "313545101", assetName: "Sinister²" },
        { userAssetId: "two", assetId: "313545101", assetName: "Sinister²" },
      ] });
      if (url.hostname === "catalog.roblox.com") {
        expect(init.method).toBe("POST");
        return jsonResponse({ data: [{
          id: 313545101,
          itemType: "Asset",
          name: "Sinister²",
          assetType: 8,
          collectibleItemId: "uuid",
          itemStatus: [],
          itemRestrictions: [],
          totalQuantity: 0,
          price: 0,
          priceStatus: "Off Sale",
          isOffSale: true,
          sales: 0,
        }] });
      }
      if (url.hostname === "roblox.fandom.com") return jsonResponse({ query: { pages: [{
        pageid: 113269,
        title: "Catalog:Sinister^2",
        revisions: [{ slots: { main: { content: `{{Infobox accessory
| id = 313545101
}}
As of November 16, 2023, it has been purchased 8,857 times.` } } }],
      }] } });
      if (url.pathname === "/v1/assets") return jsonResponse({ data: [{ targetId: 313545101, state: "Completed", imageUrl: "https://tr.rbxcdn.com/sinister.png" }] });
      throw new Error(`Unexpected request ${url}`);
    });
    const result = await scanInventory({ input: "Player", categoryIds: ["accessories.head"], fetch });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      name: "Sinister²",
      isLimited: false,
      saleStatus: "offSale",
      rarity: {
        kind: "wikiPurchases",
        count: 8_857,
        label: "Historical purchases",
        asOf: "November 16, 2023",
      },
      assetType: "HAT",
    });
    expect(result.items[0]?.copies).toHaveLength(2);
  });

  it("maps Ghost Tie's official description to its owned opened gift and gift history", async () => {
    const fetch = fetchMock((url, init) => {
      if (url.hostname === "users.roblox.com") {
        return jsonResponse({ data: [{ id: 1, name: "Player", displayName: "Player" }] });
      }
      if (url.pathname.includes("avatar-headshot")) return jsonResponse({ data: [] });
      if (url.pathname === "/v1/users/1/can-view-inventory") return jsonResponse({ canView: true });
      if (url.pathname === "/v2/users/1/inventory/8") return jsonResponse({ data: [{
        userAssetId: "gift-copy",
        assetId: "94108159",
        assetName: "Opened Gift of the Ghastly Ghostie",
      }] });
      if (url.pathname === "/v2/users/1/inventory/43") return jsonResponse({ data: [{
        userAssetId: "tie-copy",
        assetId: "94260278",
        assetName: "Ghost Tie",
      }] });
      if (url.hostname === "catalog.roblox.com") {
        expect(init.method).toBe("POST");
        return jsonResponse({ data: [
          {
            id: 94108159,
            itemType: "Asset",
            name: "Opened Gift of the Ghastly Ghostie",
            assetType: 8,
            creatorName: "Roblox",
            itemRestrictions: [],
            isOffSale: true,
          },
          {
            id: 94260278,
            itemType: "Asset",
            name: "Ghost Tie",
            assetType: 43,
            creatorName: "Roblox",
            itemRestrictions: [],
            isOffSale: true,
            itemCreatedUtc: "2012-10-04T00:00:00Z",
            description: "This item came out of the Gift of the Ghastly Ghostie on Oct 5, 2012",
          },
        ] });
      }
      if (url.hostname === "roblox.fandom.com") return jsonResponse({ query: { pages: [{
        pageid: 1,
        title: "Catalog:Opened Gift of the Ghastly Ghostie",
        revisions: [{ slots: { main: { content: `{{Infobox accessory
| id = 94108159
}}
As of October 28, 2019, it has been purchased 9,534 times.` } } }],
      }] } });
      if (url.pathname === "/v1/assets") return jsonResponse({ data: [] });
      throw new Error(`Unexpected request ${url}`);
    });

    const result = await scanInventory({
      input: "Player",
      categoryIds: ["accessories.head", "accessories.neck"],
      fetch,
    });
    const tie = result.items.find(({ id }) => id === "94260278")!;
    const gift = result.items.find(({ id }) => id === "94108159")!;
    expect(tie.rarity).toMatchObject({ kind: "unavailable", count: null });
    expect(tie.giftOrigin).toMatchObject({
      sourceName: "Gift of the Ghastly Ghostie",
      sourceItemName: "Opened Gift of the Ghastly Ghostie",
      sourceOwnedCopies: 1,
      sourceMetric: {
        kind: "sourceGiftHistoricalPurchases",
        count: 9_534,
        asOf: "October 28, 2019",
      },
    });
    expect(tie.collector?.signals).toContainEqual(expect.objectContaining({ kind: "giftReward" }));
    expect(gift.rarity).toMatchObject({ kind: "wikiPurchases", count: 9_534 });
    expect(gift.giftRewards).toEqual([
      expect.objectContaining({ rewardItemId: "94260278", rewardItemName: "Ghost Tie", rewardOwnedCopies: 1 }),
    ]);
  });

  it("keeps public assets and reports protected no-login categories as unsupported", async () => {
    const fetch = fetchMock((url, init) => {
      if (url.hostname === "users.roblox.com") {
        return jsonResponse({ id: 2, name: "OtherPlayer", displayName: "Other Player" });
      }
      if (url.pathname.includes("avatar-headshot")) return jsonResponse({ data: [] });
      if (url.pathname === "/v1/users/2/can-view-inventory") return jsonResponse({ canView: true });
      if (url.pathname === "/v2/users/2/inventory/8") {
        return jsonResponse({ data: [{
          userAssetId: "copy-5",
          assetId: "5",
          assetName: "Public Hat",
        }] });
      }
      if (url.hostname === "catalog.roblox.com") {
        expect(init.method).toBe("POST");
        return jsonResponse({ data: [{
          id: 5,
          itemType: "Asset",
          name: "Public Hat",
          assetType: 8,
          itemRestrictions: [],
        }] });
      }
      if (url.hostname === "roblox.fandom.com") return jsonResponse({ query: { pages: [] } });
      if (url.pathname === "/v1/assets") {
        return jsonResponse({ data: [{ targetId: 5, state: "Completed", imageUrl: "https://tr.rbxcdn.com/5.png" }] });
      }
      throw new Error(`Unexpected request ${url}`);
    });

    const result = await scanInventory({
      input: "2",
      categoryIds: ["accessories.head", "places.purchased", "privateServers"],
      fetch,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: "5", name: "Public Hat" });
    expect(result.coverage).toEqual({
      scannedCategoryIds: ["accessories.head"],
      partialCategoryIds: [],
      unsupportedCategoryIds: ["places.purchased", "privateServers"],
    });
    expect(result.warnings.join(" ")).toContain("unavailable through Roblox's public no-login inventory APIs");
  });

  it("can reuse a resolved user and an earlier visibility check across scan stages", async () => {
    const visited: string[] = [];
    const fetch = fetchMock((url) => {
      visited.push(`${url.hostname}${url.pathname}`);
      if (url.hostname === "catalog.roblox.com" && url.pathname === "/v1/users/1/bundles") {
        return jsonResponse({ data: [], nextPageCursor: null });
      }
      throw new Error(`Unexpected repeated setup request ${url}`);
    });

    const result = await scanInventory({
      input: "ignored-after-resolution",
      categoryIds: ["bundles"],
      fetch,
      resolvedUser: {
        id: "1",
        name: "Player",
        displayName: "Player",
        hasVerifiedBadge: false,
      },
      skipVisibilityCheck: true,
    });

    expect(result.user.id).toBe("1");
    expect(visited).toEqual(["catalog.roblox.com/v1/users/1/bundles"]);
  });
});
