import { describe, expect, it, vi } from "vitest";
import { RobloxHttpClient, type FetchLike } from "../src/lib/http";
import { listPublicAssets } from "../src/lib/legacy";
import { scanInventory } from "../src/lib/scanner";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(init.headers)),
    },
  });
}

function fetchMock(handler: (url: URL, init: RequestInit) => Response | Promise<Response>): FetchLike {
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) =>
    handler(new URL(input.toString()), init));
}

describe("permission-aware public inventory scanning", () => {
  it("falls back to the selected public adapters when visibility preflight is generically denied", async () => {
    const visited: string[] = [];
    const fetch = fetchMock((url, init) => {
      visited.push(`${url.hostname}${url.pathname}`);
      if (url.hostname === "users.roblox.com") {
        return jsonResponse({ id: 1, name: "Player", displayName: "Player" });
      }
      if (url.pathname === "/v1/users/avatar-headshot") return jsonResponse({ data: [] });
      if (url.pathname === "/v1/users/1/can-view-inventory") {
        return jsonResponse({
          code: "PERMISSION_DENIED",
          message: "The request does not have sufficient permissions.",
        }, { status: 403 });
      }
      if (url.pathname === "/v2/users/1/inventory/8") {
        return jsonResponse({ data: [{ userAssetId: "copy-1", assetId: 5, assetName: "Public Hat" }] });
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
      if (url.pathname === "/v1/assets") return jsonResponse({ data: [] });
      throw new Error(`Unexpected request ${url}`);
    });

    const result = await scanInventory({
      input: "1",
      categoryIds: ["accessories.head"],
      fetch,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: "5", name: "Public Hat" });
    expect(result.coverage.scannedCategoryIds).toEqual(["accessories.head"]);
    expect(visited).toContain("inventory.roblox.com/v2/users/1/inventory/8");
  });

  it("isolates one generic asset-type 403 and continues later asset types", async () => {
    const visitedTypes: string[] = [];
    const warnings: string[] = [];
    const fetch = fetchMock((url) => {
      const assetType = url.pathname.split("/").at(-1)!;
      visitedTypes.push(assetType);
      if (assetType === "41") {
        return jsonResponse({
          code: "PERMISSION_DENIED",
          message: "The request does not have sufficient permissions.",
        }, { status: 403 });
      }
      return jsonResponse({ data: [{
        userAssetId: `copy-${assetType}`,
        assetId: Number(assetType) + 100,
        assetName: `Type ${assetType}`,
      }] });
    });

    const result = await listPublicAssets([8, 41, 42], {
      userId: "1",
      client: new RobloxHttpClient({ fetch, maxRateLimitRetries: 0 }),
      onWarning: (warning) => warnings.push(warning),
    });

    expect(visitedTypes).toEqual(["8", "41", "42"]);
    expect(result.items.map(({ assetTypeId }) => assetTypeId)).toEqual([8, 42]);
    expect(result.completedAssetTypeIds).toEqual([8, 42]);
    expect(result.failedAssetTypeIds).toEqual([41]);
    expect(result.unscannedAssetTypeIds).toEqual([]);
    expect(warnings.join(" ")).toMatch(/asset type 41/i);
  });

  it("still stops before inventory pages when Roblox explicitly confirms privacy", async () => {
    const visited: string[] = [];
    const fetch = fetchMock((url) => {
      visited.push(`${url.hostname}${url.pathname}`);
      if (url.hostname === "users.roblox.com") {
        return jsonResponse({ id: 1, name: "PrivatePlayer", displayName: "Private Player" });
      }
      if (url.pathname === "/v1/users/avatar-headshot") return jsonResponse({ data: [] });
      if (url.pathname === "/v1/users/1/can-view-inventory") {
        return jsonResponse({ message: "Inventory is private" }, { status: 403 });
      }
      throw new Error(`Inventory page must not be requested: ${url}`);
    });

    await expect(scanInventory({
      input: "1",
      categoryIds: ["accessories.head"],
      fetch,
    })).rejects.toMatchObject({ code: "privateInventory" });
    expect(visited.some((entry) => entry.includes("/v2/users/1/inventory/"))).toBe(false);
  });
});
