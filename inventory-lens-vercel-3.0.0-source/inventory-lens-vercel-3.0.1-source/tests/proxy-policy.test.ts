import { describe, expect, it } from "vitest";
import {
  validateProxyJsonBody,
  validateProxyTarget,
} from "../server/proxy-policy";

function target(value: string): URL {
  return new URL(value);
}

describe("Vercel proxy target policy", () => {
  it.each([
    ["GET", "https://users.roblox.com/v1/users/123"],
    ["POST", "https://users.roblox.com/v1/usernames/users"],
    ["GET", "https://inventory.roblox.com/v1/users/123/can-view-inventory"],
    ["GET", "https://inventory.roblox.com/v2/users/123/inventory/8?limit=100&sortOrder=Asc&cursor=next"],
    ["GET", "https://inventory.roblox.com/v1/users/123/places/inventory?itemsPerPage=100&placesTab=Created&cursor=next"],
    ["GET", "https://catalog.roblox.com/v1/users/123/bundles?limit=100&sortOrder=1&cursor=next"],
    ["POST", "https://catalog.roblox.com/v1/catalog/items/details"],
    ["GET", "https://thumbnails.roblox.com/v1/assets?assetIds=1,2&returnPolicy=PlaceHolder&size=420x420&format=Png&isCircular=false"],
    ["GET", "https://thumbnails.roblox.com/v1/bundles/thumbnails?bundleIds=1,2&size=420x420&format=Png&isCircular=false"],
    ["GET", "https://thumbnails.roblox.com/v1/badges/icons?badgeIds=1,2&size=150x150&format=Png&isCircular=false"],
    ["GET", "https://thumbnails.roblox.com/v1/game-passes?gamePassIds=1,2&size=150x150&format=Png&isCircular=false"],
    ["GET", "https://thumbnails.roblox.com/v1/users/avatar?userIds=123&size=720x720&format=Png&isCircular=false"],
    ["GET", "https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=123&size=150x150&format=Png&isCircular=false"],
    ["GET", "https://roblox.fandom.com/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=Catalog%3ASinister%5E2&format=json&formatversion=2&origin=*&maxlag=5"],
  ] as const)("allows %s %s", (method, value) => {
    expect(() => validateProxyTarget(target(value), method)).not.toThrow();
  });

  it.each([
    "http://inventory.roblox.com/v1/users/1/can-view-inventory",
    "https://user:password@inventory.roblox.com/v1/users/1/can-view-inventory",
    "https://inventory.roblox.com:444/v1/users/1/can-view-inventory",
    "https://inventory.roblox.com.evil.example/v1/users/1/can-view-inventory",
    "https://evil.inventory.roblox.com/v1/users/1/can-view-inventory",
    "https://www.roblox.com/v1/users/1/can-view-inventory",
    "https://rbxcdn.com/image.png",
    "https://127.0.0.1/api.php",
  ])("rejects an unsafe destination: %s", (value) => {
    expect(() => validateProxyTarget(target(value), "GET")).toThrow();
  });

  it.each([
    ["POST", "https://inventory.roblox.com/v1/users/1/can-view-inventory"],
    ["GET", "https://users.roblox.com/v1/usernames/users"],
    ["GET", "https://catalog.roblox.com/v1/catalog/items/details"],
    ["POST", "https://thumbnails.roblox.com/v1/assets?assetIds=1&size=420x420&format=Png&isCircular=false&returnPolicy=PlaceHolder"],
    ["POST", "https://roblox.fandom.com/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=Catalog%3AHat&format=json&formatversion=2&origin=*&maxlag=5"],
    ["DELETE", "https://users.roblox.com/v1/users/1"],
  ] as const)("rejects method %s for %s", (method, value) => {
    expect(() => validateProxyTarget(target(value), method)).toThrow();
  });

  it.each([
    "https://users.roblox.com/v1/users/1/friends",
    "https://inventory.roblox.com/v1/users/1/items/Asset/1",
    "https://catalog.roblox.com/v1/search/items/details",
    "https://thumbnails.roblox.com/v1/users/outfit-3d?userId=1",
    "https://roblox.fandom.com/wiki/Catalog:Hat",
  ])("rejects an unneeded upstream path: %s", (value) => {
    expect(() => validateProxyTarget(target(value), "GET")).toThrow();
  });

  it.each([
    "https://users.roblox.com/v1/users/1?extra=true",
    "https://inventory.roblox.com/v2/users/1/inventory/8?limit=100&sortOrder=Asc&unknown=1",
    "https://inventory.roblox.com/v2/users/1/inventory/8?limit=100&limit=10&sortOrder=Asc",
    "https://catalog.roblox.com/v1/users/1/bundles?limit=100&sortOrder=1&cursor=a&cursor=b",
    "https://thumbnails.roblox.com/v1/assets?assetIds=1&assetIds=2&returnPolicy=PlaceHolder&size=420x420&format=Png&isCircular=false",
    "https://roblox.fandom.com/api.php?action=query&action=parse&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=Catalog%3AHat&format=json&formatversion=2&origin=*&maxlag=5",
  ])("rejects unknown or duplicated query parameters: %s", (value) => {
    expect(() => validateProxyTarget(target(value), "GET")).toThrow();
  });

  it("rejects URL fragments instead of silently sending a different request", () => {
    expect(() => validateProxyTarget(
      target("https://users.roblox.com/v1/users/1#ignored"),
      "GET",
    )).toThrow();
  });

  it("caps target URL length", () => {
    expect(() => validateProxyTarget(
      `https://users.roblox.com/v1/users/1?padding=${"x".repeat(9_000)}`,
      "GET",
    )).toThrow();
  });
});

describe("Vercel proxy JSON policy", () => {
  it("canonicalizes the supported username lookup body", () => {
    const target = validateProxyTarget(
      "https://users.roblox.com/v1/usernames/users",
      "POST",
    );
    expect(validateProxyJsonBody(target, JSON.stringify({
      excludeBannedUsers: false,
      usernames: ["Builderman"],
    }))).toBe('{"usernames":["Builderman"],"excludeBannedUsers":false}');
  });

  it.each([
    "not-json",
    "[]",
    JSON.stringify({ usernames: ["Builderman"] }),
    JSON.stringify({ usernames: ["one", "two"], excludeBannedUsers: false }),
    JSON.stringify({ usernames: ["bad name"], excludeBannedUsers: false }),
    JSON.stringify({ usernames: ["Builderman"], excludeBannedUsers: false, admin: true }),
  ])("rejects a malformed username POST body", (body) => {
    const target = validateProxyTarget(
      "https://users.roblox.com/v1/usernames/users",
      "POST",
    );
    expect(() => validateProxyJsonBody(target, body)).toThrow();
  });

  it("accepts only bounded Asset or Bundle catalog entries", () => {
    const target = validateProxyTarget(
      "https://catalog.roblox.com/v1/catalog/items/details",
      "POST",
    );
    expect(validateProxyJsonBody(target, JSON.stringify({
      items: [{ id: 1, itemType: "Asset" }, { id: 2, itemType: "Bundle" }],
    }))).toBe('{"items":[{"id":1,"itemType":"Asset"},{"id":2,"itemType":"Bundle"}]}');

    for (const body of [
      { items: [] },
      { items: [{ id: 0, itemType: "Asset" }] },
      { items: [{ id: 1, itemType: "Badge" }] },
      { items: [{ id: 1, itemType: "Asset", extra: true }] },
      { items: Array.from({ length: 121 }, (_, index) => ({ id: index + 1, itemType: "Asset" })) },
    ]) {
      expect(() => validateProxyJsonBody(target, JSON.stringify(body))).toThrow();
    }
  });

  it("does not permit request bodies on GET targets", () => {
    const target = validateProxyTarget("https://users.roblox.com/v1/users/1", "GET");
    expect(validateProxyJsonBody(target, "")).toBeUndefined();
    expect(() => validateProxyJsonBody(target, "{}")).toThrow();
  });
});
