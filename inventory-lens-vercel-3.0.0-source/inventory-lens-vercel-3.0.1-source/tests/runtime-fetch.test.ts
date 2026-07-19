import { afterEach, describe, expect, it, vi } from "vitest";
import { externalDataFetch, isWebDeployment } from "../src/lib/runtime-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setLocation(value: string): void {
  vi.stubGlobal("location", new URL(value));
}

describe("runtime external-data fetch", () => {
  it("identifies HTTP deployments but not extension pages", () => {
    setLocation("https://inventory-lens.example/");
    expect(isWebDeployment()).toBe(true);
    setLocation("http://localhost:5173/");
    expect(isWebDeployment()).toBe(true);
    setLocation("chrome-extension://abcdefghijklmnop/index.html");
    expect(isWebDeployment()).toBe(false);
  });

  it.each([
    "https://users.roblox.com/v1/users/1",
    "https://catalog.roblox.com/v1/users/1/bundles?limit=100&sortOrder=1",
    "https://inventory.roblox.com/v1/users/1/can-view-inventory",
    "https://thumbnails.roblox.com/v1/users/avatar?userIds=1&size=720x720&format=Png&isCircular=false",
    "https://roblox.fandom.com/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=Catalog%3AHat&format=json&formatversion=2&origin=*&maxlag=5",
  ])("rewrites %s through the same-origin proxy on the web", async (upstreamUrl) => {
    setLocation("https://inventory-lens.example/dashboard");
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await externalDataFetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: "Bearer secret" },
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [input, init] = fetch.mock.calls[0]!;
    const proxied = new URL(input.toString());
    expect(proxied.origin).toBe("https://inventory-lens.example");
    expect(proxied.pathname).toBe("/api/proxy");
    expect(proxied.searchParams.get("url")).toBe(upstreamUrl);
    expect(init?.method).toBe("GET");
    const headers = new Headers(init?.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.has("authorization")).toBe(false);
  });

  it("keeps extension requests direct while applying the anonymous header boundary", async () => {
    setLocation("chrome-extension://abcdefghijklmnop/index.html");
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const url = "https://inventory.roblox.com/v1/users/1/can-view-inventory";

    await externalDataFetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer secret",
        Cookie: ".ROBLOSECURITY=secret",
        "X-Api-Key": "secret",
      },
    });

    const [input, init] = fetch.mock.calls[0]!;
    expect(input.toString()).toBe(url);
    expect(init?.credentials).toBe("omit");
    const headers = new Headers(init?.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("x-api-key")).toBe(false);
  });

  it("does not turn the browser transport into an arbitrary open proxy", async () => {
    setLocation("https://inventory-lens.example/");
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await expect(externalDataFetch("https://evil.example/collect"))
      .rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
