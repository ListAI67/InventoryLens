import { officialRobloxItemUrl } from "./endpoints";
import type {
  CatalogItemMetadata,
  CollectorProfile,
  CollectorSignal,
  FandomAcquisitionKind,
  FandomItemMetadata,
  SaleStatus,
} from "./types";
import { parseGiftSourceReference } from "./gifts";

const ACQUISITION_SIGNALS: Record<FandomAcquisitionKind, Omit<CollectorSignal, "kind">> = {
  inPersonEvent: { label: "In-person event exclusive", points: 40 },
  selectUsers: { label: "Awarded to select users", points: 40 },
  contestPrize: { label: "Contest prize", points: 32 },
  eventPrize: { label: "Event or game prize", points: 22 },
  promoCode: { label: "Code or merchandise promotion", points: 16 },
  giveaway: { label: "Limited-time giveaway", points: 14 },
};

function ageInWholeYears(publishedAt: string, now: number): number | undefined {
  const published = new Date(publishedAt);
  const current = new Date(now);
  if (!Number.isFinite(published.getTime()) || !Number.isFinite(current.getTime()) || published.getTime() > now) {
    return undefined;
  }
  let age = current.getUTCFullYear() - published.getUTCFullYear();
  if (
    current.getUTCMonth() < published.getUTCMonth() ||
    (current.getUTCMonth() === published.getUTCMonth() && current.getUTCDate() < published.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

function ageSignal(age: number): CollectorSignal | undefined {
  const points = age >= 12 ? 20 : age >= 10 ? 18 : age >= 7 ? 13 : age >= 4 ? 8 : 0;
  return points > 0 ? { kind: "age", label: `${age} years old`, points } : undefined;
}

function favoritesSignal(count: number): CollectorSignal | undefined {
  const points = count >= 100_000 ? 15
    : count >= 25_000 ? 13
      : count >= 10_000 ? 11
        : count >= 2_500 ? 8
          : count >= 500 ? 5
            : count >= 100 ? 2
              : 0;
  return points > 0
    ? { kind: "favorites", label: `${count.toLocaleString("en-US")} favorites`, points }
    : undefined;
}

function distributionSignal(count: number, label: string): CollectorSignal {
  const points = count <= 10 ? 30
    : count <= 100 ? 28
      : count <= 1_000 ? 24
        : count <= 3_000 ? 20
          : count <= 10_000 ? 14
            : count <= 50_000 ? 6
              : count <= 75_000 ? 0
                : -12;
  const context = points < 0 ? "; broadly distributed" : "";
  return {
    kind: "historicalDistribution",
    label: `${count.toLocaleString("en-US")} historical ${label}${context}`,
    points,
  };
}

/**
 * Estimates collector significance from typed item history. It deliberately
 * does not turn favorites, age, or historical awards into owner count/supply.
 * `now` is injectable so scoring and tests remain deterministic over time.
 */
export function collectorProfileFor(
  fandom: FandomItemMetadata | undefined,
  saleStatus: SaleStatus,
  catalog?: CatalogItemMetadata,
  now = Date.now(),
): CollectorProfile | undefined {
  // The product's collector view is intentionally restricted to confirmed
  // off-sale items. Unknown availability is not evidence that an item ended.
  if (saleStatus !== "offSale" || (!fandom && !catalog)) return undefined;

  const acquisitionKinds = fandom?.acquisitionKinds ?? [];
  const giftSource = parseGiftSourceReference(catalog?.description);
  const acquisitionSignals: CollectorSignal[] = acquisitionKinds
    .map((kind): CollectorSignal => ({ kind, ...ACQUISITION_SIGNALS[kind] }))
  if (giftSource) {
    acquisitionSignals.push({ kind: "giftReward", label: `Reward from ${giftSource.sourceName}`, points: 24 });
  }
  const strongestAcquisition = acquisitionSignals.sort((a, b) => b.points - a.points)[0];
  const signals: CollectorSignal[] = strongestAcquisition ? [strongestAcquisition] : [];

  const publishedAt = fandom?.publishedAt ?? catalog?.createdAt;
  const age = publishedAt ? ageInWholeYears(publishedAt, now) : undefined;
  const oldItem = age === undefined ? undefined : ageSignal(age);
  if (oldItem) signals.push(oldItem);

  if (saleStatus === "offSale") {
    signals.push({ kind: "offSale", label: "Off sale", points: 10 });
  }

  const hasOfficialFavorites = Number.isFinite(catalog?.favoriteCount) && (catalog?.favoriteCount ?? -1) >= 0;
  const favoriteCount = hasOfficialFavorites ? catalog!.favoriteCount : fandom?.favoriteCount;
  if (Number.isFinite(favoriteCount) && (favoriteCount ?? -1) >= 0) {
    const favorites = favoritesSignal(favoriteCount!);
    if (favorites) signals.push(favorites);
  }

  if (Number.isFinite(fandom?.distributionCount) && (fandom?.distributionCount ?? 0) > 0) {
    signals.push(distributionSignal(fandom!.distributionCount!, fandom!.distributionLabel || "awards"));
  }

  const score = Math.max(0, Math.min(100, signals.reduce((total, signal) => total + signal.points, 0)));
  // Age, off-sale status, and favorites can make an item interesting, but do
  // not establish restricted acquisition by themselves. Collector picks need
  // explicit acquisition history or a genuinely small historical distribution.
  const hasRestrictedAcquisition = strongestAcquisition !== undefined;
  const hasSmallHistoricalDistribution = fandom?.distributionCount !== undefined && fandom.distributionCount <= 10_000;
  const qualifiesAsPick = hasRestrictedAcquisition || hasSmallHistoricalDistribution;
  const tier: CollectorProfile["tier"] = !qualifiesAsPick ? "none"
    : score >= 80 ? "exceptional"
      : score >= 60 ? "rare"
        : score >= 35 ? "notable"
          : "none";
  const hasAcquisitionEvidence = acquisitionKinds.length > 0 || giftSource !== undefined;
  const confidence: CollectorProfile["confidence"] = hasAcquisitionEvidence && fandom?.distributionCount !== undefined
    ? "high"
    : hasAcquisitionEvidence || (publishedAt !== undefined && favoriteCount !== undefined)
      ? "medium"
      : "low";

  const sourceUrl = fandom?.sourceUrl ?? officialRobloxItemUrl(
    catalog!.itemType === "Asset" ? "asset" : "bundle",
    catalog!.id,
  );

  return {
    score,
    tier,
    confidence,
    signals,
    sourceUrl,
    favoriteCount,
    favoriteAsOf: hasOfficialFavorites ? undefined : fandom?.favoriteAsOf,
    favoriteSource: hasOfficialFavorites ? "Roblox" : favoriteCount !== undefined ? "Roblox Wiki" : undefined,
    distributionCount: fandom?.distributionCount,
    distributionLabel: fandom?.distributionLabel,
    distributionAsOf: fandom?.distributionAsOf,
    publishedAt,
    note: "Estimated collector rarity — not an owner count",
  };
}
