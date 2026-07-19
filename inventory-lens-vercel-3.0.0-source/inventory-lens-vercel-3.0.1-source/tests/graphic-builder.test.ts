import { describe, expect, it } from "vitest";
import {
  createGraphicDraft,
  deselectGraphicItem,
  deserializeGraphicDraft,
  graphicExportDimensions,
  graphicFooterCells,
  graphicItemGrid,
  GRAPHIC_BACKGROUND_OPTIONS,
  MAX_GRAPHIC_ITEMS,
  moveGraphicItem,
  reconcileGraphicItems,
  selectGraphicItem,
  serializeGraphicDraft,
  setGraphicItemLabel,
  setGraphicText,
  toggleGraphicItem,
} from "../src/lib/graphic-builder";

function selectedKeys(draft: ReturnType<typeof createGraphicDraft>): string[] {
  return draft.selectedItems.map(({ key }) => key);
}

describe("graphic builder item selection", () => {
  it("selects inventory items once in click order and toggles them off", () => {
    let draft = createGraphicDraft();
    draft = selectGraphicItem(draft, { key: "asset:2", label: "Second hat" });
    draft = selectGraphicItem(draft, { key: "asset:1", label: "First hat" });
    draft = selectGraphicItem(draft, { key: "asset:2", label: "Duplicate click" });

    expect(selectedKeys(draft)).toEqual(["asset:2", "asset:1"]);
    expect(draft.selectedItems[0]?.label).toBe("Second hat");

    draft = toggleGraphicItem(draft, { key: "asset:2", label: "Ignored" });
    expect(selectedKeys(draft)).toEqual(["asset:1"]);
    expect(deselectGraphicItem(draft, "not-selected")).toBe(draft);
  });

  it("enforces a bounded selection without evicting earlier choices", () => {
    let draft = createGraphicDraft();
    for (let index = 0; index < MAX_GRAPHIC_ITEMS + 3; index += 1) {
      draft = selectGraphicItem(draft, { key: `asset:${index}`, label: `Item ${index}` });
    }

    expect(draft.selectedItems).toHaveLength(MAX_GRAPHIC_ITEMS);
    expect(selectedKeys(draft)).toEqual(Array.from({ length: MAX_GRAPHIC_ITEMS }, (_, index) => `asset:${index}`));
  });

  it("reconciles a saved selection with refreshed inventory while retaining labels and order", () => {
    let draft = createGraphicDraft();
    draft = selectGraphicItem(draft, { key: "asset:1", label: "Custom one" });
    draft = selectGraphicItem(draft, { key: "asset:2", label: "Custom two" });
    draft = selectGraphicItem(draft, { key: "asset:3", label: "Custom three" });

    const reconciled = reconcileGraphicItems(draft, ["asset:3", "asset:1"]);
    expect(reconciled.selectedItems).toEqual([
      { key: "asset:1", label: "Custom one" },
      { key: "asset:3", label: "Custom three" },
    ]);
  });
});

describe("graphic builder item order and labels", () => {
  it("moves an item to a clamped destination and preserves all other relative order", () => {
    let draft = createGraphicDraft();
    for (const key of ["asset:a", "asset:b", "asset:c", "asset:d"]) {
      draft = selectGraphicItem(draft, { key, label: key });
    }

    draft = moveGraphicItem(draft, "asset:c", -50);
    expect(selectedKeys(draft)).toEqual(["asset:c", "asset:a", "asset:b", "asset:d"]);

    draft = moveGraphicItem(draft, "asset:a", 100);
    expect(selectedKeys(draft)).toEqual(["asset:c", "asset:b", "asset:d", "asset:a"]);
    expect(moveGraphicItem(draft, "missing", 0)).toBe(draft);
  });

  it("updates only the requested editable item label and free-text field", () => {
    let draft = selectGraphicItem(createGraphicDraft(), { key: "asset:1", label: "Ghost Fedora" });
    draft = selectGraphicItem(draft, { key: "asset:2", label: "Sinister^2" });
    draft = setGraphicItemLabel(draft, "asset:2", "8,857 HISTORICAL PURCHASES");
    draft = setGraphicText(draft, "headline", "MY ROBLOX COLLECTION");

    expect(draft.headline).toBe("MY ROBLOX COLLECTION");
    expect(draft.selectedItems).toEqual([
      { key: "asset:1", label: "Ghost Fedora" },
      { key: "asset:2", label: "8,857 HISTORICAL PURCHASES" },
    ]);
  });
});

describe("graphic builder saved drafts", () => {
  it("round-trips user text, export choice, item order, and custom labels", () => {
    let draft = createGraphicDraft({
      headline: "VERY STACKED",
      subheadline: "BREW EV WC HP",
      footer: "200+ OFFSALE HATS",
      exportPreset: "square",
      backgroundPreset: "sunset",
      showPlayerIdentity: false,
      showItemNames: true,
    });
    draft = selectGraphicItem(draft, { key: "asset:1", label: "61 COPIES" });
    draft = selectGraphicItem(draft, { key: "asset:2", label: "72 COPIES" });
    draft = moveGraphicItem(draft, "asset:2", 0);

    const restored = deserializeGraphicDraft(serializeGraphicDraft(draft));
    expect(restored).toEqual(draft);
  });

  it("rejects malformed or unsupported drafts and sanitizes untrusted fields", () => {
    expect(deserializeGraphicDraft("not json")).toBeUndefined();
    expect(deserializeGraphicDraft('{"version":99}')).toBeUndefined();

    const restored = deserializeGraphicDraft(JSON.stringify({
      version: 1,
      headline: "Title",
      subheadline: 123,
      footer: "Footer",
      exportPreset: "unknown",
      backgroundPreset: "unknown",
      unexpected: "not retained",
      selectedItems: [
        { key: " asset:1 ", label: "First" },
        { key: "asset:1", label: "Duplicate" },
        { key: "", label: "Blank key" },
        { key: "asset:2", label: 7 },
      ],
    }));

    expect(restored).toEqual({
      version: 1,
      headline: "Title",
      subheadline: "",
      footer: "Footer",
      footerLabel: "CUSTOM TEXT",
      showFooterCustom: true,
      showFooterOffSale: true,
      footerOffSaleMetric: "selectedCategoryItems",
      footerManualOffSaleCount: "",
      showFooterCurrency: false,
      footerCurrencyKind: "usd",
      footerCurrencyValue: "BTC",
      showFooterSelectedItems: false,
      showFooterOwnedCopies: false,
      exportPreset: "landscape",
      backgroundPreset: "midnight",
      showPlayerIdentity: true,
      showItemNames: false,
      selectedItems: [{ key: "asset:1", label: "First" }],
    });
  });

  it("round-trips and sanitizes every configurable bottom-bar field", () => {
    const draft = createGraphicDraft({
      footer: "PAYMENT: BTC OR USD",
      footerLabel: "CONTACT FIRST",
      showFooterCustom: true,
      showFooterOffSale: true,
      footerOffSaleMetric: "manual",
      footerManualOffSaleCount: "140",
      showFooterCurrency: true,
      footerCurrencyKind: "crypto",
      footerCurrencyValue: "BTC / ETH / USDC",
      showFooterSelectedItems: true,
      showFooterOwnedCopies: true,
    });

    expect(deserializeGraphicDraft(serializeGraphicDraft(draft))).toEqual(draft);

    const restored = deserializeGraphicDraft(JSON.stringify({
      version: 1,
      footerLabel: "L".repeat(80),
      showFooterCustom: "yes",
      showFooterOffSale: null,
      footerOffSaleMetric: "unknown",
      footerManualOffSaleCount: "140 hats",
      showFooterCurrency: true,
      footerCurrencyKind: "bitcoin",
      footerCurrencyValue: "C".repeat(80),
      showFooterSelectedItems: true,
      showFooterOwnedCopies: "yes",
      selectedItems: [],
    }));

    expect(restored).toMatchObject({
      footerLabel: "L".repeat(60),
      showFooterCustom: true,
      showFooterOffSale: true,
      footerOffSaleMetric: "selectedCategoryItems",
      footerManualOffSaleCount: "",
      showFooterCurrency: true,
      footerCurrencyKind: "usd",
      footerCurrencyValue: "C".repeat(60),
      showFooterSelectedItems: true,
      showFooterOwnedCopies: false,
    });
  });
});

describe("graphic builder background presets", () => {
  it("defaults to Midnight and exposes the complete bounded preset catalog", () => {
    expect(createGraphicDraft().backgroundPreset).toBe("midnight");
    expect(GRAPHIC_BACKGROUND_OPTIONS.map(({ id }) => id)).toEqual([
      "midnight",
      "neonGrid",
      "royalPurple",
      "sunset",
      "arctic",
      "emerald",
      "cleanBlack",
    ]);
    expect(GRAPHIC_BACKGROUND_OPTIONS.map(({ label }) => label)).toEqual([
      "Midnight Texture",
      "Neon Grid",
      "Royal Purple",
      "Sunset Ember",
      "Arctic Blue",
      "Emerald Matrix",
      "Clean Black",
    ]);
  });

  it("round-trips every supported background choice", () => {
    for (const { id } of GRAPHIC_BACKGROUND_OPTIONS) {
      const draft = createGraphicDraft({ backgroundPreset: id });
      expect(deserializeGraphicDraft(serializeGraphicDraft(draft))?.backgroundPreset).toBe(id);
    }
  });

  it("sanitizes an unknown saved background back to Midnight", () => {
    const restored = deserializeGraphicDraft(JSON.stringify({
      version: 1,
      backgroundPreset: "remote-image-url",
      selectedItems: [],
    }));

    expect(restored?.backgroundPreset).toBe("midnight");
  });
});

describe("graphic builder bottom-bar cells", () => {
  const context = {
    selectedCategoryOffSaleItems: 140,
    selectedCategoryOffSaleCopies: 156,
    graphicOffSaleItems: 7,
    selectedGraphicItems: 9,
    ownedGraphicCopies: 12,
  };

  it("defaults to editable custom text and the full selected-category off-sale item total", () => {
    expect(graphicFooterCells(createGraphicDraft(), context)).toEqual([
      { key: "custom", value: "INVENTORY LENS", label: "CUSTOM TEXT" },
      { key: "offSale", value: "140", label: "OFF-SALE ITEMS" },
    ]);
  });

  it("uses the custom value and label instead of a fixed CUSTOM TEXT caption", () => {
    const cells = graphicFooterCells(createGraphicDraft({
      footer: "SERIOUS OFFERS ONLY",
      footerLabel: "TRADE NOTES",
      showFooterOffSale: false,
    }), context);

    expect(cells).toEqual([
      { key: "custom", value: "SERIOUS OFFERS ONLY", label: "TRADE NOTES" },
    ]);
  });

  it("keeps selected-category items, selected-category copies, graphic items, and manual totals distinct", () => {
    const resolveOffSale = (footerOffSaleMetric: "selectedCategoryItems" | "selectedCategoryCopies" | "graphicItems" | "manual") =>
      graphicFooterCells(createGraphicDraft({
        showFooterCustom: false,
        footerOffSaleMetric,
        footerManualOffSaleCount: "222",
      }), context);

    expect(resolveOffSale("selectedCategoryItems")).toEqual([
      { key: "offSale", value: "140", label: "OFF-SALE ITEMS" },
    ]);
    expect(resolveOffSale("selectedCategoryCopies")).toEqual([
      { key: "offSale", value: "156", label: "OFF-SALE COPIES" },
    ]);
    expect(resolveOffSale("graphicItems")).toEqual([
      { key: "offSale", value: "7", label: "OFF-SALE SHOWN" },
    ]);
    expect(resolveOffSale("manual")).toEqual([
      { key: "offSale", value: "222", label: "OFF-SALE" },
    ]);
  });

  it("adds display-only currency and opt-in graphic selection metrics in toggle order", () => {
    expect(graphicFooterCells(createGraphicDraft({
      showFooterCustom: false,
      showFooterOffSale: false,
      showFooterCurrency: true,
      footerCurrencyKind: "crypto",
      footerCurrencyValue: "BTC / ETH",
      showFooterSelectedItems: true,
      showFooterOwnedCopies: true,
    }), context)).toEqual([
      { key: "currency", value: "BTC / ETH", label: "CRYPTO ACCEPTED" },
      { key: "selectedItems", value: "9", label: "SELECTED ITEMS" },
      { key: "ownedCopies", value: "12", label: "OWNED COPIES" },
    ]);
  });

  it("can hide every bottom-bar block and clamps invalid calculated counts", () => {
    expect(graphicFooterCells(createGraphicDraft({
      showFooterCustom: false,
      showFooterOffSale: false,
      showFooterCurrency: false,
      showFooterSelectedItems: false,
      showFooterOwnedCopies: false,
    }), context)).toEqual([]);

    expect(graphicFooterCells(createGraphicDraft({
      showFooterCustom: false,
      showFooterSelectedItems: true,
      showFooterOwnedCopies: true,
    }), {
      ...context,
      selectedCategoryOffSaleItems: Number.NaN,
      selectedGraphicItems: -3,
      ownedGraphicCopies: Number.POSITIVE_INFINITY,
    })).toEqual([
      { key: "offSale", value: "0", label: "OFF-SALE ITEMS" },
      { key: "selectedItems", value: "0", label: "SELECTED ITEMS" },
      { key: "ownedCopies", value: "0", label: "OWNED COPIES" },
    ]);
  });
});

describe("graphic builder export layout", () => {
  it("uses deterministic high-resolution dimensions for every preset", () => {
    expect(graphicExportDimensions("landscape")).toEqual({ width: 1920, height: 1080 });
    expect(graphicExportDimensions("square")).toEqual({ width: 1080, height: 1080 });
    expect(graphicExportDimensions("portrait")).toEqual({ width: 1080, height: 1350 });
  });

  it("computes stable grids up to the item limit", () => {
    expect(graphicItemGrid(0)).toEqual({ columns: 0, rows: 0 });
    expect(graphicItemGrid(4)).toEqual({ columns: 4, rows: 1 });
    expect(graphicItemGrid(10)).toEqual({ columns: 4, rows: 3 });
    expect(graphicItemGrid(18)).toEqual({ columns: 6, rows: 3 });
    expect(graphicItemGrid(4, "portrait")).toEqual({ columns: 2, rows: 2 });
    expect(graphicItemGrid(18, "portrait")).toEqual({ columns: 4, rows: 5 });
    expect(graphicItemGrid(999)).toEqual({ columns: 6, rows: 3 });
    expect(graphicItemGrid(Number.NaN)).toEqual({ columns: 0, rows: 0 });
  });
});
