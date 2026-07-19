import { collectorProfileFor } from "./collector";
import { officialRobloxItemUrl } from "./endpoints";
import { linkOwnedGiftOrigins, parseGiftRewardReference, parseGiftSourceReference } from "./gifts";
import { inventoryKey } from "./normalize";
import type {
  BadgeMetadata,
  CatalogItemMetadata,
  EnrichmentData,
  FandomItemMetadata,
  FandomPurchaseMetadata,
  GroupedInventoryItem,
  InventoryCopy,
  InventoryKind,
  NormalizedInventoryRecord,
  RarityMetric,
  SaleStatus,
  WikiHistoricalPurchaseMetric,
} from "./types";

export function robloxItemUrl(kind: InventoryKind, id: string): string {
  return officialRobloxItemUrl(kind, id);
}

function limitedRestriction(metadata?: CatalogItemMetadata): boolean {
  return Boolean(
    metadata?.itemRestrictions.some((restriction) => /^(limited|limitedunique|collectible)$/i.test(restriction)) ||
      (Number.isFinite(metadata?.totalQuantity) && (metadata?.totalQuantity ?? 0) > 0),
  );
}

/**
 * Derives availability only from official catalog fields. Conflicting fields,
 * an unrecognized priceStatus, and missing metadata stay unknown.
 */
export function saleStatusFor(kind: InventoryKind, metadata?: CatalogItemMetadata): SaleStatus {
  if ((kind !== "asset" && kind !== "bundle") || !metadata) return "unknown";

  const normalizedPriceStatus = metadata.priceStatus?.trim().toLocaleLowerCase().replace(/[\s_-]+/g, "");
  const statusSaysOffSale = normalizedPriceStatus === "offsale";
  const statusSaysOnSale = normalizedPriceStatus !== undefined &&
    ["onsale", "forsale", "free"].includes(normalizedPriceStatus);
  const itemStatusSaysOnSale = metadata.itemStatus?.some(
    (status) => status.trim().toLocaleLowerCase().replace(/[\s_-]+/g, "") === "sale",
  ) ?? false;
  const flagSaysOffSale = metadata.isOffSale === true;
  const flagSaysOnSale = metadata.isOffSale === false;
  const saysOffSale = flagSaysOffSale || statusSaysOffSale;
  const saysOnSale = flagSaysOnSale || statusSaysOnSale || itemStatusSaysOnSale;

  if (saysOffSale && saysOnSale) return "unknown";
  if (saysOffSale) return "offSale";
  if (saysOnSale) return "onSale";

  // Current priced listings can omit both status fields. A positive official
  // price is accepted only when priceStatus is absent; zero and unrecognized
  // statuses remain ambiguous.
  if (
    normalizedPriceStatus === undefined &&
    metadata.isOffSale === undefined &&
    !itemStatusSaysOnSale &&
    Number.isFinite(metadata.price) &&
    (metadata.price ?? 0) > 0
  ) {
    return "onSale";
  }
  return "unknown";
}

export function rarityFor(
  kind: InventoryKind,
  id: string,
  catalog?: CatalogItemMetadata,
  badge?: BadgeMetadata,
  fandomPurchase?: FandomPurchaseMetadata,
): { isLimited: boolean; rarity: RarityMetric } {
  const sourceUrl = robloxItemUrl(kind, id);
  if (kind === "badge" && Number.isFinite(badge?.awardedCount) && (badge?.awardedCount ?? -1) >= 0) {
    return {
      isLimited: false,
      rarity: { kind: "badgeAwards", count: badge!.awardedCount!, label: "Badge awards", sourceUrl },
    };
  }

  const isLimited = (kind === "asset" || kind === "bundle") && limitedRestriction(catalog);
  if (isLimited && Number.isFinite(catalog?.totalQuantity) && (catalog?.totalQuantity ?? 0) > 0) {
    return {
      isLimited: true,
      rarity: { kind: "officialSupply", count: catalog!.totalQuantity!, label: "Official supply", sourceUrl },
    };
  }

  if (
    (kind === "asset" || kind === "bundle") &&
    Number.isFinite(fandomPurchase?.count) &&
    (fandomPurchase?.count ?? 0) > 0
  ) {
    return {
      isLimited,
      rarity: {
        kind: "wikiPurchases",
        count: fandomPurchase!.count,
        label: "Historical purchases",
        sourceUrl: fandomPurchase!.sourceUrl,
        asOf: fandomPurchase!.asOf,
      },
    };
  }

  // Catalog sales (including zero) are deliberately ignored: they are neither
  // current supply nor unique-owner counts for ordinary non-limited assets.
  return {
    isLimited,
    rarity: { kind: "unavailable", count: null, label: "Public count unavailable", sourceUrl },
  };
}

function purchaseView(fandom?: FandomItemMetadata): FandomPurchaseMetadata | undefined {
  if (!fandom || fandom.purchaseCount === undefined) return undefined;
  return {
    key: fandom.key,
    id: fandom.id,
    count: fandom.purchaseCount,
    pageTitle: fandom.pageTitle,
    sourceUrl: fandom.sourceUrl,
    asOf: fandom.purchaseAsOf,
  };
}

function wikiHistoryView(fandom?: FandomPurchaseMetadata): WikiHistoricalPurchaseMetric | undefined {
  if (!fandom || !Number.isFinite(fandom.count) || fandom.count <= 0) return undefined;
  return {
    kind: "wikiPurchases",
    count: fandom.count,
    label: "Historical purchases",
    sourceUrl: fandom.sourceUrl,
    asOf: fandom.asOf,
  };
}

function fallbackName(kind: InventoryKind, id: string): string {
  const label: Record<InventoryKind, string> = {
    asset: "Asset",
    bundle: "Bundle",
    badge: "Badge",
    gamePass: "Game pass",
    privateServer: "Private server",
  };
  return `${label[kind]} ${id}`;
}

function uniqueCopies(copies: readonly InventoryCopy[]): InventoryCopy[] {
  const byId = new Map<string, InventoryCopy>();
  for (const copy of copies) {
    const existing = byId.get(copy.instanceId);
    if (!existing || (!existing.acquiredAt && copy.acquiredAt)) byId.set(copy.instanceId, copy);
  }
  return [...byId.values()].sort((a, b) => {
    const aTime = a.acquiredAt ? Date.parse(a.acquiredAt) : Number.NaN;
    const bTime = b.acquiredAt ? Date.parse(b.acquiredAt) : Number.NaN;
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
    if (Number.isFinite(aTime)) return -1;
    if (Number.isFinite(bTime)) return 1;
    return a.instanceId.localeCompare(b.instanceId, undefined, { numeric: true });
  });
}

export function groupInventoryRecords(
  records: readonly NormalizedInventoryRecord[],
  enrichment: EnrichmentData = {},
): GroupedInventoryItem[] {
  const groupedRecords = new Map<string, NormalizedInventoryRecord[]>();
  for (const record of records) {
    const group = groupedRecords.get(record.key) ?? [];
    group.push(record);
    groupedRecords.set(record.key, group);
  }

  const items = [...groupedRecords.entries()].map(([key, group]): GroupedInventoryItem => {
    const first = group[0]!;
    const catalog = enrichment.catalog?.get(key);
    const badge = enrichment.badges?.get(key);
    const fandomItem = enrichment.fandomItems?.get(key);
    const fandomPurchase = enrichment.fandomPurchases?.get(key) ?? purchaseView(fandomItem);
    const name = catalog?.name || badge?.name || group.find(({ name }) => name)?.name || fallbackName(first.kind, first.id);
    const metric = rarityFor(first.kind, first.id, catalog, badge, fandomPurchase);
    const saleStatus = saleStatusFor(first.kind, catalog);
    const giftSource = parseGiftSourceReference(catalog?.description);
    const describedGiftReward = /\bGift\b/i.test(name)
      ? parseGiftRewardReference(catalog?.description)
      : undefined;

    return {
      key,
      kind: first.kind,
      id: first.id,
      name,
      assetType:
        group.find(({ assetType }) => typeof assetType === "string" && assetType)?.assetType ||
        (typeof catalog?.assetType === "string" ? catalog.assetType : undefined) ||
        catalog?.bundleType,
      categoryId: first.categoryId,
      copies: uniqueCopies(group.map(({ copy }) => copy)),
      creatorName: catalog?.creatorName,
      creatorType: catalog?.creatorType,
      creatorTargetId: catalog?.creatorTargetId,
      thumbnailUrl: enrichment.thumbnails?.get(key),
      isLimited: metric.isLimited,
      saleStatus,
      rarity: metric.rarity,
      wikiPurchaseHistory: wikiHistoryView(fandomPurchase),
      collector: collectorProfileFor(fandomItem, saleStatus, catalog),
      giftOrigin: giftSource ? { sourceName: giftSource.sourceName } : undefined,
      describedGiftSource: giftSource,
      describedGiftReward,
      robloxUrl: robloxItemUrl(first.kind, first.id),
    };
  });
  return linkOwnedGiftOrigins(items);
}

function metricRank(metric: RarityMetric): number {
  return metric.kind === "officialSupply" ? 3 : metric.kind === "badgeAwards" ? 2 : metric.kind === "wikiPurchases" ? 1 : 0;
}

function mergeSaleStatus(current: SaleStatus, incoming: SaleStatus): SaleStatus {
  if (current === "unknown") return incoming;
  if (incoming === "unknown") return current;
  return current === incoming ? current : "unknown";
}

function collectorConfidenceRank(confidence: NonNullable<GroupedInventoryItem["collector"]>["confidence"]): number {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function richerCollector(
  current: GroupedInventoryItem["collector"],
  incoming: GroupedInventoryItem["collector"],
): GroupedInventoryItem["collector"] {
  if (!current) return incoming;
  if (!incoming) return current;
  if (incoming.score !== current.score) return incoming.score > current.score ? incoming : current;
  return collectorConfidenceRank(incoming.confidence) > collectorConfidenceRank(current.confidence)
    ? incoming
    : current;
}

function richerWikiHistory(
  current: GroupedInventoryItem["wikiPurchaseHistory"],
  incoming: GroupedInventoryItem["wikiPurchaseHistory"],
): GroupedInventoryItem["wikiPurchaseHistory"] {
  if (!current) return incoming;
  if (!incoming) return current;
  const currentDate = current.asOf ? Date.parse(current.asOf) : Number.NaN;
  const incomingDate = incoming.asOf ? Date.parse(incoming.asOf) : Number.NaN;
  if (Number.isFinite(currentDate) && Number.isFinite(incomingDate) && currentDate !== incomingDate) {
    return incomingDate > currentDate ? incoming : current;
  }
  if (Number.isFinite(incomingDate) && !Number.isFinite(currentDate)) return incoming;
  if (Number.isFinite(currentDate) && !Number.isFinite(incomingDate)) return current;
  return incoming.count > current.count ? incoming : current;
}

export function mergeGroupedItems(
  existing: readonly GroupedInventoryItem[],
  incoming: readonly GroupedInventoryItem[],
): GroupedInventoryItem[] {
  const merged = new Map(existing.map((item) => [item.key, item]));
  for (const next of incoming) {
    const current = merged.get(next.key);
    if (!current) {
      merged.set(next.key, next);
      continue;
    }
    const richer = metricRank(next.rarity) > metricRank(current.rarity) ? next : current;
    const name = /^((Asset|Bundle|Badge|Game pass|Private server) \d+)$/.test(current.name) ? next.name : current.name;
    const saleStatus = mergeSaleStatus(current.saleStatus, next.saleStatus);
    merged.set(next.key, {
      ...current,
      ...richer,
      name,
      assetType: current.assetType || next.assetType,
      creatorName: current.creatorName || next.creatorName,
      creatorType: current.creatorType || next.creatorType,
      creatorTargetId: current.creatorTargetId || next.creatorTargetId,
      thumbnailUrl: current.thumbnailUrl || next.thumbnailUrl,
      saleStatus,
      wikiPurchaseHistory: richerWikiHistory(current.wikiPurchaseHistory, next.wikiPurchaseHistory),
      collector: saleStatus === "offSale" ? richerCollector(current.collector, next.collector) : undefined,
      giftOrigin: undefined,
      describedGiftSource: current.describedGiftSource ?? next.describedGiftSource,
      describedGiftReward: current.describedGiftReward ?? next.describedGiftReward,
      copies: uniqueCopies([...current.copies, ...next.copies]),
    });
  }
  return linkOwnedGiftOrigins([...merged.values()]);
}

export function compareRarestKnown(a: GroupedInventoryItem, b: GroupedInventoryItem): number {
  const aSupply = a.rarity.kind === "officialSupply" ? a.rarity.count : undefined;
  const bSupply = b.rarity.kind === "officialSupply" ? b.rarity.count : undefined;
  if (aSupply !== undefined && bSupply !== undefined && aSupply !== bSupply) return aSupply - bSupply;
  if (aSupply !== undefined) return -1;
  if (bSupply !== undefined) return 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}

export type ItemSort = "rarest" | "copiesMost" | "copiesFewest" | "newest" | "oldest" | "name";

function acquisitionTime(item: GroupedInventoryItem, newest: boolean): number | undefined {
  const times = item.copies
    .map(({ acquiredAt }) => (acquiredAt ? Date.parse(acquiredAt) : Number.NaN))
    .filter(Number.isFinite);
  if (!times.length) return undefined;
  return newest ? Math.max(...times) : Math.min(...times);
}

export function sortGroupedItems(items: readonly GroupedInventoryItem[], sort: ItemSort): GroupedInventoryItem[] {
  return [...items].sort((a, b) => {
    if (sort === "rarest") return compareRarestKnown(a, b);
    if (sort === "copiesMost" || sort === "copiesFewest") {
      const difference = a.copies.length - b.copies.length;
      if (difference) return sort === "copiesMost" ? -difference : difference;
    }
    if (sort === "newest" || sort === "oldest") {
      const aTime = acquisitionTime(a, sort === "newest");
      const bTime = acquisitionTime(b, sort === "newest");
      if (aTime !== undefined && bTime !== undefined && aTime !== bTime) {
        return sort === "newest" ? bTime - aTime : aTime - bTime;
      }
      if (aTime !== undefined) return -1;
      if (bTime !== undefined) return 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  });
}

/** Useful when constructing enrichment maps in callers and tests. */
export function groupedItemKey(kind: InventoryKind, id: string): string {
  return inventoryKey(kind, id);
}
