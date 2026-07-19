import { describe, expect, it } from "vitest";
import vercelText from "../vercel.json?raw";

interface VercelConfig {
  buildCommand?: string;
  outputDirectory?: string;
  rewrites?: Array<{ source?: string; destination?: string }>;
}

const config = JSON.parse(vercelText) as VercelConfig;

describe("Vercel deployment configuration", () => {
  it("builds and publishes the dedicated web bundle", () => {
    expect(config.buildCommand).toMatch(/build:web/);
    expect(config.outputDirectory).toBe("dist-web");
  });

  it("keeps API functions outside the SPA fallback", () => {
    expect(config.rewrites).toBeDefined();
    const rewrites = config.rewrites ?? [];
    const spa = rewrites.find(({ destination }) => destination === "/index.html");
    expect(spa).toBeDefined();
    expect(spa?.source).toMatch(/api/);
    expect(spa?.source).toMatch(/\(\?!/);
    expect(spa?.source).toMatch(/\.\*/);
  });

  it("does not configure an external rewrite as a backend shortcut", () => {
    for (const rewrite of config.rewrites ?? []) {
      expect(rewrite.destination).not.toMatch(/^https?:\/\//i);
    }
  });
});
