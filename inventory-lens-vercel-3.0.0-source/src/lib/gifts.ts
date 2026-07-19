import type {
  GiftOriginMetadata,
  GiftRewardReference,
  GiftRewardLinkMetadata,
  GiftSourceReference,
  GroupedInventoryItem,
  SourceGiftHistoricalPurchaseMetric,
  WikiHistoricalPurchaseMetric,
} from "./types";

const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sep\\.?|Sept\\.?|Oct\\.?|Nov\\.?|Dec\\.?)";

function cleanCapturedSource(value: string): string | undefined {
  let source = value
    .replace(/^[\s'"`]+|[\s'"`]+$/g, "")
    .replace(new RegExp(`\\s+on\\s+${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s*|\\s+)\\d{4}\\b.*$`, "i"), "")
    .replace(/\s+/g, " ")
    .replace(/\s*[,;:]\s*$/, "")
    .trim();
  if (/^the\s+Gift\b/.test(source)) source = source.replace(/^the\s+/i, "");

  // Gift names are proper item titles in Roblox descriptions. Requiring the
  // capitalized token rejects prose such as "came out of the gift shop".
  if (source.length < 6 || source.length > 120 || !/\bGift\b/.test(source)) return undefined;
  if (source.split(/\s+/).length < 2 || /^(?:Opened\s+)?Gift$/i.test(source)) return undefined;
  if (/^(?:a|the|this)\s+Gift$/i.test(source)) return undefined;
  if (!/\bGift\s+of\b/.test(source) && !/\bGift$/.test(source)) return undefined;
  return source;
}

/**
 * Extracts only explicit source relationships from Roblox's own description.
 * A casual mention of a gift, a gift shop, or an item being given as a gift
 * is deliberately insufficient.
 */
export function parseGiftSourceReference(description?: string): GiftSourceReference | undefined {
  if (!description) return undefined;
  const normalized = description
    .replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.(?=\s+\d)/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const patterns = [
    /\bThis item\s+(?:came|comes)\s+out of\s+(?:the\s+)?(.+?)(?=[.!?]|$)/i,
    /\bThis item\s+(?:came|comes)\s+from(?:\s+out of)?\s+(?:the\s+)?(.+?)(?=[.!?]|$)/i,
    /\bThis item\s+was\s+(?:inside|contained in)\s+(?:the\s+)?(.+?)(?=[.!?]|$)/i,
    /\bThis item\s+was\s+(?:awarded|given)\s+to\s+(?:the\s+)?owners?\s+of\s+(?:the\s+)?(.+?)(?=[.!?]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    const sourceName = match?.[1] ? cleanCapturedSource(match[1]) : undefined;
    if (sourceName) return { sourceName, evidence: "officialDescription" };
  }
  return undefined;
}

/** Strict source-side grammar used by classic opened-gift descriptions. */
export function parseGiftRewardReference(description?: string): GiftRewardReference | undefined {
  if (!description) return undefined;
  const normalized = description.replace(/\s+/g, " ").trim();
  const match = /^Inside you find\s*(?:\.{3}|\u2026)\s+(?:the\s+)?([^.!?]+)!$/i.exec(normalized);
  const rewardName = match?.[1]?.replace(/\s+/g, " ").trim();
  if (!rewardName || rewardName.length > 100 || !/^[A-Z0-9]/.test(rewardName)) return undefined;
  if (/[,;:/&]|\b(?:and|or)\b/i.test(rewardName)) return undefined;
  if (/^(?:a\s+|an\s+)?(?:item|prize|surprise|something(?:\s+special)?)$/i.test(rewardName)) return undefined;
  return { rewardName, evidence: "officialDescription" };
}

/** Canonical matching only; the original display names are never replaced. */
export function normalizeGiftLinkName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(?:the\s+)?opened\s+/, "")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ");
}

function directWikiHistory(item: GroupedInventoryItem): WikiHistoricalPurchaseMetric | undefined {
  if (item.wikiPurchaseHistory) return item.wikiPurchaseHistory;
  return item.rarity.kind === "wikiPurchases" ? item.rarity : undefined;
}

function sourceMetricFor(
  source: GroupedInventoryItem,
  history: WikiHistoricalPurchaseMetric,
): SourceGiftHistoricalPurchaseMetric {
  return {
    kind: "sourceGiftHistoricalPurchases",
    count: history.count,
    label: "Source gift historical purchases",
    sourceUrl: history.sourceUrl,
    sourceGiftName: source.name,
    asOf: history.asOf,
  };
}

/**
 * Links rewards after every grouping/merge pass, so a source gift discovered
 * before or after its reward produces the same relationship.
 */
export function linkOwnedGiftOrigins(items: readonly GroupedInventoryItem[]): GroupedInventoryItem[] {
  const byName = new Map<string, GroupedInventoryItem[]>();
  for (const item of items) {
    const name = normalizeGiftLinkName(item.name);
    if (!name) continue;
    const matches = byName.get(name) ?? [];
    matches.push(item);
    byName.set(name, matches);
  }

  let linked = items.map((item): GroupedInventoryItem => {
    // giftOrigin and giftRewards are derived views. Clear them on every pass
    // and rebuild only from the raw official-description evidence fields.
    const withoutDerivedLinks = { ...item, giftOrigin: undefined, giftRewards: undefined };
    const describedSource = item.describedGiftSource;
    if (!describedSource) return withoutDerivedLinks;
    const normalizedSource = normalizeGiftLinkName(describedSource.sourceName);
    const candidates = (byName.get(normalizedSource) ?? [])
      .filter((candidate) => candidate.key !== item.key);
    // A normalized display name is not a durable Roblox identity. Refuse to
    // guess when two different owned assets normalize to the same gift name.
    const source = candidates.length === 1 ? candidates[0] : undefined;
    const base: GiftOriginMetadata = { sourceName: describedSource.sourceName };
    if (!source) return { ...withoutDerivedLinks, giftOrigin: base };

    const history = directWikiHistory(source);
    return {
      ...withoutDerivedLinks,
      giftOrigin: {
        ...base,
        sourceItemKey: source.key,
        sourceItemId: source.id,
        sourceItemName: source.name,
        sourceRobloxUrl: source.robloxUrl,
        sourceOwnedCopies: source.copies.length,
        sourceMetric: history ? sourceMetricFor(source, history) : undefined,
      },
    };
  });

  // Some classic opened gifts state the relationship only from the source
  // side (for example, "Inside you find... the Ghost Tie!"). Resolve those
  // only when both the reward name and proposing source are unambiguous.
  const sourceProposals = new Map<string, GroupedInventoryItem[]>();
  for (const source of linked) {
    const rewardName = source.describedGiftReward?.rewardName;
    if (!rewardName) continue;
    const candidates = (byName.get(normalizeGiftLinkName(rewardName)) ?? [])
      .filter((candidate) => candidate.key !== source.key);
    if (candidates.length !== 1) continue;
    const reward = candidates[0]!;
    const proposals = sourceProposals.get(reward.key) ?? [];
    proposals.push(source);
    sourceProposals.set(reward.key, proposals);
  }

  linked = linked.map((reward) => {
    if (reward.giftOrigin?.sourceItemKey) return reward;
    const proposals = sourceProposals.get(reward.key) ?? [];
    if (proposals.length !== 1) return reward;
    const source = proposals[0]!;
    if (
      reward.giftOrigin &&
      normalizeGiftLinkName(reward.giftOrigin.sourceName) !== normalizeGiftLinkName(source.name)
    ) {
      return reward;
    }
    const history = directWikiHistory(source);
    return {
      ...reward,
      giftOrigin: {
        sourceName: reward.giftOrigin?.sourceName ?? source.name,
        sourceItemKey: source.key,
        sourceItemId: source.id,
        sourceItemName: source.name,
        sourceRobloxUrl: source.robloxUrl,
        sourceOwnedCopies: source.copies.length,
        sourceMetric: history ? sourceMetricFor(source, history) : undefined,
      },
    };
  });

  const rewardsBySource = new Map<string, Map<string, GiftRewardLinkMetadata>>();
  for (const reward of linked) {
    const sourceKey = reward.giftOrigin?.sourceItemKey;
    if (!sourceKey) continue;
    const rewards = rewardsBySource.get(sourceKey) ?? new Map<string, GiftRewardLinkMetadata>();
    rewards.set(reward.key, {
      rewardItemKey: reward.key,
      rewardItemId: reward.id,
      rewardItemName: reward.name,
      rewardRobloxUrl: reward.robloxUrl,
      rewardOwnedCopies: reward.copies.length,
    });
    rewardsBySource.set(sourceKey, rewards);
  }

  return linked.map((item) => {
    const rewards = rewardsBySource.get(item.key);
    if (!rewards?.size) return item;
    return {
      ...item,
      giftRewards: [...rewards.values()].sort((a, b) =>
        a.rewardItemName.localeCompare(b.rewardItemName, undefined, { sensitivity: "base", numeric: true })),
    };
  });
}
