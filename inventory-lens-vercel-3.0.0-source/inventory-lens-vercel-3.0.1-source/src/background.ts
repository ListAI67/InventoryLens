import { endpointPathSegment, endpointUrl } from "./lib/endpoints";
import {
  clearDashboardTabId,
  migrateExtensionStorage,
  readDashboardTabId,
  writeDashboardTabId,
} from "./lib/storage";

const OPEN_DASHBOARD = "OPEN_DASHBOARD" as const;

void migrateExtensionStorage().catch(() => undefined);

interface ProfilePrefill {
  userId: string;
  profileUrl: string;
}

interface OpenDashboardMessage extends ProfilePrefill {
  type: typeof OPEN_DASHBOARD;
  source: "profile-button";
}

interface ToolbarDashboardMessage {
  type: typeof OPEN_DASHBOARD;
  source: "toolbar-popup";
}

interface OpenDashboardResponse {
  ok: boolean;
  error?: "invalid-message" | "open-failed";
}

function parseProfileUrl(input: unknown): ProfilePrefill | null {
  if (typeof input !== "string") return null;

  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      (url.hostname !== "www.roblox.com" && url.hostname !== "roblox.com")
    ) {
      return null;
    }

    const match = /^\/users\/([1-9]\d*)\/profile\/?$/.exec(url.pathname);
    if (!match) return null;

    return {
      userId: match[1],
      profileUrl: endpointUrl("robloxWeb", `/users/${endpointPathSegment(match[1]!)}/profile`).toString(),
    };
  } catch {
    return null;
  }
}

function validateOpenDashboardMessage(
  value: unknown,
): OpenDashboardMessage | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<OpenDashboardMessage>;
  if (
    candidate.type !== OPEN_DASHBOARD ||
    candidate.source !== "profile-button" ||
    typeof candidate.userId !== "string" ||
    !/^[1-9]\d*$/.test(candidate.userId)
  ) {
    return null;
  }

  const profile = parseProfileUrl(candidate.profileUrl);
  if (!profile || profile.userId !== candidate.userId) return null;

  return {
    type: OPEN_DASHBOARD,
    source: "profile-button",
    userId: profile.userId,
    profileUrl: profile.profileUrl,
  };
}

function validateToolbarDashboardMessage(value: unknown): value is ToolbarDashboardMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ToolbarDashboardMessage>;
  return candidate.type === OPEN_DASHBOARD && candidate.source === "toolbar-popup";
}

function dashboardUrl(prefill?: ProfilePrefill): string {
  const url = new URL(chrome.runtime.getURL("index.html"));
  if (prefill) {
    url.searchParams.set("userId", prefill.userId);
    url.searchParams.set("profileUrl", prefill.profileUrl);
  }
  return url.toString();
}

function isDashboardTab(tab: chrome.tabs.Tab | undefined): tab is chrome.tabs.Tab {
  return Boolean(
    tab?.id && tab.url?.startsWith(chrome.runtime.getURL("index.html")),
  );
}

async function findDashboardTab(): Promise<chrome.tabs.Tab | undefined> {
  const storedId = await readDashboardTabId();

  if (typeof storedId === "number") {
    try {
      const tab = await chrome.tabs.get(storedId);
      if (isDashboardTab(tab)) return tab;
    } catch {
      // The tab was closed while the service worker was asleep.
    }
    await clearDashboardTabId();
  }

  try {
    const matches = await chrome.tabs.query({
      url: `${chrome.runtime.getURL("index.html")}*`,
    });
    return matches.find(isDashboardTab);
  } catch {
    return undefined;
  }
}

async function rememberDashboardTab(tabId: number): Promise<void> {
  await writeDashboardTabId(tabId);
}

async function openOrFocusDashboard(prefill?: ProfilePrefill): Promise<void> {
  const url = dashboardUrl(prefill);
  const existing = await findDashboardTab();

  if (existing?.id) {
    const updated = await chrome.tabs.update(
      existing.id,
      prefill ? { active: true, url } : { active: true },
    );
    await rememberDashboardTab(existing.id);
    if (updated?.windowId !== undefined) {
      await chrome.windows.update(updated.windowId, { focused: true });
    }
    return;
  }

  const created = await chrome.tabs.create({ active: true, url });
  if (created.id !== undefined) await rememberDashboardTab(created.id);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  const request = validateOpenDashboardMessage(message);
  const toolbarRequest = validateToolbarDashboardMessage(message);
  if (!request && !toolbarRequest) {
    if (
      message &&
      typeof message === "object" &&
      (message as { type?: unknown }).type === OPEN_DASHBOARD
    ) {
      sendResponse({ ok: false, error: "invalid-message" } satisfies OpenDashboardResponse);
    }
    return false;
  }

  void openOrFocusDashboard(request ? {
    userId: request.userId,
    profileUrl: request.profileUrl,
  } : undefined)
    .then(() => sendResponse({ ok: true } satisfies OpenDashboardResponse))
    .catch(() =>
      sendResponse({
        ok: false,
        error: "open-failed",
      } satisfies OpenDashboardResponse),
    );

  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void readDashboardTabId().then((storedId) => (
    storedId === tabId ? clearDashboardTabId() : undefined
  ));
});
