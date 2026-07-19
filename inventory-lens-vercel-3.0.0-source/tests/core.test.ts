import { describe, expect, it } from "vitest";
import {
  CATEGORY_GROUPS,
  CATEGORY_OPTIONS,
  CATEGORY_PRESETS,
  includesBundles,
  legacyAssetTypeIdsForCategoryId,
  selectedLegacyAssetTypeIds,
  selectedUnsupportedPublicCategoryIds,
} from "../src/lib/categories";
import { collectorProfileFor } from "../src/lib/collector";
import { groupInventoryRecords, mergeGroupedItems, saleStatusFor, sortGroupedItems } from "../src/lib/grouping";
import { parseUserInput } from "../src/lib/input";
import { normalizeBundles, normalizeLegacyAssets, normalizeLegacyMakeup } from "../src/lib/normalize";
import type {
  BadgeMetadata,
  CatalogItemMetadata,
  FandomItemMetadata,
  FandomPurchaseMetadata,
  NormalizedInventoryRecord,
} from "../src/lib/types";

describe("player input", () => {
  it("accepts usernames, IDs, @names, and Roblox profile URLs", () => {
    expect(parseUserInput("SamplePlayer")).toEqual({ kind: "username", value: "SamplePlayer" });
    expect(parseUserInput(" @some_user ")).toEqual({ kind: "username", value: "some_user" });
    expect(parseUserInput("24680")).toEqual({ kind: "id", value: "24680" });
    expect(parseUserInput("https://www.roblox.com/users/123456/profile#!/about")).toEqual({ kind: "id", value: "123456" });
  });

  it("rejects unrelated URLs and malformed usernames", () => {
    expect(() => parseUserInput("https://example.com/users/1/profile")).toThrow(/valid Roblox/i);
    expect(() => parseUserInput("ab")).toThrow(/valid Roblox/i);
    expect(() => parseUserInput("a__b")).toThrow(/valid Roblox/i);
    expect(() => parseUserInput(" ")).toThrow(/enter a Roblox/i);
  });
});

describe("category taxonomy", () => {
  it("puts the five highest-priority inventory groups first", () => {
    expect(CATEGORY_GROUPS.slice(0, 5)).toEqual([
      "Accessories",
      "Hair",
      "Heads",
      "Bundles",
      "Animations",
    ]);
  });

  it("contains every requested navigation group and unique leaf IDs", () => {
    const groups = new Set(CATEGORY_OPTIONS.map(({ group }) => group));
    expect(groups).toEqual(expect.objectContaining(new Set([
      "Accessories", "Avatar Animations", "Badges", "Bundles", "Classic Clothing", "Makeup",
      "Models & Packages", "Passes", "Places", "Private Servers", "Tops", "Video",
    ])));
    expect(new Set(CATEGORY_OPTIONS.map(({ id }) => id)).size).toBe(CATEGORY_OPTIONS.length);
  });

  it("maps selected public categories to the official numeric AssetType IDs", () => {
    expect(selectedLegacyAssetTypeIds([
      "accessories.head",
      "accessories.face",
      "classicClothing.pants",
      "meshes",
    ])).toEqual([8, 42, 57, 58, 12, 4, 40]);
    expect(legacyAssetTypeIdsForCategoryId("makeup.face")).toEqual([88]);
  });

  it("identifies categories that cannot be enumerated anonymously", () => {
    expect(selectedUnsupportedPublicCategoryIds([
      "accessories.head",
      "badges",
      "passes",
      "places.created",
      "places.purchased",
      "privateServers",
    ])).toEqual(["badges", "passes", "places.purchased", "privateServers"]);
  });

  it("defines All, Avatar, No classic clothing, and Clear presets", () => {
    expect(CATEGORY_PRESETS.all).toHaveLength(CATEGORY_OPTIONS.length);
    expect(CATEGORY_PRESETS.avatar).toContain("makeup.face");
    expect(CATEGORY_PRESETS.avatar).not.toContain("badges");
    expect(CATEGORY_PRESETS.noClassicClothing).not.toContain("classicClothing.shirts");
    expect(CATEGORY_PRESETS.clear).toEqual([]);
    expect(selectedLegacyAssetTypeIds(["makeup.face", "makeup.eye"])).toEqual([88, 90]);
    expect(includesBundles(["bundles"])).toBe(true);
  });
});

describe("normalization and copy grouping", () => {
  it("normalizes exact public userAssetIds and preserves copy details", () => {
    const records = normalizeLegacyAssets([
      {
        assetTypeId: 8,
        userAssetId: "asset-copy",
        assetId: "42",
        assetName: "Hat",
        created: "2025-01-01T00:00:00Z",
        serialNumber: 7,
      },
      { assetTypeId: 42, userAssetId: "face-copy", assetId: "43", assetName: "Face item" },
      { assetTypeId: 8, userAssetId: "asset-copy", assetId: "42", assetName: "Hat replay" },
    ]);
    expect(records.map(({ kind }) => kind)).toEqual(["asset", "asset"]);
    expect(records[0]).toMatchObject({ key: "asset:42", categoryId: "accessories.head" });
    expect(records[0]?.copy).toMatchObject({ instanceId: "asset-copy", serialNumber: 7, source: "legacy" });
    expect(records[1]).toMatchObject({ key: "asset:43", categoryId: "accessories.face" });
  });

  it("uses legacy userAssetIds and bundle identities", () => {
    expect(normalizeLegacyMakeup([{
      assetTypeId: 89,
      userAssetId: 888,
      assetId: 99,
      assetName: "Gloss",
      created: "2025-03-01T00:00:00Z",
    }])[0]).toMatchObject({ key: "asset:99", categoryId: "makeup.lip", copy: { instanceId: "888", source: "legacy" } });
    expect(normalizeBundles([{ id: 7, name: "Robot", bundleType: "BodyParts" }])[0])
      .toMatchObject({ key: "bundle:7", copy: { instanceId: "bundle:7" } });
  });

  it("groups only distinct instances of the same item", () => {
    const base: Omit<NormalizedInventoryRecord, "copy"> = {
      key: "asset:42", kind: "asset", id: "42", categoryId: "accessories.head", assetType: "HAT",
    };
    const items = groupInventoryRecords([
      { ...base, copy: { instanceId: "1", source: "legacy" } },
      { ...base, copy: { instanceId: "2", source: "legacy" } },
      { ...base, copy: { instanceId: "2", acquiredAt: "2025-01-01T00:00:00Z", source: "legacy" } },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.copies.map(({ instanceId }) => instanceId)).toEqual(["2", "1"]);
  });
});

describe("rarity rules", () => {
  const record: NormalizedInventoryRecord = {
    key: "asset:1048338",
    kind: "asset",
    id: "1048338",
    name: "Sinister²",
    assetType: "HAT",
    categoryId: "accessories.head",
    copy: { instanceId: "copy-1", source: "legacy" },
  };

  function catalog(overrides: Partial<CatalogItemMetadata>): Map<string, CatalogItemMetadata> {
    return new Map([[record.key, {
      key: record.key,
      id: record.id,
      itemType: "Asset",
      name: "Sinister²",
      itemRestrictions: [],
      ...overrides,
    }]]);
  }

  it("keeps Sinister Sales 0 unknown even when Roblox supplies collectibleItemId", () => {
    const item = groupInventoryRecords([record], {
      catalog: catalog({ collectibleItemId: "uuid", totalQuantity: 0, sales: 0 }),
    })[0]!;
    expect(item.isLimited).toBe(false);
    expect(item.rarity).toEqual(expect.objectContaining({ kind: "unavailable", count: null }));
  });

  it("never treats a non-limited purchase count as supply", () => {
    const item = groupInventoryRecords([record], { catalog: catalog({ sales: 8857 }) })[0]!;
    expect(item.rarity.kind).toBe("unavailable");
  });

  it("labels Roblox Wiki history as purchases, never supply or unique owners", () => {
    const fandom: FandomPurchaseMetadata = {
      key: record.key,
      id: record.id,
      count: 8_857,
      pageTitle: "Catalog:Sinister^2",
      sourceUrl: "https://roblox.fandom.com/wiki/Catalog%3ASinister%5E2",
      asOf: "November 16, 2023",
    };
    const item = groupInventoryRecords([record], {
      catalog: catalog({ sales: 0, totalQuantity: 0 }),
      fandomPurchases: new Map([[record.key, fandom]]),
    })[0]!;
    expect(item.isLimited).toBe(false);
    expect(item.rarity).toEqual({
      kind: "wikiPurchases",
      count: 8_857,
      label: "Historical purchases",
      sourceUrl: fandom.sourceUrl,
      asOf: "November 16, 2023",
    });
  });

  it("uses only positive official limited totalQuantity as supply", () => {
    const item = groupInventoryRecords([record], {
      catalog: catalog({ itemRestrictions: ["Limited"], totalQuantity: 250 }),
    })[0]!;
    expect(item.isLimited).toBe(true);
    expect(item.rarity).toEqual(expect.objectContaining({ kind: "officialSupply", count: 250 }));
  });

  it("keeps official limited supply ahead of third-party purchase history", () => {
    const fandom: FandomPurchaseMetadata = {
      key: record.key,
      id: record.id,
      count: 8_857,
      pageTitle: "Catalog:Sinister^2",
      sourceUrl: "https://roblox.fandom.com/wiki/Catalog%3ASinister%5E2",
    };
    const item = groupInventoryRecords([record], {
      catalog: catalog({ itemRestrictions: ["Limited"], totalQuantity: 250 }),
      fandomPurchases: new Map([[record.key, fandom]]),
    })[0]!;
    expect(item.rarity).toEqual(expect.objectContaining({ kind: "officialSupply", count: 250 }));
  });

  it("keeps badge awards a separate metric", () => {
    const badgeRecord: NormalizedInventoryRecord = {
      key: "badge:9", kind: "badge", id: "9", categoryId: "badges",
      copy: { instanceId: "b", source: "legacy" },
    };
    const badge: BadgeMetadata = { id: "9", name: "Winner", awardedCount: 123 };
    const item = groupInventoryRecords([badgeRecord], { badges: new Map([[badgeRecord.key, badge]]) })[0]!;
    expect(item.rarity).toEqual(expect.objectContaining({ kind: "badgeAwards", count: 123 }));
    expect(item.isLimited).toBe(false);
  });
});

describe("collector rarity estimate", () => {
  const now = Date.parse("2026-07-18T12:00:00Z");

  function history(overrides: Partial<FandomItemMetadata>): FandomItemMetadata {
    return {
      key: "asset:1",
      id: "1",
      pageTitle: "Catalog:Item",
      sourceUrl: "https://roblox.fandom.com/wiki/Catalog%3AItem",
      acquisitionKinds: [],
      ...overrides,
    };
  }

  function official(overrides: Partial<CatalogItemMetadata>): CatalogItemMetadata {
    return {
      key: "asset:1",
      id: "1",
      itemType: "Asset",
      name: "Item",
      itemRestrictions: [],
      ...overrides,
    };
  }

  it("recognizes Ghost Fedora as an old, popular, off-sale event prize", () => {
    const profile = collectorProfileFor(history({
      publishedAt: "October 13, 2014",
      favoriteCount: 23_459,
      favoriteAsOf: "March 20, 2026",
      acquisitionKinds: ["eventPrize"],
    }), "offSale", official({ favoriteCount: 23_858 }), now);

    expect(profile).toMatchObject({
      score: 61,
      tier: "rare",
      confidence: "medium",
      favoriteCount: 23_858,
      favoriteSource: "Roblox",
      publishedAt: "October 13, 2014",
      note: "Estimated collector rarity — not an owner count",
    });
    expect(profile?.favoriteAsOf).toBeUndefined();
    expect(profile?.signals.map(({ kind }) => kind)).toEqual(["eventPrize", "age", "offSale", "favorites"]);
  });

  it("keeps Festive Sword Valkyrie's broad historical awards separate and lowers its estimate", () => {
    const profile = collectorProfileFor(history({
      publishedAt: "December 10, 2014",
      favoriteCount: 19_888,
      distributionCount: 88_527,
      distributionLabel: "awards",
      distributionAsOf: "January 8, 2022",
      acquisitionKinds: ["eventPrize"],
    }), "offSale", official({ favoriteCount: 27_301 }), now);

    expect(profile).toMatchObject({
      score: 51,
      tier: "notable",
      confidence: "high",
      distributionCount: 88_527,
      distributionLabel: "awards",
    });
    expect(profile?.signals).toContainEqual(expect.objectContaining({
      kind: "historicalDistribution",
      points: -12,
      label: "88,527 historical awards; broadly distributed",
    }));
  });

  it("rates Chicago BLOXcon as an in-person exclusive without stacking overlapping acquisition prose", () => {
    const profile = collectorProfileFor(history({
      publishedAt: "July 16, 2013",
      favoriteCount: 130,
      acquisitionKinds: ["inPersonEvent", "eventPrize"],
    }), "offSale", official({ favoriteCount: 132 }), now);

    expect(profile).toMatchObject({ score: 72, tier: "rare", confidence: "medium" });
    expect(profile?.signals.filter(({ kind }) => kind === "inPersonEvent" || kind === "eventPrize"))
      .toEqual([{ kind: "inPersonEvent", label: "In-person event exclusive", points: 40 }]);
  });

  it("never surfaces on-sale or unknown-availability items as collector picks", () => {
    const evidence = history({
      publishedAt: "July 16, 2013",
      favoriteCount: 1_000_000,
      acquisitionKinds: ["inPersonEvent"],
    });
    expect(collectorProfileFor(evidence, "onSale", official({ favoriteCount: 1_000_000 }), now)).toBeUndefined();
    expect(collectorProfileFor(evidence, "unknown", official({ favoriteCount: 1_000_000 }), now)).toBeUndefined();
  });

  it("does not call age and popularity alone a collector pick", () => {
    const profile = collectorProfileFor(
      history({ publishedAt: "July 16, 2013", acquisitionKinds: [] }),
      "offSale",
      official({ favoriteCount: 1_000_000 }),
      now,
    );

    expect(profile).toMatchObject({ score: 45, tier: "none", confidence: "medium" });
    expect(profile?.signals.map(({ kind }) => kind)).toEqual(["age", "offSale", "favorites"]);
  });

  it("removes a collector profile if incremental catalog signals make availability unknown", () => {
    const record: NormalizedInventoryRecord = {
      key: "asset:1", kind: "asset", id: "1", name: "Event item", categoryId: "accessories.head",
      copy: { instanceId: "copy", source: "legacy" },
    };
    const fandomItems = new Map([[record.key, history({
      publishedAt: "July 16, 2013",
      favoriteCount: 1_000,
      acquisitionKinds: ["inPersonEvent"],
    })]]);
    const offSale = groupInventoryRecords([record], {
      fandomItems,
      catalog: new Map([[record.key, official({ isOffSale: true })]]),
    });
    const onSale = groupInventoryRecords([record], {
      fandomItems,
      catalog: new Map([[record.key, official({ isOffSale: false })]]),
    });

    expect(offSale[0]?.collector?.tier).toBe("rare");
    expect(mergeGroupedItems(offSale, onSale)[0]).toMatchObject({ saleStatus: "unknown", collector: undefined });
  });

  it("uses official creation and favorite fields when wiki prose omits them", () => {
    const profile = collectorProfileFor(
      history({ acquisitionKinds: ["eventPrize"] }),
      "offSale",
      official({ favoriteCount: 23_858, createdAt: "2014-10-13T00:00:00Z" }),
      now,
    );
    expect(profile).toMatchObject({ score: 61, tier: "rare", favoriteSource: "Roblox" });
    expect(profile?.publishedAt).toBe("2014-10-13T00:00:00Z");
  });

  it("does not promote historical distributions into the primary rarity metric", () => {
    const record: NormalizedInventoryRecord = {
      key: "asset:1",
      kind: "asset",
      id: "1",
      name: "Event item",
      categoryId: "accessories.head",
      copy: { instanceId: "copy", source: "legacy" },
    };
    const item = groupInventoryRecords([record], {
      catalog: new Map([[record.key, official({ isOffSale: true, favoriteCount: 27_301 })]]),
      fandomItems: new Map([[record.key, history({
        publishedAt: "December 10, 2014",
        distributionCount: 88_527,
        distributionLabel: "awards",
        acquisitionKinds: ["eventPrize"],
      })]]),
    })[0]!;

    expect(item.rarity).toMatchObject({ kind: "unavailable", count: null });
    expect(item.collector).toMatchObject({ tier: "notable", distributionCount: 88_527 });
  });
});

describe("gift reward relationships", () => {
  const reward: NormalizedInventoryRecord = {
    key: "asset:94260278",
    kind: "asset",
    id: "94260278",
    name: "Ghost Tie",
    assetType: "NECK_ACCESSORY",
    categoryId: "accessories.neck",
    copy: { instanceId: "reward-copy", source: "legacy" },
  };
  const sourceGift: NormalizedInventoryRecord = {
    key: "asset:94108159",
    kind: "asset",
    id: "94108159",
    name: "Opened Gift of the Ghastly Ghostie",
    assetType: "HAT",
    categoryId: "accessories.head",
    copy: { instanceId: "gift-copy-1", source: "legacy" },
  };
  const rewardCatalog: CatalogItemMetadata = {
    key: reward.key,
    id: reward.id,
    itemType: "Asset",
    name: "Ghost Tie",
    itemRestrictions: [],
    isOffSale: true,
    createdAt: "2012-10-04T00:00:00Z",
    description: `Ghosts usually like "Boo" ties. This item came out of the Gift of the Ghastly Ghostie on Oct 5, 2012`,
  };
  const sourceCatalog: CatalogItemMetadata = {
    key: sourceGift.key,
    id: sourceGift.id,
    itemType: "Asset",
    name: "Opened Gift of the Ghastly Ghostie",
    itemRestrictions: ["Limited"],
    totalQuantity: 10_000,
    isOffSale: true,
  };
  const sourceHistory: FandomItemMetadata = {
    key: sourceGift.key,
    id: sourceGift.id,
    pageTitle: "Catalog:Opened Gift of the Ghastly Ghostie",
    sourceUrl: "https://roblox.fandom.com/wiki/Catalog%3AOpened_Gift_of_the_Ghastly_Ghostie",
    purchaseCount: 9_534,
    purchaseAsOf: "October 28, 2019",
    acquisitionKinds: [],
  };

  function rewardGroup(): ReturnType<typeof groupInventoryRecords> {
    return groupInventoryRecords([reward], {
      catalog: new Map([[reward.key, rewardCatalog]]),
    });
  }

  function sourceGroup(withHistory = true): ReturnType<typeof groupInventoryRecords> {
    return groupInventoryRecords([
      sourceGift,
      { ...sourceGift, copy: { instanceId: "gift-copy-2", source: "legacy" } },
    ], {
      catalog: new Map([[sourceGift.key, sourceCatalog]]),
      fandomItems: withHistory ? new Map([[sourceGift.key, sourceHistory]]) : undefined,
    });
  }

  it("links Ghost Tie to the owned opened gift and types its 9,534 purchases separately", () => {
    const items = groupInventoryRecords([
      reward,
      sourceGift,
      { ...sourceGift, copy: { instanceId: "gift-copy-2", source: "legacy" } },
    ], {
      catalog: new Map([
        [reward.key, rewardCatalog],
        [sourceGift.key, sourceCatalog],
      ]),
      fandomItems: new Map([[sourceGift.key, sourceHistory]]),
    });
    const linkedReward = items.find(({ key }) => key === reward.key)!;
    const linkedSource = items.find(({ key }) => key === sourceGift.key)!;

    expect(linkedReward.rarity).toMatchObject({ kind: "unavailable", count: null });
    expect(linkedReward.giftOrigin).toEqual({
      sourceName: "Gift of the Ghastly Ghostie",
      sourceItemKey: sourceGift.key,
      sourceItemId: sourceGift.id,
      sourceItemName: "Opened Gift of the Ghastly Ghostie",
      sourceRobloxUrl: linkedSource.robloxUrl,
      sourceOwnedCopies: 2,
      sourceMetric: {
        kind: "sourceGiftHistoricalPurchases",
        count: 9_534,
        label: "Source gift historical purchases",
        sourceUrl: sourceHistory.sourceUrl,
        sourceGiftName: "Opened Gift of the Ghastly Ghostie",
        asOf: "October 28, 2019",
      },
    });
    expect(linkedReward.collector?.signals).toContainEqual({
      kind: "giftReward",
      label: "Reward from Gift of the Ghastly Ghostie",
      points: 24,
    });

    // Official supply remains the source gift's primary metric, while direct
    // wiki history is retained for the separately labeled reward relationship.
    expect(linkedSource.rarity).toMatchObject({ kind: "officialSupply", count: 10_000 });
    expect(linkedSource.wikiPurchaseHistory).toMatchObject({ kind: "wikiPurchases", count: 9_534 });
    expect(linkedSource.giftRewards).toEqual([{
      rewardItemKey: reward.key,
      rewardItemId: reward.id,
      rewardItemName: "Ghost Tie",
      rewardRobloxUrl: linkedReward.robloxUrl,
      rewardOwnedCopies: 1,
    }]);
  });

  it("relinks incremental scans in either source/reward order", () => {
    for (const [first, second] of [
      [rewardGroup(), sourceGroup()],
      [sourceGroup(), rewardGroup()],
    ] as const) {
      const linked = mergeGroupedItems(first, second).find(({ key }) => key === reward.key)!;
      expect(linked.giftOrigin).toMatchObject({
        sourceItemKey: sourceGift.key,
        sourceOwnedCopies: 2,
        sourceMetric: { kind: "sourceGiftHistoricalPurchases", count: 9_534 },
      });
      const mergedAgain = mergeGroupedItems(mergeGroupedItems(first, second), sourceGroup());
      expect(mergedAgain.find(({ key }) => key === sourceGift.key)?.giftRewards).toEqual([
        expect.objectContaining({ rewardItemKey: reward.key, rewardOwnedCopies: 1 }),
      ]);
    }
  });

  it("keeps the official source relationship when purchase history is absent", () => {
    const linked = mergeGroupedItems(rewardGroup(), sourceGroup(false))
      .find(({ key }) => key === reward.key)!;
    expect(linked.giftOrigin).toMatchObject({
      sourceName: "Gift of the Ghastly Ghostie",
      sourceItemName: "Opened Gift of the Ghastly Ghostie",
      sourceOwnedCopies: 2,
    });
    expect(linked.giftOrigin?.sourceMetric).toBeUndefined();

    const rewardOnly = rewardGroup()[0]!;
    expect(rewardOnly.giftOrigin).toEqual({ sourceName: "Gift of the Ghastly Ghostie" });
  });

  it("links the live source-side 'Inside you find' description when reward prose is absent", () => {
    const rewardWithoutOrigin = { ...rewardCatalog, description: undefined };
    const sourceWithContents = {
      ...sourceCatalog,
      description: "Inside you find... the Ghost Tie!",
    };
    const items = groupInventoryRecords([reward, sourceGift], {
      catalog: new Map<string, CatalogItemMetadata>([
        [reward.key, rewardWithoutOrigin],
        [sourceGift.key, sourceWithContents],
      ]),
      fandomItems: new Map([[sourceGift.key, sourceHistory]]),
    });
    const linkedReward = items.find(({ key }) => key === reward.key)!;
    const linkedSource = items.find(({ key }) => key === sourceGift.key)!;
    expect(linkedSource.describedGiftReward).toEqual({
      rewardName: "Ghost Tie",
      evidence: "officialDescription",
    });
    expect(linkedReward.giftOrigin).toMatchObject({
      sourceItemKey: sourceGift.key,
      sourceOwnedCopies: 1,
      sourceMetric: { kind: "sourceGiftHistoricalPurchases", count: 9_534 },
    });
    expect(linkedSource.giftRewards).toEqual([
      expect.objectContaining({ rewardItemKey: reward.key, rewardOwnedCopies: 1 }),
    ]);
  });

  it("removes an inferred source-only link when a later gift makes it ambiguous", () => {
    const rewardWithoutOrigin: CatalogItemMetadata = { ...rewardCatalog, description: undefined };
    const firstSourceCatalog: CatalogItemMetadata = {
      ...sourceCatalog,
      description: "Inside you find... the Ghost Tie!",
    };
    const firstScan = groupInventoryRecords([reward, sourceGift], {
      catalog: new Map([
        [reward.key, rewardWithoutOrigin],
        [sourceGift.key, firstSourceCatalog],
      ]),
    });
    expect(firstScan.find(({ key }) => key === reward.key)?.giftOrigin?.sourceItemKey).toBe(sourceGift.key);

    const secondGift: NormalizedInventoryRecord = {
      ...sourceGift,
      key: "asset:999004",
      id: "999004",
      name: "Opened Gift of the Second Ghostie",
      copy: { instanceId: "second-source", source: "legacy" },
    };
    const secondScan = groupInventoryRecords([secondGift], {
      catalog: new Map([[secondGift.key, {
        ...firstSourceCatalog,
        key: secondGift.key,
        id: secondGift.id,
        name: secondGift.name!,
      }]]),
    });
    const merged = mergeGroupedItems(firstScan, secondScan);
    expect(merged.find(({ key }) => key === reward.key)?.giftOrigin).toBeUndefined();
    expect(merged.flatMap(({ giftRewards }) => giftRewards ?? [])).toEqual([]);
  });

  it("refuses source-side name and source ambiguities", () => {
    const duplicateReward: NormalizedInventoryRecord = {
      ...reward,
      key: "asset:999001",
      id: "999001",
      copy: { instanceId: "duplicate", source: "legacy" },
    };
    const sourceWithContents = {
      ...sourceCatalog,
      description: "Inside you find... the Ghost Tie!",
    };
    const ambiguousRewards = groupInventoryRecords([reward, duplicateReward, sourceGift], {
      catalog: new Map<string, CatalogItemMetadata>([
        [reward.key, { ...rewardCatalog, description: undefined }],
        [duplicateReward.key, {
          ...rewardCatalog,
          key: duplicateReward.key,
          id: duplicateReward.id,
          description: undefined,
        }],
        [sourceGift.key, sourceWithContents],
      ]),
    });
    expect(ambiguousRewards.find(({ key }) => key === sourceGift.key)?.giftRewards).toBeUndefined();
    expect(ambiguousRewards.filter(({ name }) => name === "Ghost Tie").every(({ giftOrigin }) => !giftOrigin)).toBe(true);

    const secondGift: NormalizedInventoryRecord = {
      ...sourceGift,
      key: "asset:999002",
      id: "999002",
      name: "Opened Gift of the Other Ghostie",
      copy: { instanceId: "other-gift", source: "legacy" },
    };
    const ambiguousSources = groupInventoryRecords([reward, sourceGift, secondGift], {
      catalog: new Map<string, CatalogItemMetadata>([
        [reward.key, { ...rewardCatalog, description: undefined }],
        [sourceGift.key, sourceWithContents],
        [secondGift.key, {
          ...sourceWithContents,
          key: secondGift.key,
          id: secondGift.id,
          name: secondGift.name!,
        }],
      ]),
    });
    expect(ambiguousSources.find(({ key }) => key === reward.key)?.giftOrigin).toBeUndefined();
    expect(ambiguousSources.flatMap(({ giftRewards }) => giftRewards ?? [])).toEqual([]);
  });

  it("does not guess between opened and unopened source assets with the same canonical name", () => {
    const unopenedGift: NormalizedInventoryRecord = {
      ...sourceGift,
      key: "asset:999003",
      id: "999003",
      name: "Gift of the Ghastly Ghostie",
      copy: { instanceId: "unopened-gift", source: "legacy" },
    };
    const items = groupInventoryRecords([reward, sourceGift, unopenedGift], {
      catalog: new Map<string, CatalogItemMetadata>([
        [reward.key, rewardCatalog],
        [sourceGift.key, sourceCatalog],
        [unopenedGift.key, {
          ...sourceCatalog,
          key: unopenedGift.key,
          id: unopenedGift.id,
          name: unopenedGift.name!,
        }],
      ]),
      fandomItems: new Map([[sourceGift.key, sourceHistory]]),
    });
    expect(items.find(({ key }) => key === reward.key)?.giftOrigin).toEqual({
      sourceName: "Gift of the Ghastly Ghostie",
    });
    expect(items.flatMap(({ giftRewards }) => giftRewards ?? [])).toEqual([]);
  });

  it("never applies source-side prose to a non-gift catalog item or same item", () => {
    const ordinarySource = {
      ...sourceCatalog,
      name: "Ordinary Hat",
      description: "Inside you find... the Ghost Tie!",
    };
    const ordinaryItems = groupInventoryRecords([reward, sourceGift], {
      catalog: new Map<string, CatalogItemMetadata>([
        [reward.key, { ...rewardCatalog, description: undefined }],
        [sourceGift.key, ordinarySource],
      ]),
    });
    expect(ordinaryItems.find(({ key }) => key === sourceGift.key)?.describedGiftReward).toBeUndefined();
    expect(ordinaryItems.find(({ key }) => key === reward.key)?.giftOrigin).toBeUndefined();

    const selfDescription = {
      ...sourceCatalog,
      description: "Inside you find... the Opened Gift of the Ghastly Ghostie!",
    };
    const selfOnly = groupInventoryRecords([sourceGift], {
      catalog: new Map([[sourceGift.key, selfDescription]]),
    })[0]!;
    expect(selfOnly.giftOrigin).toBeUndefined();
    expect(selfOnly.giftRewards).toBeUndefined();
  });

  it("never replaces a reward's direct official or wiki rarity with its source gift history", () => {
    const limitedRewardCatalog = {
      ...rewardCatalog,
      itemRestrictions: ["Limited"],
      totalQuantity: 75,
    };
    const rewardHistory: FandomItemMetadata = {
      key: reward.key,
      id: reward.id,
      pageTitle: "Catalog:Ghost Tie",
      sourceUrl: "https://roblox.fandom.com/wiki/Catalog%3AGhost_Tie",
      purchaseCount: 123,
      acquisitionKinds: [],
    };
    const items = groupInventoryRecords([reward, sourceGift], {
      catalog: new Map([
        [reward.key, limitedRewardCatalog],
        [sourceGift.key, sourceCatalog],
      ]),
      fandomItems: new Map([
        [reward.key, rewardHistory],
        [sourceGift.key, sourceHistory],
      ]),
    });
    const linkedReward = items.find(({ key }) => key === reward.key)!;
    expect(linkedReward.rarity).toMatchObject({ kind: "officialSupply", count: 75 });
    expect(linkedReward.wikiPurchaseHistory).toMatchObject({ kind: "wikiPurchases", count: 123 });
    expect(linkedReward.giftOrigin?.sourceMetric).toMatchObject({
      kind: "sourceGiftHistoricalPurchases",
      count: 9_534,
    });
  });
});

describe("official catalog sale status", () => {
  function metadata(overrides: Partial<CatalogItemMetadata> = {}): CatalogItemMetadata {
    return {
      key: "asset:1",
      id: "1",
      itemType: "Asset",
      name: "Item",
      itemRestrictions: [],
      ...overrides,
    };
  }

  it("recognizes explicit off-sale signals", () => {
    expect(saleStatusFor("asset", metadata({ priceStatus: "Off Sale" }))).toBe("offSale");
    expect(saleStatusFor("asset", metadata({ priceStatus: "OffSale" }))).toBe("offSale");
    expect(saleStatusFor("asset", metadata({ isOffSale: true, price: 100 }))).toBe("offSale");
  });

  it("does not call contradictory official signals confirmed off-sale", () => {
    expect(saleStatusFor("asset", metadata({
      isOffSale: true,
      priceStatus: "Free",
      itemStatus: ["Sale"],
      price: 100,
    }))).toBe("unknown");
  });

  it("recognizes explicit on-sale signals and current positive-price listings", () => {
    expect(saleStatusFor("asset", metadata({ isOffSale: false }))).toBe("onSale");
    expect(saleStatusFor("asset", metadata({ priceStatus: "Free", price: 0 }))).toBe("onSale");
    expect(saleStatusFor("bundle", metadata({ itemStatus: ["Sale"] }))).toBe("onSale");
    expect(saleStatusFor("asset", metadata({ price: 795 }))).toBe("onSale");
  });

  it("keeps missing, unsupported, and conflicting metadata unknown", () => {
    expect(saleStatusFor("asset")).toBe("unknown");
    expect(saleStatusFor("badge", metadata({ isOffSale: true }))).toBe("unknown");
    expect(saleStatusFor("asset", metadata())).toBe("unknown");
    expect(saleStatusFor("asset", metadata({ price: 0 }))).toBe("unknown");
    expect(saleStatusFor("asset", metadata({ priceStatus: "NoResellers", price: 100 }))).toBe("unknown");
    expect(saleStatusFor("asset", metadata({ priceStatus: "Off Sale", isOffSale: false }))).toBe("unknown");
  });

  it("propagates a mandatory status to every grouped item", () => {
    const record: NormalizedInventoryRecord = {
      key: "asset:1",
      kind: "asset",
      id: "1",
      categoryId: "accessories.head",
      copy: { instanceId: "one", source: "legacy" },
    };
    expect(groupInventoryRecords([record])[0]?.saleStatus).toBe("unknown");
    expect(groupInventoryRecords([record], {
      catalog: new Map([[record.key, metadata({ isOffSale: true })]]),
    })[0]?.saleStatus).toBe("offSale");
  });
});

describe("sorting and incremental merge", () => {
  const records: NormalizedInventoryRecord[] = [
    { key: "asset:1", kind: "asset", id: "1", name: "Unknown", categoryId: "accessories.head", copy: { instanceId: "a", source: "legacy" } },
    { key: "asset:2", kind: "asset", id: "2", name: "Rare", categoryId: "accessories.head", copy: { instanceId: "b", source: "legacy" } },
    { key: "asset:3", kind: "asset", id: "3", name: "Less rare", categoryId: "accessories.head", copy: { instanceId: "c", source: "legacy" } },
  ];
  const catalog = new Map<string, CatalogItemMetadata>([
    ["asset:2", { key: "asset:2", id: "2", itemType: "Asset", name: "Rare", itemRestrictions: ["Limited"], totalQuantity: 10 }],
    ["asset:3", { key: "asset:3", id: "3", itemType: "Asset", name: "Less rare", itemRestrictions: ["Collectible"], totalQuantity: 100 }],
  ]);

  it("sorts known official supplies first and unknown values last", () => {
    const items = sortGroupedItems(groupInventoryRecords(records, { catalog }), "rarest");
    expect(items.map(({ id }) => id)).toEqual(["2", "3", "1"]);
  });

  it("merges newly selected category results without duplicating copies", () => {
    const first = groupInventoryRecords([records[0]!]);
    const second = groupInventoryRecords([
      records[0]!,
      { ...records[0]!, copy: { instanceId: "new", source: "legacy" } },
    ]);
    const merged = mergeGroupedItems(first, second);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.copies).toHaveLength(2);
  });

  it("preserves confirmed sale status across incremental merges and rejects conflicts", () => {
    const unknown = groupInventoryRecords([records[0]!]);
    const offSale = groupInventoryRecords([records[0]!], {
      catalog: new Map([[records[0]!.key, {
        key: records[0]!.key,
        id: records[0]!.id,
        itemType: "Asset",
        name: "Unknown",
        itemRestrictions: [],
        isOffSale: true,
      }]]),
    });
    const onSale = groupInventoryRecords([records[0]!], {
      catalog: new Map([[records[0]!.key, {
        key: records[0]!.key,
        id: records[0]!.id,
        itemType: "Asset",
        name: "Unknown",
        itemRestrictions: [],
        isOffSale: false,
      }]]),
    });

    expect(mergeGroupedItems(unknown, offSale)[0]?.saleStatus).toBe("offSale");
    expect(mergeGroupedItems(offSale, unknown)[0]?.saleStatus).toBe("offSale");
    expect(mergeGroupedItems(offSale, onSale)[0]?.saleStatus).toBe("unknown");
  });
});
