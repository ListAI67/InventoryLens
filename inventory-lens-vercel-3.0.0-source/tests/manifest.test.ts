import { describe, expect, it } from "vitest";

import packageText from "../package.json?raw";
import manifestText from "../public/manifest.json?raw";
import popupText from "../popup.html?raw";

interface ExtensionManifest {
  manifest_version: number;
  short_name: string;
  version: string;
  permissions: string[];
  host_permissions: string[];
  content_scripts: Array<{
    matches: string[];
    js: string[];
    run_at: "document_idle";
  }>;
  content_security_policy: { extension_pages: string };
  action: { default_title: string; default_popup?: string };
}

const manifest = JSON.parse(manifestText) as ExtensionManifest;
const packageMetadata = JSON.parse(packageText) as { version: string };

describe("MV3 permission boundary", () => {
  it("keeps the 3.2.6 Inventory Lens release version aligned", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe("3.2.6");
    expect(manifest.short_name).toBe("Inventory Lens");
    expect(packageMetadata.version).toBe(manifest.version);
    expect(manifest.action).toMatchObject({
      default_title: "Open Inventory Lens",
      default_popup: "popup.html",
    });
  });

  it("declares only the required capabilities and API origins", () => {
    expect(manifest.permissions).toEqual(["storage", "activeTab"]);
    expect(manifest.host_permissions).toEqual([
      "https://users.roblox.com/*",
      "https://catalog.roblox.com/*",
      "https://inventory.roblox.com/*",
      "https://thumbnails.roblox.com/*",
      "https://roblox.fandom.com/*",
    ]);
    expect(manifest.host_permissions).not.toContain("<all_urls>");
  });

  it("limits page injection and keeps a strict extension-page CSP", () => {
    expect(manifest.content_scripts).toEqual([
      {
        matches: [
          "https://www.roblox.com/users/*/profile*",
          "https://roblox.com/users/*/profile*",
        ],
        js: ["content.js"],
        run_at: "document_idle",
      },
    ]);
    expect(manifest.content_security_policy.extension_pages).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://rbxcdn.com https://*.rbxcdn.com; connect-src https://users.roblox.com https://catalog.roblox.com https://inventory.roblox.com https://thumbnails.roblox.com https://roblox.fandom.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
  });

  it("keeps the toolbar popup factual and valid as HTML", () => {
    expect(popupText).toContain("Analyze a public Roblox inventory.");
    expect(popupText).toContain("Local processing &bull; No account login");
    expect(popupText).toContain("<i></i>");
    expect(popupText).not.toMatch(/<i\s*\/>/);
  });
});
