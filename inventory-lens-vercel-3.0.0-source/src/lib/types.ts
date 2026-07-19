export type InventoryKind =
  | "asset"
  | "bundle"
  | "badge"
  | "gamePass"
  | "privateServer";

export type CopySource = "legacy" | "bundle" | "places";

/** Official catalog availability. Unknown is intentionally not treated as on-sale. */
export type SaleStatus = "offSale" | "onSale" | "unknown";

/** Evidence used by the opt-in collector estimate. None of these is supply. */
export type CollectorSignalKind =
  | "inPersonEvent"
  | "eventPrize"
  | "selectUsers"
  | "contestPrize"
  | "promoCode"
  | "giveaway"
  | "giftReward"
  | "age"
  | "offSale"
  | "favorites"
  | "historicalDistribution";

export interface CollectorSignal {
  kind: CollectorSignalKind;
  label: string;
  /** Signed contribution to the deterministic 0-100 estimate. */
  points: number;
}

export interface CollectorProfile {
  score: number;
  tier: "exceptional" | "rare" | "notable" | "none";
  confidence: "high" | "medium" | "low";
  signals: CollectorSignal[];
  sourceUrl: string;
  favoriteCount?: number;
  favoriteAsOf?: string;
  favoriteSource?: "Roblox" | "Roblox Wiki";
  /** Historical awards/redemptions, never current owners or official supply. */
  distributionCount?: number;
  distributionLabel?: string;
  distributionAsOf?: string;
  publishedAt?: string;
  note: "Estimated collector rarity — not an owner count";
}

export interface InventoryCopy {
  /** Roblox's instance ID (or the legacy userAssetId) for this exact copy. */
  instanceId: string;
  acquiredAt?: string;
  serialNumber?: number;
  source: CopySource;
}

export interface WikiHistoricalPurchaseMetric {
  kind: "wikiPurchases";
  count: number;
  /** Historical purchase events reported by Roblox Wiki, not owners or supply. */
  label: "Historical purchases";
  sourceUrl: string;
  /** Date attached to the wiki statement, when the article supplies one. */
  asOf?: string;
}

export interface SourceGiftHistoricalPurchaseMetric {
  kind: "sourceGiftHistoricalPurchases";
  count: number;
  label: "Source gift historical purchases";
  sourceUrl: string;
  sourceGiftName: string;
  asOf?: string;
}

/** A relationship stated by the reward's official Roblox description. */
export interface GiftOriginMetadata {
  /** Gift title as written in the reward description. */
  sourceName: string;
  /** Populated only when the source gift is also present in this scan. */
  sourceItemKey?: string;
  sourceItemId?: string;
  sourceItemName?: string;
  sourceRobloxUrl?: string;
  sourceOwnedCopies?: number;
  /** Historical purchases of the source gift, never reward supply or owners. */
  sourceMetric?: SourceGiftHistoricalPurchaseMetric;
}

/** Reverse owned-inventory relationship shown on a source gift item. */
export interface GiftRewardLinkMetadata {
  rewardItemKey: string;
  rewardItemId: string;
  rewardItemName: string;
  rewardRobloxUrl: string;
  rewardOwnedCopies: number;
}

/** Named source gift explicitly stated by a reward's official description. */
export interface GiftSourceReference {
  sourceName: string;
  evidence: "officialDescription";
}

/** Single reward name explicitly stated by a source gift description. */
export interface GiftRewardReference {
  rewardName: string;
  evidence: "officialDescription";
}

export type RarityMetric =
  | {
      kind: "officialSupply";
      count: number;
      label: "Official supply";
      sourceUrl: string;
    }
  | {
      kind: "badgeAwards";
      count: number;
      label: "Badge awards";
      sourceUrl: string;
    }
  | WikiHistoricalPurchaseMetric
  | {
      kind: "unavailable";
      count: null;
      label: "Public count unavailable";
      sourceUrl?: string;
    };

export interface NormalizedInventoryRecord {
  /** Stable grouping key. IDs can collide between Roblox item kinds. */
  key: string;
  kind: InventoryKind;
  id: string;
  name?: string;
  assetType?: string;
  categoryId: string;
  copy: InventoryCopy;
}

export interface GroupedInventoryItem {
  key: string;
  kind: InventoryKind;
  id: string;
  name: string;
  assetType?: string;
  categoryId: string;
  copies: InventoryCopy[];
  creatorName?: string;
  creatorType?: string;
  creatorTargetId?: string;
  thumbnailUrl?: string;
  isLimited: boolean;
  saleStatus: SaleStatus;
  rarity: RarityMetric;
  /** Direct wiki history retained even when official supply wins as rarity. */
  wikiPurchaseHistory?: WikiHistoricalPurchaseMetric;
  /** Historical/significance estimate kept separate from official rarity. */
  collector?: CollectorProfile;
  /** Officially described source gift and, when owned, its linked history. */
  giftOrigin?: GiftOriginMetadata;
  /** Raw reward-side description evidence used to recompute giftOrigin. */
  describedGiftSource?: GiftSourceReference;
  /** Owned rewards whose official descriptions point back to this gift. */
  giftRewards?: GiftRewardLinkMetadata[];
  /** Conservative source-side description evidence used during reconciliation. */
  describedGiftReward?: GiftRewardReference;
  robloxUrl: string;
}

export type CategorySpecial =
  | "badges"
  | "gamePasses"
  | "privateServers"
  | "bundles";

export interface CategoryOption {
  /** Leaf identifier used by scans and UI selection state. */
  id: string;
  /** Top-level menu name, matching the Roblox inventory navigation. */
  group: string;
  label: string;
  assetTypes?: readonly string[];
  legacyAssetTypeIds?: readonly number[];
  special?: CategorySpecial;
  avatar: boolean;
  classicClothing?: boolean;
}

export interface ScanSelection {
  categoryIds: string[];
}

export interface ResolvedUser {
  id: string;
  name: string;
  displayName: string;
  hasVerifiedBadge: boolean;
  thumbnailUrl?: string;
}

export type ScanPhase =
  | "idle"
  | "resolving"
  | "inventory"
  | "metadata"
  | "done";

export interface ScanProgress {
  phase: ScanPhase;
  pages: number;
  records: number;
  message: string;
  /** Present at resumable boundaries such as a page or metadata batch. */
  checkpoint?: {
    source: "assets" | "places" | "bundles" | "metadata";
    pageToken?: string;
    assetTypeId?: number;
  };
}

export interface ScanCoverage {
  /** Requested categories whose public adapters completed. */
  scannedCategoryIds: string[];
  /** Publicly supported categories that returned only partial coverage. */
  partialCategoryIds: string[];
  /** Public categories Roblox explicitly refused to expose anonymously. */
  deniedCategoryIds: string[];
  /** Categories that cannot be enumerated by Roblox without authentication. */
  unsupportedCategoryIds: string[];
}

export type ScanErrorCode =
  | "invalidInput"
  | "permissionDenied"
  | "privateInventory"
  | "notFound"
  | "rateLimited"
  | "cancelled"
  | "network"
  | "unknown";

export class ScanError extends Error {
  constructor(
    public readonly code: ScanErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ScanError";
  }
}

export interface CatalogItemMetadata {
  key: string;
  id: string;
  itemType: "Asset" | "Bundle";
  name: string;
  assetType?: string | number;
  bundleType?: string;
  creatorName?: string;
  creatorType?: string;
  creatorTargetId?: string;
  itemStatus?: string[];
  itemRestrictions: string[];
  collectibleItemId?: string;
  totalQuantity?: number;
  /** Current public catalog price when Roblox supplies it. */
  price?: number;
  /** Roblox currently emits values such as "Off Sale" and "Free". */
  priceStatus?: string;
  /** Strongest official availability signal when present. */
  isOffSale?: boolean;
  /** Informational only. It is never treated as supply or unique ownership. */
  sales?: number;
  /** Current public favorite count returned in the catalog details batch. */
  favoriteCount?: number;
  /** Official catalog creation timestamp, used only as an age signal. */
  createdAt?: string;
  /** Official public item description. It may state a gift/reward relationship. */
  description?: string;
}

export interface BadgeMetadata {
  id: string;
  name: string;
  awardedCount?: number;
  iconImageId?: string;
}

export type FandomAcquisitionKind =
  | "inPersonEvent"
  | "eventPrize"
  | "selectUsers"
  | "contestPrize"
  | "promoCode"
  | "giveaway";

/**
 * ID-validated, community-maintained item history from Roblox Wiki. Counts
 * remain typed by what the article actually says; they are never owner count.
 */
export interface FandomItemMetadata {
  key: string;
  id: string;
  pageTitle: string;
  sourceUrl: string;
  purchaseCount?: number;
  purchaseAsOf?: string;
  favoriteCount?: number;
  favoriteAsOf?: string;
  distributionCount?: number;
  distributionLabel?: string;
  distributionAsOf?: string;
  publishedAt?: string;
  acquisitionKinds: FandomAcquisitionKind[];
}

/** Backward-compatible narrow view used by purchase-rarity callers/tests. */
export interface FandomPurchaseMetadata {
  key: string;
  id: string;
  count: number;
  pageTitle: string;
  sourceUrl: string;
  asOf?: string;
}

export interface EnrichmentData {
  catalog?: ReadonlyMap<string, CatalogItemMetadata>;
  badges?: ReadonlyMap<string, BadgeMetadata>;
  fandomItems?: ReadonlyMap<string, FandomItemMetadata>;
  /** @deprecated Use fandomItems. Accepted while older callers migrate. */
  fandomPurchases?: ReadonlyMap<string, FandomPurchaseMetadata>;
  thumbnails?: ReadonlyMap<string, string>;
}
