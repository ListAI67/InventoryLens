// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanError, type ResolvedUser } from "../src/lib/types";
import type { ScanOptions, ScanResult } from "../src/lib/scanner";

const scannerMocks = vi.hoisted(() => ({
  scanInventory: vi.fn<(options: ScanOptions) => Promise<ScanResult>>(),
}));

vi.mock("../src/lib/scanner", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/lib/scanner")>();
  return { ...original, scanInventory: scannerMocks.scanInventory };
});

import App from "../src/App";

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;
});

const USER: ResolvedUser = {
  id: "1",
  name: "Player",
  displayName: "Player",
  hasVerifiedBadge: false,
};

function successfulResult(categoryIds: readonly string[]): ScanResult {
  return {
    user: USER,
    items: [],
    records: [],
    warnings: [],
    coverage: {
      scannedCategoryIds: [...categoryIds],
      partialCategoryIds: [],
      deniedCategoryIds: [],
      unsupportedCategoryIds: [],
    },
  };
}

function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")]
    .find((candidate) => candidate.textContent?.trim() === text);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button: ${text}`);
  return button;
}

function selectCategory(container: HTMLElement, label: string): void {
  const category = [...container.querySelectorAll("label.category-option")]
    .find((candidate) => candidate.textContent?.trim() === label);
  const checkbox = category?.querySelector("input[type=checkbox]");
  if (!(checkbox instanceof HTMLInputElement)) throw new Error(`Missing category: ${label}`);
  checkbox.click();
}

async function startSelectedScan(container: HTMLElement): Promise<void> {
  const input = container.querySelector("#player-input");
  const form = container.querySelector("form.player-search");
  if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) {
    throw new Error("Scanner controls were not rendered.");
  }
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    valueSetter?.call(input, "Player");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(scannerMocks.scanInventory).not.toHaveBeenCalled();
  const dialog = container.querySelector('[role="dialog"]');
  if (!(dialog instanceof HTMLElement)) throw new Error("Category dialog did not open.");
  await act(async () => {
    buttonWithText(dialog, "Scan selected").click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function editSelectedCategories(container: HTMLElement, labels: readonly string[]): void {
  act(() => buttonWithText(container, "Edit scope").click());
  const dialog = container.querySelector('[role="dialog"]');
  if (!(dialog instanceof HTMLElement)) throw new Error("Category dialog did not open.");
  act(() => buttonWithText(dialog, "Clear").click());
  act(() => {
    for (const label of labels) selectCategory(dialog, label);
  });
  act(() => buttonWithText(dialog, "Save categories").click());
}

describe("dashboard optional-stage permission handling", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    scannerMocks.scanInventory.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<App />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("continues when the first selected optional stage is denied", async () => {
    scannerMocks.scanInventory.mockImplementation(async ({ categoryIds }) => {
      if (categoryIds.includes("bundles")) {
        throw new ScanError("permissionDenied", "Roblox denied bundles.", 403);
      }
      return successfulResult(categoryIds);
    });

    editSelectedCategories(container, ["Bundles", "Face makeup"]);
    await startSelectedScan(container);

    expect(scannerMocks.scanInventory).toHaveBeenCalledTimes(2);
    expect(scannerMocks.scanInventory.mock.calls.map(([options]) => options.categoryIds)).toEqual([
      ["bundles"],
      ["makeup.face"],
    ]);
    expect(container.textContent).toContain("Bundles was not loaded because Roblox denied access");
    expect(container.textContent).toContain("Scan completed with 1 note");
    expect(container.textContent).toContain("@Player");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("surfaces a denial instead of reporting a successful empty scan when every selected stage is denied", async () => {
    scannerMocks.scanInventory.mockRejectedValue(
      new ScanError("permissionDenied", "Roblox denied this category.", 403),
    );

    editSelectedCategories(container, ["Bundles", "Face makeup"]);
    await startSelectedScan(container);

    expect(scannerMocks.scanInventory).toHaveBeenCalledTimes(2);
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Couldn");
    expect(alert?.textContent).toContain("denied anonymous access to every selected public category");
    expect(alert?.textContent).not.toContain("inventory is viewable");
    expect(container.textContent).not.toContain("Inventory owner");
  });

  it("keeps category edits transactional and never scans from the edit dialog", () => {
    act(() => buttonWithText(container, "Edit scope").click());
    const dialog = container.querySelector('[role="dialog"]');
    if (!(dialog instanceof HTMLElement)) throw new Error("Category dialog did not open.");

    act(() => buttonWithText(dialog, "Clear").click());
    expect(buttonWithText(dialog, "Save categories").disabled).toBe(true);
    expect(dialog.textContent).toContain("Select at least one category to continue.");

    const close = dialog.querySelector('[aria-label="Close category selection"]');
    if (!(close instanceof HTMLButtonElement)) throw new Error("Close category selection was not rendered.");
    act(() => close.click());
    expect(container.textContent).toContain("54 selected");

    act(() => buttonWithText(container, "Edit scope").click());
    const reopenedDialog = container.querySelector('[role="dialog"]');
    if (!(reopenedDialog instanceof HTMLElement)) throw new Error("Category dialog did not reopen.");
    act(() => buttonWithText(reopenedDialog, "Clear").click());
    act(() => selectCategory(reopenedDialog, "Bundles"));
    act(() => buttonWithText(reopenedDialog, "Save categories").click());

    expect(container.textContent).toContain("1 selected");
    expect(scannerMocks.scanInventory).not.toHaveBeenCalled();
  });
});
