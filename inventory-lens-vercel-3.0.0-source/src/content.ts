const BUTTON_ID = "inventory-lens-scan-button";
const OPEN_DASHBOARD = "OPEN_DASHBOARD" as const;

interface ProfileTarget {
  userId: string;
  profileUrl: string;
}

interface OpenDashboardMessage extends ProfileTarget {
  type: typeof OPEN_DASHBOARD;
  source: "profile-button";
}

type MessageSender = (message: OpenDashboardMessage) => void;

function parseRobloxProfileUrl(input: string): ProfileTarget | null {
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
      profileUrl: `https://www.roblox.com/users/${match[1]}/profile`,
    };
  } catch {
    return null;
  }
}

function sendToBackground(message: OpenDashboardMessage): void {
  try {
    const response = chrome.runtime.sendMessage(message);
    if (response && typeof response.catch === "function") {
      void response.catch(() => undefined);
    }
  } catch {
    // The extension may have been reloaded while an older profile tab remained open.
  }
}

function findProfileButtonContainer(doc: Document): HTMLElement | null {
  const selectors = [
    "#profile-header-container .profile-header-buttons",
    "#profile-header-container .profile-actions",
    ".profile-header .profile-header-buttons",
    ".profile-header .profile-actions",
    "#profile-header-container",
    ".profile-header",
  ];

  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    if (element instanceof HTMLElement) return element;
  }
  return doc.body;
}

function styleButton(button: HTMLButtonElement, fixed: boolean): void {
  button.style.cssText = [
    "align-items:center",
    "background:#335fff",
    "border:1px solid rgba(255,255,255,.16)",
    "border-radius:8px",
    "box-shadow:0 4px 14px rgba(0,0,0,.24)",
    "color:#fff",
    "cursor:pointer",
    "display:inline-flex",
    "font:600 14px/1.2 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    "justify-content:center",
    "min-height:36px",
    "padding:8px 14px",
    "z-index:2147483646",
    ...(fixed ? ["position:fixed", "right:20px", "top:76px"] : ["margin-left:8px"]),
  ].join(";");
}

function ensureProfileButton(
  doc: Document,
  currentUrl: () => string,
  send: MessageSender,
): HTMLButtonElement | null {
  const profile = parseRobloxProfileUrl(currentUrl());
  const prior = doc.getElementById(BUTTON_ID);

  if (!profile) {
    prior?.remove();
    return null;
  }

  let button: HTMLButtonElement;
  if (prior instanceof HTMLButtonElement) {
    button = prior;
  } else {
    prior?.remove();
    button = doc.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Scan Inventory";
    button.setAttribute("aria-label", "Open this player's inventory in Inventory Lens");
    button.title = "Open this player in Inventory Lens";

    button.addEventListener("click", () => {
      const latest = parseRobloxProfileUrl(currentUrl());
      if (!latest) return;

      send({
        type: OPEN_DASHBOARD,
        source: "profile-button",
        userId: latest.userId,
        profileUrl: latest.profileUrl,
      });

      button.disabled = true;
      button.textContent = "Opening...";
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = "Scan Inventory";
      }, 900);
    });
  }

  button.dataset.userId = profile.userId;
  const container = findProfileButtonContainer(doc);
  if (!container) return null;

  const fixed = container === doc.body;
  styleButton(button, fixed);
  if (button.parentElement !== container) container.append(button);
  return button;
}

function startContentScript(): void {
  let syncQueued = false;
  const sync = () => {
    syncQueued = false;
    ensureProfileButton(document, () => window.location.href, sendToBackground);
  };
  const scheduleSync = () => {
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(sync);
  };

  const originalPushState = history.pushState.bind(history);
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    originalPushState(data, unused, url);
    scheduleSync();
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) => {
    originalReplaceState(data, unused, url);
    scheduleSync();
  };

  window.addEventListener("popstate", scheduleSync);
  window.addEventListener("hashchange", scheduleSync);
  window.addEventListener("pageshow", scheduleSync);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  sync();
}

if (import.meta.env.MODE === "test") {
  (
    globalThis as typeof globalThis & {
      __RIC_CONTENT_TEST_API__?: {
        buttonId: string;
        parseRobloxProfileUrl: typeof parseRobloxProfileUrl;
        ensureProfileButton: typeof ensureProfileButton;
      };
    }
  ).__RIC_CONTENT_TEST_API__ = {
    buttonId: BUTTON_ID,
    parseRobloxProfileUrl,
    ensureProfileButton,
  };
} else {
  startContentScript();
}
