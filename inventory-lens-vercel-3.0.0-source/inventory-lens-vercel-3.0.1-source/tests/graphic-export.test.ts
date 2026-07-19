import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultGraphicItemLabel, suggestedGraphicItems } from "../src/GraphicBuilder";
import { downloadCanvasPng, graphicFilename, loadRobloxGraphicImage, renderInventoryGraphic } from "../src/lib/graphic-export";
import { GRAPHIC_BACKGROUND_OPTIONS } from "../src/lib/graphic-builder";
import type { GroupedInventoryItem } from "../src/lib/types";

function inventoryItem(overrides: Partial<GroupedInventoryItem> = {}): GroupedInventoryItem {
  return {
    key: "asset:1",
    kind: "asset",
    id: "1",
    name: "Example Hat",
    assetType: "HAT",
    categoryId: "accessories.head",
    copies: [{ instanceId: "copy-1", source: "legacy" }],
    creatorName: "Roblox",
    thumbnailUrl: "https://tr.rbxcdn.com/item.png",
    isLimited: false,
    saleStatus: "offSale",
    rarity: { kind: "unavailable", count: null, label: "Public count unavailable" },
    robloxUrl: "https://www.roblox.com/catalog/1",
    ...overrides,
  };
}

describe("graphic captions and suggestions", () => {
  it("keeps every automatic metric explicitly typed", () => {
    expect(defaultGraphicItemLabel(inventoryItem({
      rarity: { kind: "officialSupply", count: 61, label: "Official supply", sourceUrl: "https://www.roblox.com/catalog/1" },
    }))).toBe("61 OFFICIAL SUPPLY");
    expect(defaultGraphicItemLabel(inventoryItem({
      rarity: { kind: "wikiPurchases", count: 8_857, label: "Historical purchases", sourceUrl: "https://roblox.fandom.com/wiki/Test" },
    }))).toBe("8,857 HISTORICAL PURCHASES");
    expect(defaultGraphicItemLabel(inventoryItem({
      rarity: { kind: "badgeAwards", count: 88_527, label: "Badge awards", sourceUrl: "https://www.roblox.com/badges/1" },
    }))).toBe("88,527 BADGE AWARDS");
    expect(defaultGraphicItemLabel(inventoryItem({
      giftOrigin: {
        sourceName: "Opened Gift",
        sourceMetric: {
          kind: "sourceGiftHistoricalPurchases",
          count: 9_534,
          label: "Source gift historical purchases",
          sourceUrl: "https://roblox.fandom.com/wiki/Gift",
          sourceGiftName: "Opened Gift",
        },
      },
    }))).toBe("9,534 GIFT PURCHASES");
    expect(defaultGraphicItemLabel(inventoryItem({
      collector: {
        score: 80,
        tier: "notable",
        confidence: "medium",
        signals: [],
        sourceUrl: "https://roblox.fandom.com/wiki/Event",
        distributionCount: 540,
        note: "Estimated collector rarity — not an owner count",
      },
    }))).toBe("540 HISTORICAL AWARDS");
    expect(defaultGraphicItemLabel(inventoryItem({
      copies: [
        { instanceId: "copy-1", source: "legacy" },
        { instanceId: "copy-2", source: "legacy" },
      ],
    }))).toBe("×2 OWNED");
  });

  it("prioritizes pictured off-sale collector accessories and caps suggestions", () => {
    const ordinary = inventoryItem({ key: "asset:ordinary", id: "2", name: "Ordinary", saleStatus: "onSale" });
    const collector = inventoryItem({
      key: "asset:collector",
      id: "3",
      name: "Collector",
      collector: {
        score: 90,
        tier: "exceptional",
        confidence: "high",
        signals: [],
        sourceUrl: "https://roblox.fandom.com/wiki/Collector",
        note: "Estimated collector rarity — not an owner count",
      },
    });
    const withoutImage = inventoryItem({ key: "asset:no-image", id: "4", name: "No image", thumbnailUrl: undefined });

    expect(suggestedGraphicItems([ordinary, collector, withoutImage], 1).map(({ key }) => key))
      .toEqual(["asset:collector"]);
  });
});

describe("graphic image and filename boundaries", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders every supported preset and constrains long text to its bordered cells", async () => {
    for (const dimensions of [
      { width: 1920, height: 1080 },
      { width: 1080, height: 1080 },
      { width: 1080, height: 1350 },
    ]) {
      const fillText = vi.fn();
      const strokeText = vi.fn();
      const gradient = { addColorStop: vi.fn() };
      const context = new Proxy({
        createLinearGradient: vi.fn(() => gradient),
        fillText,
        measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
        strokeText,
      }, {
        get(target, property, receiver) {
          if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
          return vi.fn();
        },
      }) as unknown as CanvasRenderingContext2D;
      const canvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => context),
      } as unknown as HTMLCanvasElement;
      const headline = "H".repeat(180);
      const footer = "F".repeat(240);

      await expect(renderInventoryGraphic(canvas, {
        dimensions,
        headline,
        subheadline: "S".repeat(240),
        backgroundPreset: "midnight",
        footerCells: [{ key: "custom", value: footer, label: "EDITABLE LABEL" }],
        username: "Player",
        displayName: "Player",
        showPlayerIdentity: false,
        showItemNames: false,
        items: [],
      })).resolves.toEqual({ missingImages: 0 });

      expect(canvas).toMatchObject(dimensions);
      expect(strokeText).toHaveBeenCalledWith(headline, expect.any(Number), expect.any(Number), dimensions.width - Math.round(Math.min(dimensions.width, dimensions.height) * 0.025) * 2 - 40);
      const footerCall = fillText.mock.calls.find(([text]) => text === footer);
      expect(footerCall?.[3]).toEqual(expect.any(Number));
      expect(footerCall?.[3]).toBeGreaterThan(0);
      expect(fillText.mock.calls.some(([text]) => text === "EDITABLE LABEL")).toBe(true);
      expect(fillText.mock.calls.some(([text]) => text === "Player" || text === "@Player")).toBe(false);
    }
  });

  it("renders every bundled background preset without loading remote background assets", async () => {
    for (const { id } of GRAPHIC_BACKGROUND_OPTIONS) {
      const gradient = { addColorStop: vi.fn() };
      const context = new Proxy({
        createLinearGradient: vi.fn(() => gradient),
        createRadialGradient: vi.fn(() => gradient),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
      }, {
        get(target, property, receiver) {
          if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
          return vi.fn();
        },
      }) as unknown as CanvasRenderingContext2D;
      const canvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => context),
      } as unknown as HTMLCanvasElement;
      const loadImage = vi.fn();

      await expect(renderInventoryGraphic(canvas, {
        dimensions: { width: 1080, height: 1080 },
        headline: "COLLECTION",
        subheadline: "",
        backgroundPreset: id,
        footerCells: [],
        username: "Player",
        displayName: "Player",
        showPlayerIdentity: false,
        showItemNames: false,
        items: [],
      }, loadImage)).resolves.toEqual({ missingImages: 0 });

      expect(canvas).toMatchObject({ width: 1080, height: 1080 });
      expect(context.fillRect).toHaveBeenCalled();
      expect(loadImage).not.toHaveBeenCalled();
    }
  });

  it("renders only the enabled dynamic footer cells and omits the footer when none are enabled", async () => {
    const fillText = vi.fn();
    const gradient = { addColorStop: vi.fn() };
    const context = new Proxy({
      createLinearGradient: vi.fn(() => gradient),
      fillText,
      measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
    }, {
      get(target, property, receiver) {
        if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
        return vi.fn();
      },
    }) as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement;
    const baseModel = {
      dimensions: { width: 1080, height: 1080 },
      headline: "COLLECTION",
      subheadline: "",
      backgroundPreset: "midnight" as const,
      username: "Player",
      displayName: "Player",
      showPlayerIdentity: false,
      showItemNames: false,
      items: [],
    };

    await renderInventoryGraphic(canvas, {
      ...baseModel,
      footerCells: [{ key: "currency", value: "BTC / ETH", label: "CRYPTO ACCEPTED" }],
    });
    expect(fillText.mock.calls.some(([text]) => text === "BTC / ETH")).toBe(true);
    expect(fillText.mock.calls.some(([text]) => text === "CRYPTO ACCEPTED")).toBe(true);
    expect(fillText.mock.calls.some(([text]) => text === "SELECTED ITEMS" || text === "OWNED COPIES")).toBe(false);

    fillText.mockClear();
    await renderInventoryGraphic(canvas, { ...baseModel, footerCells: [] });
    expect(fillText.mock.calls.some(([text]) => [
      "CUSTOM TEXT",
      "OFF-SALE ITEMS",
      "OFF-SALE",
      "SELECTED ITEMS",
      "OWNED COPIES",
      "CURRENCY ACCEPTED",
      "CRYPTO ACCEPTED",
    ].includes(String(text)))).toBe(false);
  });

  it("rejects unsupported canvas dimensions before loading images", async () => {
    const loadImage = vi.fn();
    await expect(renderInventoryGraphic({} as HTMLCanvasElement, {
      dimensions: { width: 200, height: 200 },
      headline: "",
      subheadline: "",
      backgroundPreset: "midnight",
      footerCells: [],
      username: "Player",
      displayName: "Player",
      showPlayerIdentity: false,
      showItemNames: false,
      items: [],
    }, loadImage)).rejects.toBeInstanceOf(RangeError);
    expect(loadImage).not.toHaveBeenCalled();
  });

  it("rejects non-Roblox image URLs before creating an image", async () => {
    let created = false;
    await expect(loadRobloxGraphicImage("https://evil.example/avatar.png", {
      createImage: () => {
        created = true;
        return {} as HTMLImageElement;
      },
    })).resolves.toBeUndefined();
    expect(created).toBe(false);
  });

  it("sets anonymous CORS before starting a Roblox CDN image request", async () => {
    const assignments: string[] = [];
    let fake: HTMLImageElement;
    const fakeSource = {
      width: 420,
      height: 420,
      naturalWidth: 420,
      naturalHeight: 420,
      onload: null,
      onerror: null,
      set crossOrigin(value: string | null) { assignments.push(`cors:${value}`); },
      set decoding(value: string) { assignments.push(`decoding:${value}`); },
      set referrerPolicy(value: string) { assignments.push(`referrer:${value}`); },
      set src(value: string) {
        assignments.push(`src:${value}`);
        queueMicrotask(() => fake.onload?.(new Event("load")));
      },
    };
    fake = fakeSource as unknown as HTMLImageElement;

    const image = await loadRobloxGraphicImage("https://tr.rbxcdn.com/item.png", {
      createImage: () => fake,
      timeoutMs: 1_000,
    });
    expect(image).toMatchObject({ width: 420, height: 420 });
    expect(assignments[0]).toBe("cors:anonymous");
    expect(assignments.at(-1)).toBe("src:https://tr.rbxcdn.com/item.png");
  });

  it("sanitizes the downloaded filename", () => {
    expect(graphicFilename("  Name / ../../evil  ", "Landscape"))
      .toBe("inventory-lens-name-evil-landscape.png");
    expect(graphicFilename("collection", "portrait"))
      .toBe("inventory-lens-collection-portrait.png");
  });

  it("downloads an encoded PNG without requesting browser download permission", async () => {
    const click = vi.fn();
    const remove = vi.fn();
    const append = vi.fn();
    const anchor = { download: "", href: "", rel: "", click, remove };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { append },
    });
    vi.stubGlobal("window", { setTimeout: (callback: () => void) => { callback(); return 0; } });
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:graphic");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const canvas = {
      toBlob(callback: BlobCallback, type?: string) {
        expect(type).toBe("image/png");
        callback(new Blob(["png"], { type: "image/png" }));
      },
    } as HTMLCanvasElement;

    await downloadCanvasPng(canvas, "inventory-lens-player-landscape.png");

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(anchor).toMatchObject({
      download: "inventory-lens-player-landscape.png",
      href: "blob:graphic",
      rel: "noopener",
    });
    expect(append).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:graphic");
  });
});
