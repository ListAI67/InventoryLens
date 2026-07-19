import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import App, {
  DEFAULT_RESULT_FILTERS,
  errorMessage,
  filterAndSortItems,
  ItemCard,
  planScanSegments,
  recordSuccessfulSegment,
  summarizeConfirmedOffSale,
  type DashboardFilters,
  type SortMode,
} from "../src/App";
import GraphicBuilder from "../src/GraphicBuilder";
import { createGraphicDraft, GRAPHIC_BACKGROUND_OPTIONS } from "../src/lib/graphic-builder";
import { ScanError, type GroupedInventoryItem } from "../src/lib/types";

function makeItem(
  name: string,
  overrides: Partial<GroupedInventoryItem> = {},
): GroupedInventoryItem {
  return {
    key: `asset:${name}`,
    kind: "asset",
    id: name,
    name,
    categoryId: "accessories.head",
    copies: [{ instanceId: `${name}:1`, source: "legacy" }],
    isLimited: false,
    saleStatus: "unknown",
    rarity: {
      kind: "unavailable",
      count: null,
      label: "Public count unavailable",
    },
    robloxUrl: "https://www.roblox.com/catalog/1",
    ...overrides,
  };
}

function filters(sort: SortMode, overrides: Partial<DashboardFilters> = {}) {
  return {
    query: "",
    categoryIds: new Set(["accessories.head", "badges"]),
    onlyDuplicates: false,
    onlyOffSale: false,
    collectorOnly: false,
    creator: "all" as const,
    limited: "all" as const,
    knownSupply: false,
    sort,
    ...overrides,
  };
}

describe("dashboard inventory filtering", () => {
  it("totals only confirmed off-sale items and copies in selected categories", () => {
    const offSaleHat = makeItem("Off-sale hat", {
      saleStatus: "offSale",
      copies: [
        { instanceId: "hat:1", source: "legacy" },
        { instanceId: "hat:2", source: "legacy" },
      ],
    });
    const offSaleBadge = makeItem("Off-sale badge", {
      categoryId: "badges",
      saleStatus: "offSale",
    });
    const onSaleHat = makeItem("On-sale hat", { saleStatus: "onSale" });
    const unknownHat = makeItem("Unknown hat");

    expect(summarizeConfirmedOffSale(
      [offSaleHat, offSaleBadge, onSaleHat, unknownHat],
      new Set(["accessories.head"]),
    )).toEqual({ uniqueItems: 1, ownedCopies: 2 });
    expect(summarizeConfirmedOffSale(
      [offSaleHat, offSaleBadge, onSaleHat, unknownHat],
      new Set(["accessories.head", "badges"]),
    )).toEqual({ uniqueItems: 2, ownedCopies: 3 });
  });

  it("sorts only official supply as rarity and leaves other metrics last", () => {
    const items = [
      makeItem("Unknown"),
      makeItem("Badge", {
        kind: "badge",
        categoryId: "badges",
        rarity: {
          kind: "badgeAwards",
          count: 4,
          label: "Badge awards",
          sourceUrl: "https://badges.roblox.com",
        },
      }),
      makeItem("Wiki history", {
        rarity: {
          kind: "wikiPurchases",
          count: 1,
          label: "Historical purchases",
          sourceUrl: "https://roblox.fandom.com/wiki/Catalog:Wiki_history",
        },
      }),
      makeItem("Common limited", {
        isLimited: true,
        rarity: {
          kind: "officialSupply",
          count: 500,
          label: "Official supply",
          sourceUrl: "https://www.roblox.com/catalog/2",
        },
      }),
      makeItem("Rare limited", {
        isLimited: true,
        rarity: {
          kind: "officialSupply",
          count: 100,
          label: "Official supply",
          sourceUrl: "https://www.roblox.com/catalog/3",
        },
      }),
    ];

    expect(filterAndSortItems(items, filters("rarest")).map(({ name }) => name)).toEqual([
      "Rare limited",
      "Common limited",
      "Badge",
      "Unknown",
      "Wiki history",
    ]);
  });

  it("sorts wiki purchase history separately with non-wiki metrics last", () => {
    const lowHistory = makeItem("Low history", {
      rarity: {
        kind: "wikiPurchases",
        count: 125,
        label: "Historical purchases",
        sourceUrl: "https://roblox.fandom.com/wiki/Catalog:Low_history",
      },
    });
    const highHistory = makeItem("High history", {
      rarity: {
        kind: "wikiPurchases",
        count: 8_857,
        label: "Historical purchases",
        sourceUrl: "https://roblox.fandom.com/wiki/Catalog:High_history",
      },
    });
    const official = makeItem("Official supply", {
      rarity: {
        kind: "officialSupply",
        count: 1,
        label: "Official supply",
        sourceUrl: "https://www.roblox.com/catalog/5",
      },
    });

    expect(
      filterAndSortItems(
        [official, highHistory, lowHistory],
        filters("wikiFewest"),
      ).map(({ name }) => name),
    ).toEqual(["Low history", "High history", "Official supply"]);
  });

  it("searches linked gift names without mixing source-gift history into direct-purchase sorting", () => {
    const giftReward = makeItem("Ghost Tie", {
      giftOrigin: {
        sourceName: "Gift of the Ghastly Ghostie",
        sourceItemName: "Opened Gift of the Ghastly Ghostie",
        sourceMetric: {
          kind: "sourceGiftHistoricalPurchases",
          count: 9_534,
          label: "Source gift historical purchases",
          sourceUrl: "https://roblox.fandom.com/wiki/Catalog:Opened_Gift_of_the_Ghastly_Ghostie",
          sourceGiftName: "Opened Gift of the Ghastly Ghostie",
        },
      },
    });
    const direct = makeItem("Direct history", {
      rarity: {
        kind: "wikiPurchases",
        count: 12_000,
        label: "Historical purchases",
        sourceUrl: "https://roblox.fandom.com/wiki/Catalog:Direct_history",
      },
    });

    expect(filterAndSortItems([giftReward, direct], filters("wikiFewest")).map(({ name }) => name))
      .toEqual(["Direct history", "Ghost Tie"]);
    expect(filterAndSortItems(
      [direct, giftReward],
      filters("name", { query: "ghastly ghostie" }),
    )).toEqual([giftReward]);
  });

  it("keeps a visible source gift directly beside all of its visible rewards", () => {
    const gift = makeItem("Opened Gift of the Ghastly Ghostie", {
      key: "asset:gift",
      rarity: {
        kind: "wikiPurchases",
        count: 9_534,
        label: "Historical purchases",
        sourceUrl: "https://roblox.fandom.com/wiki/Catalog:Opened_Gift_of_the_Ghastly_Ghostie",
      },
      giftRewards: [
        {
          rewardItemKey: "asset:tie",
          rewardItemId: "tie",
          rewardItemName: "Ghost Tie",
          rewardRobloxUrl: "https://www.roblox.com/catalog/tie",
          rewardOwnedCopies: 1,
        },
        {
          rewardItemKey: "asset:specter",
          rewardItemId: "specter",
          rewardItemName: "Z Specter",
          rewardRobloxUrl: "https://www.roblox.com/catalog/specter",
          rewardOwnedCopies: 1,
        },
      ],
    });
    const giftOrigin = {
      sourceName: "Gift of the Ghastly Ghostie",
      sourceItemKey: gift.key,
      sourceItemId: gift.id,
      sourceItemName: gift.name,
      sourceRobloxUrl: gift.robloxUrl,
      sourceOwnedCopies: 1,
    };
    const ghostTie = makeItem("Ghost Tie", { key: "asset:tie", giftOrigin });
    const specter = makeItem("Z Specter", { key: "asset:specter", giftOrigin });
    const unrelated = makeItem("Middle Hat");

    expect(
      filterAndSortItems([ghostTie, unrelated, gift, specter], filters("name"))
        .map(({ name }) => name),
    ).toEqual([
      "Opened Gift of the Ghastly Ghostie",
      "Ghost Tie",
      "Z Specter",
      "Middle Hat",
    ]);
    expect(ghostTie.rarity.kind).toBe("unavailable");
    expect(gift.rarity.kind).toBe("wikiPurchases");
  });

  it("combines item search, selected categories, and duplicate filters", () => {
    const items = [
      makeItem("Sinister^2", {
        copies: [
          { instanceId: "one", source: "legacy" },
          { instanceId: "two", source: "legacy" },
        ],
      }),
      makeItem("Sinister single"),
      makeItem("Other badge", { kind: "badge", categoryId: "badges" }),
    ];

    const result = filterAndSortItems(
      items,
      filters("copiesHigh", {
        query: "sinister",
        categoryIds: new Set(["accessories.head"]),
        onlyDuplicates: true,
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Sinister^2");
    expect(result[0].copies).toHaveLength(2);
    expect(result[0].rarity.count).toBeNull();
  });

  it("includes only explicitly off-sale items when the off-sale filter is enabled", () => {
    const offSale = makeItem("Confirmed off-sale", { saleStatus: "offSale" });
    const onSale = makeItem("Still on-sale", { saleStatus: "onSale" });
    const unknown = makeItem("Status unknown", { saleStatus: "unknown" });

    const result = filterAndSortItems(
      [unknown, onSale, offSale],
      filters("name", { onlyOffSale: true }),
    );

    expect(result).toEqual([offSale]);
  });

  it("resets the off-sale toggle to its inclusive default", () => {
    expect(DEFAULT_RESULT_FILTERS.onlyOffSale).toBe(false);
  });

  it("shows every creator by default", () => {
    const official = makeItem("Official Roblox item", { creatorName: "Roblox" });
    const community = makeItem("Community item", { creatorName: "Example Creator" });
    const unknown = makeItem("Unknown creator");

    expect(DEFAULT_RESULT_FILTERS.creator).toBe("all");
    expect(
      filterAndSortItems([official, community, unknown], filters("name")),
    ).toEqual([community, official, unknown]);
  });

  it("filters Roblox-only items by Roblox's exact creator type and target ID", () => {
    const exact = makeItem("Exact Roblox", {
      creatorName: "Roblox",
      creatorType: "User",
      creatorTargetId: "1",
    });
    const normalized = makeItem("Normalized creator identity", {
      creatorName: "Roblox",
      creatorType: "  uSeR  ",
      creatorTargetId: "1",
    });
    const similarlyNamed = makeItem("Similar creator", {
      creatorName: "Roblox",
      creatorType: "User",
      creatorTargetId: "123",
    });
    const wrongType = makeItem("Group target 1", {
      creatorName: "Roblox",
      creatorType: "Group",
      creatorTargetId: "1",
    });
    const missing = makeItem("Missing creator");

    expect(
      filterAndSortItems(
        [similarlyNamed, normalized, missing, wrongType, exact],
        filters("name", { creator: "roblox" }),
      ).map(({ name }) => name),
    ).toEqual(["Exact Roblox", "Normalized creator identity"]);
  });

  it("sorts and filters estimated collector picks without changing official rarity", () => {
    const ordinary = makeItem("Ordinary");
    const notable = makeItem("Old event reward", {
      saleStatus: "offSale",
      collector: {
        score: 48,
        tier: "notable",
        confidence: "medium",
        signals: [
          { kind: "eventPrize", label: "Event reward", points: 22 },
          { kind: "age", label: "11 years old", points: 18 },
          { kind: "offSale", label: "Off sale", points: 10 },
          { kind: "historicalDistribution", label: "88,527 historical awards", points: -12 },
        ],
        sourceUrl: "https://roblox.fandom.com/wiki/Catalog:Old_event_reward",
        distributionCount: 88_527,
        distributionLabel: "Historical awards",
        note: "Estimated collector rarity — not an owner count",
      },
    });
    const rare = makeItem("In-person fedora", {
      saleStatus: "offSale",
      collector: {
        score: 72,
        tier: "rare",
        confidence: "medium",
        signals: [
          { kind: "inPersonEvent", label: "In-person event", points: 40 },
          { kind: "age", label: "13 years old", points: 20 },
          { kind: "offSale", label: "Off sale", points: 10 },
        ],
        sourceUrl: "https://roblox.fandom.com/wiki/Catalog:In-person_fedora",
        note: "Estimated collector rarity — not an owner count",
      },
    });

    expect(
      filterAndSortItems([ordinary, notable, rare], filters("collector", { collectorOnly: true }))
        .map(({ name }) => name),
    ).toEqual(["In-person fedora", "Old event reward"]);
    expect(rare.rarity.kind).toBe("unavailable");
  });

  it("renders collector evidence as an estimate rather than an owner count", () => {
    const item = makeItem("Chicago BLOXcon Black Fedora", {
      saleStatus: "offSale",
      collector: {
        score: 72,
        tier: "rare",
        confidence: "medium",
        signals: [
          { kind: "inPersonEvent", label: "In-person event", points: 40 },
          { kind: "age", label: "13 years old", points: 20 },
        ],
        sourceUrl: "https://roblox.fandom.com/wiki/Catalog:Chicago_BLOXcon_Black_Fedora",
        note: "Estimated collector rarity — not an owner count",
      },
    });

    const markup = renderToStaticMarkup(<ItemCard categoryLabel="Head" item={item} />);
    expect(markup).toContain("Collector Rare");
    expect(markup).toContain("Collector rating");
    expect(markup).toContain("72");
    expect(markup).toContain("In-person event");
    expect(markup).toContain("Estimated collector rarity — not an owner count");
    expect(markup).toContain("Public count unavailable");
  });

  it("shows an off-sale badge only for items with confirmed off-sale status", () => {
    const offSaleMarkup = renderToStaticMarkup(
      <ItemCard
        categoryLabel="Head"
        item={makeItem("Confirmed", { saleStatus: "offSale" })}
      />,
    );
    const unknownMarkup = renderToStaticMarkup(
      <ItemCard categoryLabel="Head" item={makeItem("Unknown")} />,
    );

    expect(offSaleMarkup).toContain("Off sale");
    expect(unknownMarkup).not.toContain("Off sale");
  });

  it("keeps unknown acquisition dates last in both date directions", () => {
    const known = makeItem("Known", {
      copies: [
        {
          instanceId: "known",
          source: "legacy",
          acquiredAt: "2025-01-02T00:00:00Z",
        },
      ],
    });
    const unknown = makeItem("Unknown");

    expect(filterAndSortItems([unknown, known], filters("newest"))[0].name).toBe("Known");
    expect(filterAndSortItems([unknown, known], filters("oldest"))[0].name).toBe("Known");
  });

  it("filters known supply without treating badge awards or wiki purchases as supply", () => {
    const supply = makeItem("Supply", {
      rarity: {
        kind: "officialSupply",
        count: 25,
        label: "Official supply",
        sourceUrl: "https://www.roblox.com/catalog/4",
      },
    });
    const badge = makeItem("Badge", {
      kind: "badge",
      categoryId: "badges",
      rarity: {
        kind: "badgeAwards",
        count: 2,
        label: "Badge awards",
        sourceUrl: "https://badges.roblox.com",
      },
    });
    const wiki = makeItem("Wiki", {
      rarity: {
        kind: "wikiPurchases",
        count: 10,
        label: "Historical purchases",
        sourceUrl: "https://roblox.fandom.com/wiki/Catalog:Wiki",
      },
    });

    expect(
      filterAndSortItems([badge, wiki, supply], filters("rarest", { knownSupply: true })),
    ).toEqual([supply]);
  });

  it("renders a sourced wiki purchase metric without a standalone wiki search action", () => {
    const item = makeItem("Sinister^2", {
      rarity: {
        kind: "wikiPurchases",
        count: 8_857,
        label: "Historical purchases",
        sourceUrl: "https://roblox.fandom.com/wiki/Catalog:Sinister%5E2",
        asOf: "November 16, 2023",
      },
    });

    const markup = renderToStaticMarkup(
      <ItemCard categoryLabel="Head" item={item} />,
    );

    expect(markup).toContain("Wiki purchases");
    expect(markup).toContain("8,857");
    expect(markup).toContain("Reported as of November 16, 2023; not current unique owners.");
    expect(markup).toContain("Catalog:Sinister%5E2");
    expect(markup).not.toContain("Wiki search");
  });

  it("renders a gift reward with its linked source-gift purchase history", () => {
    const item = makeItem("Ghost Tie", {
      saleStatus: "offSale",
      giftOrigin: {
        sourceName: "Gift of the Ghastly Ghostie",
        sourceItemKey: "asset:94108159",
        sourceItemId: "94108159",
        sourceItemName: "Opened Gift of the Ghastly Ghostie",
        sourceRobloxUrl: "https://www.roblox.com/catalog/94108159",
        sourceOwnedCopies: 1,
        sourceMetric: {
          kind: "sourceGiftHistoricalPurchases",
          count: 9_534,
          label: "Source gift historical purchases",
          sourceUrl: "https://roblox.fandom.com/wiki/Catalog:Opened_Gift_of_the_Ghastly_Ghostie",
          sourceGiftName: "Opened Gift of the Ghastly Ghostie",
          asOf: "October 28, 2019",
        },
      },
    });

    const markup = renderToStaticMarkup(<ItemCard categoryLabel="Neck" item={item} />);
    expect(markup).toContain("Gift reward");
    expect(markup).toContain("Came from");
    expect(markup).toContain("Opened Gift of the Ghastly Ghostie");
    expect(markup).toContain("You own ×1 of the source gift");
    expect(markup).toContain("Source gift purchases");
    expect(markup).toContain("9,534");
    expect(markup).toContain("release basis only, not a direct reward count or current copies/owners");
    expect(markup).toContain("Random, multi-item, free, or separate releases may differ");
    expect(markup).not.toContain("Public count unavailable");
  });

  it("still labels a gift reward when its source purchase history is unavailable", () => {
    const item = makeItem("Mystery reward", {
      giftOrigin: { sourceName: "Gift of Mystery" },
    });
    const markup = renderToStaticMarkup(<ItemCard categoryLabel="Head" item={item} />);
    expect(markup).toContain("Gift reward");
    expect(markup).toContain("Gift of Mystery");
    expect(markup).toContain("Public count unavailable");
  });

  it("shows the owned reward on its linked source gift card", () => {
    const gift = makeItem("Opened Gift of the Ghastly Ghostie", {
      giftRewards: [{
        rewardItemKey: "asset:94260278",
        rewardItemId: "94260278",
        rewardItemName: "Ghost Tie",
        rewardRobloxUrl: "https://www.roblox.com/catalog/94260278",
        rewardOwnedCopies: 1,
      }],
    });

    const markup = renderToStaticMarkup(<ItemCard categoryLabel="Head" item={gift} />);
    expect(markup).toContain("Gift contents");
    expect(markup).toContain("Revealed");
    expect(markup).toContain("Ghost Tie");
    expect(markup).toContain("You own ×1 of this reward");
    expect(filterAndSortItems([gift], filters("name", { query: "ghost tie" }))).toEqual([gift]);
  });
});

describe("dashboard scan orchestration", () => {
  it("keeps the broad public inventory in one stage and isolates optional adapters", () => {
    const selected = [
      "accessories.head",
      "accessories.face",
      "meshes",
      "passes",
      "bundles",
      "makeup.face",
      "badges",
      "privateServers",
    ];
    const segments = planScanSegments(selected);

    expect(segments.map(({ id }) => id)).toEqual([
      "inventory",
      "bundles",
      "makeup",
      "badges",
      "privateServers",
    ]);
    expect(segments[0].categoryIds).toEqual([
      "accessories.head",
      "accessories.face",
      "meshes",
      "passes",
    ]);
    expect(segments.flatMap(({ categoryIds }) => categoryIds).sort()).toEqual(
      [...selected].sort(),
    );
  });

  it("marks category coverage only after a segment succeeds", () => {
    const original = new Set(["accessories.head"]);
    const afterFailure = recordSuccessfulSegment(original, ["badges"], false);
    const afterSuccess = recordSuccessfulSegment(afterFailure, ["bundles"], true);

    expect([...afterFailure]).toEqual(["accessories.head"]);
    expect([...afterSuccess]).toEqual(["accessories.head", "bundles"]);
    expect([...original]).toEqual(["accessories.head"]);
  });

  it("explains Roblox's explicit private-inventory result without suggesting a key", () => {
    const message = errorMessage(
      new ScanError("privateInventory", "This inventory is private.", 403),
    );

    expect(message).toContain("reports that this player's inventory is private");
    expect(message).toContain("cannot be scanned publicly");
    expect(message.toLocaleLowerCase()).not.toContain("api key");
    expect(message).not.toBe("This inventory is private.");
  });

  it("explains a generic permission denial without claiming visibility or calling it private", () => {
    const message = errorMessage(
      new ScanError("permissionDenied", "Roblox denied this request.", 403),
    );

    expect(message).toContain("denied an anonymous public inventory request");
    expect(message).not.toContain("inventory is viewable");
    expect(message.toLocaleLowerCase()).not.toContain("inventory is private");
  });

  it("describes persistent rate limits as retrying unfinished work", () => {
    const message = errorMessage(
      new ScanError("rateLimited", "Roblox is rate limiting this scan.", 429),
    );

    expect(message).toContain("Completed stages are saved");
    expect(message).toContain("unfinished categories");
  });
});

describe("dashboard public access guidance", () => {
  it("states the no-login fact once without an API-key setup flow", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("Public inventory scans run without a login or API key.");
    expect(markup.match(/without a login or API key/g)).toHaveLength(1);
    expect(markup).toContain("No inventory loaded");
    expect(markup).not.toContain("Test &amp; save key");
    expect(markup).not.toContain("Forget key");
    expect(markup).not.toContain("Roblox API key");
    expect(markup).not.toContain('type="password"');
  });

  it("exposes the inventory and Graphic Builder pages without a second extension entry point", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('aria-label="Dashboard pages"');
    expect(markup).toContain(">Inventory</button>");
    expect(markup).toContain(">Graphic Builder</button>");
    expect(markup).toContain('aria-current="page"');
  });
});

describe("Graphic Builder player identity control", () => {
  const user = { id: "1", name: "SamplePlayer", displayName: "Sample Player", hasVerifiedBadge: false };
  const setDraft = () => undefined;

  it("shows the avatar identity by default and exposes a clearly scoped toggle", () => {
    const markup = renderToStaticMarkup(
      <GraphicBuilder draft={createGraphicDraft()} items={[]} onBack={() => undefined} setDraft={setDraft} user={user} />,
    );

    expect(markup).toContain("Show display name and @username beneath avatar");
    expect(markup).toContain('aria-label="Collection graphic preview for Sample Player"');
    expect(markup).toContain('type="checkbox" checked=""');
  });

  it("uses a name-free canvas accessibility label when avatar identity is hidden", () => {
    const markup = renderToStaticMarkup(
      <GraphicBuilder
        draft={createGraphicDraft({ showPlayerIdentity: false })}
        items={[]}
        onBack={() => undefined}
        setDraft={setDraft}
        user={user}
      />,
    );

    expect(markup).toContain('aria-label="Collection graphic preview"');
    expect(markup).not.toContain("Collection graphic preview for Sample Player");
  });
});

describe("Graphic Builder background controls", () => {
  const user = { id: "1", name: "SamplePlayer", displayName: "Sample Player", hasVerifiedBadge: false };
  const setDraft = () => undefined;

  it("offers every bundled background and reflects the saved selection", () => {
    const markup = renderToStaticMarkup(
      <GraphicBuilder
        draft={createGraphicDraft({ backgroundPreset: "royalPurple" })}
        items={[]}
        onBack={() => undefined}
        setDraft={setDraft}
        user={user}
      />,
    );

    expect(markup).toContain('aria-label="Graphic background"');
    for (const { id, label } of GRAPHIC_BACKGROUND_OPTIONS) {
      expect(markup).toContain(`value="${id}"`);
      expect(markup).toContain(`>${label}</option>`);
    }
    expect(markup).toContain('<option value="royalPurple" selected="">Royal Purple</option>');
  });
});

describe("Graphic Builder bottom-bar controls", () => {
  const user = { id: "1", name: "SamplePlayer", displayName: "Sample Player", hasVerifiedBadge: false };
  const setDraft = () => undefined;

  it("makes both the custom footer value and its former CUSTOM TEXT label editable", () => {
    const markup = renderToStaticMarkup(
      <GraphicBuilder
        draft={createGraphicDraft({ footer: "SERIOUS OFFERS", footerLabel: "TRADE NOTES" })}
        items={[]}
        onBack={() => undefined}
        setDraft={setDraft}
        user={user}
      />,
    );

    expect(markup).toContain("Bottom bar");
    expect(markup).toContain("Choose what appears");
    expect(markup).toContain("Custom text");
    expect(markup).toContain('aria-label="Custom text value"');
    expect(markup).toContain('value="SERIOUS OFFERS"');
    expect(markup).toContain('aria-label="Custom text label"');
    expect(markup).toContain('value="TRADE NOTES"');
    expect(markup).toContain("Off-sale total");
    expect(markup).toContain('aria-label="Off-sale total source"');
    expect(markup).toContain("Selected items in graphic");
    expect(markup).toContain("Owned copies in graphic");
  });

  it("shows selected-category totals and clearly scopes currency as display-only text", () => {
    const markup = renderToStaticMarkup(
      <GraphicBuilder
        draft={createGraphicDraft({
          showFooterCurrency: true,
          footerCurrencyKind: "crypto",
          footerCurrencyValue: "BTC / ETH / USDC",
        })}
        items={[]}
        offSaleSummary={{ uniqueItems: 140, ownedCopies: 156, complete: false }}
        onBack={() => undefined}
        setDraft={setDraft}
        user={user}
      />,
    );

    expect(markup).toContain("140 off-sale items");
    expect(markup).toContain("156 copies in the categories selected on the Inventory page");
    expect(markup).toContain("Some selected categories are not loaded yet");
    expect(markup).toContain("Currency accepted");
    expect(markup).toContain('aria-label="Accepted currency type"');
    expect(markup).toContain('aria-label="Accepted currency value"');
    expect(markup).toContain('value="BTC / ETH / USDC"');
    expect(markup).toContain("Display text only. Inventory Lens does not process payments.");
  });

  it("exposes a manual off-sale field when the user chooses a custom total", () => {
    const markup = renderToStaticMarkup(
      <GraphicBuilder
        draft={createGraphicDraft({ footerOffSaleMetric: "manual", footerManualOffSaleCount: "222" })}
        items={[]}
        onBack={() => undefined}
        setDraft={setDraft}
        user={user}
      />,
    );

    expect(markup).toContain('aria-label="Manual off-sale count"');
    expect(markup).toContain('value="222"');
  });
});
