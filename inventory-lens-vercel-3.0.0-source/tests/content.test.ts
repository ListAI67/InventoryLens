// @vitest-environment jsdom

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

type ContentTestApi = {
  buttonId: string;
  parseRobloxProfileUrl: (input: string) => {
    userId: string;
    profileUrl: string;
  } | null;
  ensureProfileButton: (
    doc: Document,
    currentUrl: () => string,
    send: (message: unknown) => void,
  ) => HTMLButtonElement | null;
};

let api: ContentTestApi;

beforeAll(async () => {
  await import("../src/content");
  api = (
    globalThis as typeof globalThis & {
      __RIC_CONTENT_TEST_API__: ContentTestApi;
    }
  ).__RIC_CONTENT_TEST_API__;
});

beforeEach(() => {
  document.body.replaceChildren();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Roblox profile URL parsing", () => {
  it("accepts canonical numeric profile URLs and strips query data", () => {
    expect(
      api.parseRobloxProfileUrl(
        "https://www.roblox.com/users/123456/profile?friendshipSourceType=PlayerSearch",
      ),
    ).toEqual({
      userId: "123456",
      profileUrl: "https://www.roblox.com/users/123456/profile",
    });
  });

  it.each([
    "https://www.roblox.com/users/name/profile",
    "https://www.roblox.com/users/123/inventory",
    "https://evil.example/users/123/profile",
    "http://www.roblox.com/users/123/profile",
  ])("rejects a non-profile or untrusted URL: %s", (url) => {
    expect(api.parseRobloxProfileUrl(url)).toBeNull();
  });
});

describe("profile Scan Inventory button", () => {
  it("is idempotent across repeated SPA syncs", () => {
    const send = vi.fn();
    const href = () => "https://www.roblox.com/users/2468/profile";

    const first = api.ensureProfileButton(document, href, send);
    const second = api.ensureProfileButton(document, href, send);

    expect(first).toBe(second);
    expect(document.querySelectorAll(`#${api.buttonId}`)).toHaveLength(1);
    expect(first?.dataset.userId).toBe("2468");
  });

  it("sends only the validated profile prefill contract", () => {
    const send = vi.fn();
    const button = api.ensureProfileButton(
      document,
      () => "https://www.roblox.com/users/97531/profile?foo=bar",
      send,
    );

    button?.click();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: "OPEN_DASHBOARD",
      source: "profile-button",
      userId: "97531",
      profileUrl: "https://www.roblox.com/users/97531/profile",
    });
    expect(Object.keys(send.mock.calls[0][0])).toEqual([
      "type",
      "source",
      "userId",
      "profileUrl",
    ]);
  });

  it("removes the button after navigating away from a profile", () => {
    const send = vi.fn();
    api.ensureProfileButton(
      document,
      () => "https://www.roblox.com/users/11/profile",
      send,
    );

    expect(document.getElementById(api.buttonId)).not.toBeNull();
    expect(
      api.ensureProfileButton(
        document,
        () => "https://www.roblox.com/catalog",
        send,
      ),
    ).toBeNull();
    expect(document.getElementById(api.buttonId)).toBeNull();
  });
});
