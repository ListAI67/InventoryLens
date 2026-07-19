import "./popup.css";

const OPEN_DASHBOARD = "OPEN_DASHBOARD" as const;

interface ProfileTarget {
  userId: string;
  profileUrl: string;
}

type OpenResponse = {
  ok?: boolean;
  error?: "invalid-message" | "open-failed";
};

function profileFromUrl(input?: string): ProfileTarget | null {
  if (!input) return null;
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

const openButton = document.querySelector<HTMLButtonElement>("#open-dashboard")!;
const profileButton = document.querySelector<HTMLButtonElement>("#scan-profile")!;
const status = document.querySelector<HTMLElement>("#popup-status")!;

let activeProfile: ProfileTarget | null = null;

async function detectActiveProfile(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeProfile = profileFromUrl(tab?.url);
  } catch {
    activeProfile = null;
  }

  if (!activeProfile) return;
  profileButton.hidden = false;
}

async function openDashboard(profile: ProfileTarget | null): Promise<void> {
  openButton.disabled = true;
  profileButton.disabled = true;
  status.textContent = "Opening dashboard…";
  try {
    const message = profile
      ? {
          type: OPEN_DASHBOARD,
          source: "profile-button" as const,
          userId: profile.userId,
          profileUrl: profile.profileUrl,
        }
      : {
          type: OPEN_DASHBOARD,
          source: "toolbar-popup" as const,
        };
    const response = await chrome.runtime.sendMessage(message) as OpenResponse | undefined;
    if (!response?.ok) throw new Error(response?.error ?? "open-failed");
    window.close();
  } catch {
    status.textContent = "Could not open Inventory Lens. Reload the extension and try again.";
    openButton.disabled = false;
    profileButton.disabled = false;
  }
}

openButton.addEventListener("click", () => void openDashboard(null));
profileButton.addEventListener("click", () => void openDashboard(activeProfile));

void detectActiveProfile();
