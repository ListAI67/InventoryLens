import { describe, expect, it } from "vitest";
import packageText from "../package.json?raw";
import {
  validateManifestSecurity,
  validatePackagedText,
} from "../scripts/release-utils.mjs";

function validManifest(): Record<string, unknown> {
  return {
    manifest_version: 3,
    permissions: ["storage", "activeTab"],
    host_permissions: [
      "https://users.roblox.com/*",
      "https://catalog.roblox.com/*",
      "https://inventory.roblox.com/*",
      "https://thumbnails.roblox.com/*",
      "https://roblox.fandom.com/*",
    ],
    content_scripts: [{
      matches: [
        "https://www.roblox.com/users/*/profile*",
        "https://roblox.com/users/*/profile*",
      ],
      js: ["content.js"],
      run_at: "document_idle",
    }],
    content_security_policy: {
      extension_pages: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://rbxcdn.com https://*.rbxcdn.com; connect-src https://users.roblox.com https://catalog.roblox.com https://inventory.roblox.com https://thumbnails.roblox.com https://roblox.fandom.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    },
  };
}

function withChange(change: Record<string, unknown>): Record<string, unknown> {
  return { ...validManifest(), ...change };
}

describe("release manifest security policy", () => {
  it("accepts only the intended MV3 permission and host boundary", () => {
    expect(() => validateManifestSecurity(validManifest())).not.toThrow();

    for (const manifest of [
      withChange({ permissions: ["storage", "activeTab", "cookies"] }),
      withChange({ permissions: ["storage", "activeTab", "webRequest"] }),
      withChange({ host_permissions: [
        "https://users.roblox.com/*",
        "https://catalog.roblox.com/*",
        "https://inventory.roblox.com/*",
        "https://thumbnails.roblox.com/*",
        "https://roblox.fandom.com/*",
        "https://api.inventory-lens.example/*",
      ] }),
      withChange({ host_permissions: ["<all_urls>"] }),
      withChange({ optional_permissions: ["cookies"] }),
      withChange({ optional_host_permissions: ["https://example.com/*"] }),
      withChange({ externally_connectable: { matches: ["<all_urls>"] } }),
    ]) {
      expect(() => validateManifestSecurity(manifest)).toThrow();
    }
  });

  it("rejects broadened content-script matches and executable CSP", () => {
    expect(() => validateManifestSecurity(withChange({
      content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"], run_at: "document_idle" }],
    }))).toThrow(/all_urls|content_scripts/i);

    expect(() => validateManifestSecurity(withChange({
      content_security_policy: {
        extension_pages: "default-src 'self'; script-src 'self' 'unsafe-eval'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      },
    }))).toThrow(/CSP/i);
  });
});

describe("packaged URL and tracker policy", () => {
  it("allows only expected Roblox, Fandom, GitHub-source, CDN, dependency-help, and SVG namespace URLs", () => {
    expect(() => validatePackagedText("bundle.js", [
      "https://inventory.roblox.com/v1/test",
      "https://roblox.fandom.com/api.php",
      "https://www.roblox.com/catalog/1",
      "https://github.com/ListAI67/InventoryLens",
      "https://tr.rbxcdn.com/image.png",
      "https://react.dev/errors/418",
      "http://www.w3.org/2000/svg",
    ].join(" "))).not.toThrow();
  });

  it("rejects analytics, trackers, custom backends, insecure URLs, and remote scripts", () => {
    for (const [text, expected] of [
      ["https://www.google-analytics.com/collect", /analytics|tracker/i],
      ["https://project.ingest.sentry.io/api/1", /analytics|tracker/i],
      ["https://api.inventory-lens.example/collect", /backend URL/i],
      ["http://inventory.roblox.com/v1/test", /insecure/i],
      ['<script src="https://cdn.example.com/app.js"></script>', /remote executable script/i],
    ] as const) {
      expect(() => validatePackagedText("bundle.js", text)).toThrow(expected);
    }
  });

  it("requires the full test suite in the release command", () => {
    const packageJson = JSON.parse(packageText) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["release:package"]).toMatch(/^pnpm run test &&/);
    expect(packageJson.scripts["release:package"]).toContain("pnpm run lint &&");
    expect(packageJson.scripts["release:package"]).toContain("pnpm run build &&");
    expect(packageJson.scripts["release:package"]).toContain("pnpm run security:check &&");
    expect(packageJson.scripts["release:package"]).toContain("pnpm run secrets:check &&");
    expect(packageJson.scripts["release:package"]).toMatch(/node scripts\/package-release\.mjs$/);
  });
});
