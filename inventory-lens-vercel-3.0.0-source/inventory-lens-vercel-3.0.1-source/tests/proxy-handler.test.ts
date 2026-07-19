import { describe, expect, it, vi } from "vitest";
import proxyFunction, { handleProxyRequest } from "../api/proxy";

const APP_ORIGIN = "https://inventory-lens.example";

function proxyRequest(target: string, init: RequestInit = {}): Request {
  const url = new URL("/api/proxy", APP_ORIGIN);
  url.searchParams.set("url", target);
  return new Request(url, init);
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...Object.fromEntries(new Headers(init.headers)),
    },
  });
}

describe("Vercel proxy handler", () => {
  it("exports Vercel's Web-standard default fetch entry point", async () => {
    const response = await proxyFunction.fetch(new Request(`${APP_ORIGIN}/api/proxy`));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_parameter" } });
  });

  it("forwards only the anonymous request header allowlist", async () => {
    const upstream = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect([...headers.keys()].sort()).toEqual(["accept", "content-type", "x-csrf-token"]);
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.get("x-csrf-token")).toBe("anonymous-challenge");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe('{"usernames":["Builderman"],"excludeBannedUsers":false}');
      expect(init?.redirect).toBe("manual");
      return jsonResponse({ data: [] });
    });

    const response = await handleProxyRequest(proxyRequest(
      "https://users.roblox.com/v1/usernames/users",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Csrf-Token": "anonymous-challenge",
          Authorization: "Bearer secret",
          Cookie: ".ROBLOSECURITY=secret",
          "X-Api-Key": "secret",
          "X-Forwarded-For": "127.0.0.1",
          Origin: APP_ORIGIN,
          Referer: `${APP_ORIGIN}/dashboard`,
        },
        body: '{"usernames":["Builderman"],"excludeBannedUsers":false}',
      },
    ), upstream);

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("returns only response headers needed by the browser adapters", async () => {
    const upstream = vi.fn(async () => new Response("{}", {
      status: 429,
      headers: {
        "content-type": "application/json",
        "x-csrf-token": "challenge",
        "retry-after": "2",
        "x-ratelimit-reset": "5",
        "x-ratelimit-reset-after": "4",
        "x-ratelimit-remaining": "0",
        "set-cookie": ".ROBLOSECURITY=secret",
        location: "https://evil.example/",
        server: "upstream",
        "www-authenticate": "Basic realm=secret",
        "content-security-policy": "default-src *",
        "access-control-allow-origin": "*",
        "x-upstream-debug": "internal details",
      },
    }));

    const response = await handleProxyRequest(proxyRequest(
      "https://inventory.roblox.com/v1/users/1/can-view-inventory",
    ), upstream);

    expect(response.status).toBe(429);
    expect(await response.text()).toBe("{}");
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "application/json",
      "x-csrf-token": "challenge",
      "retry-after": "2",
      "x-ratelimit-reset": "5",
      "x-ratelimit-reset-after": "4",
      "x-ratelimit-remaining": "0",
    });
    for (const forbidden of [
      "set-cookie",
      "location",
      "server",
      "www-authenticate",
      "content-security-policy",
      "access-control-allow-origin",
      "x-upstream-debug",
    ]) {
      expect(response.headers.has(forbidden)).toBe(false);
    }
  });

  it("does not follow or expose upstream redirects", async () => {
    const upstream = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return new Response(null, {
        status: 302,
        headers: { location: "https://169.254.169.254/latest/meta-data" },
      });
    });
    const response = await handleProxyRequest(proxyRequest(
      "https://users.roblox.com/v1/users/1",
    ), upstream);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.has("location")).toBe(false);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("rejects cross-origin browser callers", async () => {
    const upstream = vi.fn(async () => jsonResponse({ ok: true }));
    const response = await handleProxyRequest(proxyRequest(
      "https://users.roblox.com/v1/users/1",
      { headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" } },
    ), upstream);

    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(["PUT", "PATCH", "DELETE"])("rejects the %s method", async (method) => {
    const upstream = vi.fn(async () => jsonResponse({ ok: true }));
    const response = await handleProxyRequest(proxyRequest(
      "https://users.roblox.com/v1/users/1",
      { method },
    ), upstream);
    expect(response.status).toBe(405);
    expect(await response.json()).toMatchObject({
      error: { code: "method_not_allowed" },
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("requires JSON for POST requests", async () => {
    const upstream = vi.fn(async () => jsonResponse({ ok: true }));
    const response = await handleProxyRequest(proxyRequest(
      "https://users.roblox.com/v1/usernames/users",
      { method: "POST", headers: { "content-type": "text/plain" }, body: "hello" },
    ), upstream);
    expect(response.status).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects a declared oversized body before contacting Roblox", async () => {
    const upstream = vi.fn(async () => jsonResponse({ ok: true }));
    const response = await handleProxyRequest(proxyRequest(
      "https://users.roblox.com/v1/usernames/users",
      {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "10000000" },
        body: "{}",
      },
    ), upstream);
    expect(response.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("measures the actual body when Content-Length is absent", async () => {
    const upstream = vi.fn(async () => jsonResponse({ ok: true }));
    const response = await handleProxyRequest(proxyRequest(
      "https://users.roblox.com/v1/usernames/users",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(300_000) }),
      },
    ), upstream);
    expect(response.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("reports malformed or missing target URLs without fetching", async () => {
    const upstream = vi.fn(async () => jsonResponse({ ok: true }));
    const missing = await handleProxyRequest(new Request(`${APP_ORIGIN}/api/proxy`), upstream);
    const malformed = await handleProxyRequest(new Request(
      `${APP_ORIGIN}/api/proxy?url=${encodeURIComponent("not a URL")}`,
    ), upstream);
    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("requires exactly one proxy target and no extra route parameters", async () => {
    const upstream = vi.fn(async () => jsonResponse({ ok: true }));
    const duplicate = new URL("/api/proxy", APP_ORIGIN);
    duplicate.searchParams.append("url", "https://users.roblox.com/v1/users/1");
    duplicate.searchParams.append("url", "https://users.roblox.com/v1/users/2");
    const extra = new URL("/api/proxy", APP_ORIGIN);
    extra.searchParams.set("url", "https://users.roblox.com/v1/users/1");
    extra.searchParams.set("redirect", "https://evil.example");

    expect((await handleProxyRequest(new Request(duplicate), upstream)).status).toBe(400);
    expect((await handleProxyRequest(new Request(extra), upstream)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("maps upstream transport failures to a stable gateway error", async () => {
    const response = await handleProxyRequest(proxyRequest(
      "https://users.roblox.com/v1/users/1",
    ), vi.fn(async () => { throw new TypeError("socket details"); }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("socket details");
  });

  it("rejects unexpected upstream content instead of relaying executable or HTML data", async () => {
    const response = await handleProxyRequest(proxyRequest(
      "https://users.roblox.com/v1/users/1",
    ), vi.fn(async () => new Response("<html>upstream error</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    })));

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("upstream error");
    expect(JSON.parse(text)).toBeDefined();
  });

  it("rejects a declared oversized upstream response", async () => {
    const response = await handleProxyRequest(proxyRequest(
      "https://users.roblox.com/v1/users/1",
    ), vi.fn(async () => new Response("{}", {
      headers: { "content-type": "application/json", "content-length": "5000000" },
    })));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "upstream_too_large" } });
  });

  it("relays only the token for an anonymous catalog CSRF challenge", async () => {
    const response = await handleProxyRequest(proxyRequest(
      "https://catalog.roblox.com/v1/catalog/items/details",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"items":[{"id":1,"itemType":"Asset"}]}',
      },
    ), vi.fn(async () => new Response("<html>not relayed</html>", {
      status: 403,
      headers: { "content-type": "text/html", "x-csrf-token": "anonymous-token" },
    })));

    expect(response.status).toBe(403);
    expect(response.headers.get("x-csrf-token")).toBe("anonymous-token");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.text()).toBe("{}");
  });
});
