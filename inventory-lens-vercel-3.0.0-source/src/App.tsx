import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type SVGProps,
} from "react";
import {
  CATEGORY_GROUPS,
  CATEGORY_OPTIONS,
  CATEGORY_PRESETS,
} from "./lib/categories";
import {
  mergeGroupedItems,
  scanInventory,
  type ScanResult,
} from "./lib/scanner";
import {
  ScanError,
  type CategoryOption,
  type GroupedInventoryItem,
  type ResolvedUser,
  type ScanErrorCode,
  type ScanProgress,
} from "./lib/types";
import { clearLocalExtensionData } from "./lib/local-data";
import GraphicBuilder from "./GraphicBuilder";
import {
  createGraphicDraft,
  type GraphicBuilderDraft,
} from "./lib/graphic-builder";
import { externalDataFetch, isWebDeployment } from "./lib/runtime-fetch";
import { RobloxHttpClient } from "./lib/http";

const IDLE_PROGRESS: ScanProgress = {
  phase: "idle",
  pages: 0,
  records: 0,
  message: "Ready to scan",
};

const SOURCE_REPOSITORY_URL = "https://github.com/ListAI67/InventoryLens";

type ScanState = "idle" | "scanning" | "paused" | "done";
type DashboardPage = "inventory" | "graphic";
export type LimitedFilter = "all" | "limited" | "nonlimited";
export type CreatorFilter = "all" | "roblox";
export type SortMode =
  | "rarest"
  | "collector"
  | "wikiFewest"
  | "copiesHigh"
  | "copiesLow"
  | "newest"
  | "oldest"
  | "name";

export interface DashboardFilters {
  query: string;
  categoryIds: ReadonlySet<string>;
  onlyDuplicates: boolean;
  onlyOffSale: boolean;
  collectorOnly: boolean;
  limited: LimitedFilter;
  creator: CreatorFilter;
  knownSupply: boolean;
  sort: SortMode;
}

export const DEFAULT_RESULT_FILTERS = {
  query: "",
  onlyDuplicates: false,
  onlyOffSale: false,
  collectorOnly: false,
  limited: "all" as LimitedFilter,
  creator: "all" as CreatorFilter,
  knownSupply: false,
} as const;

/**
 * Clears browser-owned state used by Inventory Lens. Dashboard reports live
 * in React memory, so the UI resets its own state after calling this hook.
 * Future cache clearing should be added here rather than scattered through UI.
 */
export async function clearInventoryLensLocalData(): Promise<void> {
  await clearLocalExtensionData();
}

export interface ScanSegment {
  id: "inventory" | "bundles" | "makeup" | "badges" | "privateServers";
  label: string;
  categoryIds: string[];
  /** Optional stages may be skipped after an access-denied response if another stage succeeded. */
  optional: boolean;
}

/**
 * Keeps broad asset inventory efficient while isolating the adapters most
 * likely to have different privacy/rate-limit behavior. Stages always run
 * sequentially, so selecting All does not fan out API work.
 */
export function planScanSegments(
  categoryIds: readonly string[],
  categories: readonly CategoryOption[] = CATEGORY_OPTIONS,
): ScanSegment[] {
  const selected = new Set(categoryIds);
  const buckets: Record<ScanSegment["id"], string[]> = {
    inventory: [],
    bundles: [],
    makeup: [],
    badges: [],
    privateServers: [],
  };

  for (const category of categories) {
    if (!selected.has(category.id)) continue;
    if (category.special === "bundles") buckets.bundles.push(category.id);
    else if (category.special === "badges") buckets.badges.push(category.id);
    else if (category.special === "privateServers") buckets.privateServers.push(category.id);
    else if (category.group === "Makeup") buckets.makeup.push(category.id);
    else buckets.inventory.push(category.id);
  }

  const definitions: Array<Omit<ScanSegment, "categoryIds"> & { categoryIds: string[] }> = [
    { id: "inventory", label: "Inventory items", categoryIds: buckets.inventory, optional: false },
    { id: "bundles", label: "Bundles", categoryIds: buckets.bundles, optional: true },
    { id: "makeup", label: "Makeup compatibility", categoryIds: buckets.makeup, optional: true },
    { id: "badges", label: "Badges", categoryIds: buckets.badges, optional: true },
    { id: "privateServers", label: "Private servers", categoryIds: buckets.privateServers, optional: true },
  ];

  return definitions.filter((segment) => segment.categoryIds.length > 0);
}

export function recordSuccessfulSegment(
  current: ReadonlySet<string>,
  categoryIds: readonly string[],
  succeeded: boolean,
) {
  const next = new Set(current);
  if (succeeded) categoryIds.forEach((id) => next.add(id));
  return next;
}

function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & {
  name:
    | "search"
    | "arrow"
    | "sliders"
    | "pause"
    | "play"
    | "stop"
    | "external"
    | "copy"
    | "gift"
    | "check"
    | "sparkles"
    | "chevron"
    | "warning"
    | "user"
    | "inventory";
}) {
  const paths: Record<typeof name, React.ReactNode> = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    sliders: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="8" cy="6" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="10" cy="18" r="2" />
      </>
    ),
    pause: (
      <>
        <path d="M9 5v14M15 5v14" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7Z" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    external: (
      <>
        <path d="M14 4h6v6M20 4l-9 9" />
        <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    gift: (
      <>
        <rect x="3" y="8" width="18" height="13" rx="2" />
        <path d="M12 8v13M3 12h18M12 8H8.5A2.5 2.5 0 1 1 11 5.5L12 8Zm0 0h3.5A2.5 2.5 0 1 0 13 5.5L12 8Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    sparkles: (
      <>
        <path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4Z" />
        <path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z" />
        <path d="m5 13 .8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8Z" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    warning: (
      <>
        <path d="M10.3 3.8 2.6 18a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4m0 4h.01" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    inventory: (
      <>
        <path d="M4 7h16v13H4zM3 3h18v4H3z" />
        <path d="M9 11h6" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

function getInitialInput() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("userId") ??
    params.get("user") ??
    params.get("username") ??
    params.get("player") ??
    params.get("profileUrl") ??
    ""
  );
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatDate(value?: string) {
  if (!value) return "Not provided";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Not provided";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function latestAcquisition(item: GroupedInventoryItem) {
  const times = item.copies
    .map((copy) => (copy.acquiredAt ? Date.parse(copy.acquiredAt) : NaN))
    .filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}

function earliestAcquisition(item: GroupedInventoryItem) {
  const times = item.copies
    .map((copy) => (copy.acquiredAt ? Date.parse(copy.acquiredAt) : NaN))
    .filter(Number.isFinite);
  return times.length ? Math.min(...times) : null;
}

function officialSupply(item: GroupedInventoryItem) {
  return item.rarity.kind === "officialSupply" ? item.rarity.count : null;
}

function wikiPurchases(item: GroupedInventoryItem) {
  return item.rarity.kind === "wikiPurchases" ? item.rarity.count : null;
}

function collectorScore(item: GroupedInventoryItem) {
  return item.collector && item.collector.tier !== "none"
    ? item.collector.score
    : null;
}

export function summarizeConfirmedOffSale(
  items: readonly GroupedInventoryItem[],
  categoryIds: ReadonlySet<string>,
) {
  const matching = items.filter(
    (item) => categoryIds.has(item.categoryId) && item.saleStatus === "offSale",
  );
  return {
    uniqueItems: matching.length,
    ownedCopies: matching.reduce((total, item) => total + item.copies.length, 0),
  };
}

/** Keeps a visible source gift immediately followed by all of its visible rewards. */
export function keepGiftFamiliesAdjacent(
  items: readonly GroupedInventoryItem[],
): GroupedInventoryItem[] {
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const sourceKeyByReward = new Map<string, string>();
  const rewardsBySource = new Map<string, GroupedInventoryItem[]>();

  for (const item of items) {
    const sourceKey = item.giftOrigin?.sourceItemKey;
    if (!sourceKey || sourceKey === item.key || !itemByKey.has(sourceKey)) continue;
    sourceKeyByReward.set(item.key, sourceKey);
    const rewards = rewardsBySource.get(sourceKey) ?? [];
    rewards.push(item);
    rewardsBySource.set(sourceKey, rewards);
  }

  const grouped: GroupedInventoryItem[] = [];
  const emitted = new Set<string>();
  for (const item of items) {
    if (emitted.has(item.key)) continue;
    const sourceKey = sourceKeyByReward.get(item.key) ??
      (rewardsBySource.has(item.key) ? item.key : undefined);
    if (!sourceKey) {
      grouped.push(item);
      emitted.add(item.key);
      continue;
    }

    const source = itemByKey.get(sourceKey);
    if (source && !emitted.has(source.key)) {
      grouped.push(source);
      emitted.add(source.key);
    }
    for (const reward of rewardsBySource.get(sourceKey) ?? []) {
      if (emitted.has(reward.key)) continue;
      grouped.push(reward);
      emitted.add(reward.key);
    }
  }

  return grouped;
}

export function filterAndSortItems(
  items: readonly GroupedInventoryItem[],
  filters: DashboardFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase();
  const filtered = items.filter((item) => {
    if (!filters.categoryIds.has(item.categoryId)) return false;
    const searchableName = `${item.name} ${item.giftOrigin?.sourceItemName ?? item.giftOrigin?.sourceName ?? ""} ${
      item.giftRewards?.map(({ rewardItemName }) => rewardItemName).join(" ") ?? ""
    }`
      .toLocaleLowerCase();
    if (query && !searchableName.includes(query)) return false;
    if (filters.onlyDuplicates && item.copies.length < 2) return false;
    if (filters.onlyOffSale && item.saleStatus !== "offSale") return false;
    if (filters.collectorOnly && collectorScore(item) === null) return false;
    if (filters.limited === "limited" && !item.isLimited) return false;
    if (filters.limited === "nonlimited" && item.isLimited) return false;
    if (filters.creator === "roblox" && !isRobloxCreatedItem(item)) {
      return false;
    }
    if (filters.knownSupply && officialSupply(item) === null) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let difference = 0;
    switch (filters.sort) {
      case "rarest": {
        const aSupply = officialSupply(a);
        const bSupply = officialSupply(b);
        if (aSupply === null && bSupply !== null) return 1;
        if (aSupply !== null && bSupply === null) return -1;
        if (aSupply !== null && bSupply !== null) difference = aSupply - bSupply;
        break;
      }
      case "collector": {
        const aScore = collectorScore(a);
        const bScore = collectorScore(b);
        if (aScore === null && bScore !== null) return 1;
        if (aScore !== null && bScore === null) return -1;
        if (aScore !== null && bScore !== null) difference = bScore - aScore;
        break;
      }
      case "wikiFewest": {
        const aPurchases = wikiPurchases(a);
        const bPurchases = wikiPurchases(b);
        if (aPurchases === null && bPurchases !== null) return 1;
        if (aPurchases !== null && bPurchases === null) return -1;
        if (aPurchases !== null && bPurchases !== null) {
          difference = aPurchases - bPurchases;
        }
        break;
      }
      case "copiesHigh":
        difference = b.copies.length - a.copies.length;
        break;
      case "copiesLow":
        difference = a.copies.length - b.copies.length;
        break;
      case "newest": {
        const aDate = latestAcquisition(a);
        const bDate = latestAcquisition(b);
        if (aDate === null && bDate !== null) return 1;
        if (aDate !== null && bDate === null) return -1;
        if (aDate !== null && bDate !== null) difference = bDate - aDate;
        break;
      }
      case "oldest": {
        const aDate = earliestAcquisition(a);
        const bDate = earliestAcquisition(b);
        if (aDate === null && bDate !== null) return 1;
        if (aDate !== null && bDate === null) return -1;
        if (aDate !== null && bDate !== null) difference = aDate - bDate;
        break;
      }
      case "name":
        difference = a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
          numeric: true,
        });
        break;
    }
    return (
      difference ||
      a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
        numeric: true,
      })
    );
  });
  return keepGiftFamiliesAdjacent(sorted);
}

/** Roblox's authoritative catalog creator identity is User target ID 1. */
export function isRobloxCreatedItem(item: GroupedInventoryItem): boolean {
  return item.creatorType?.trim().toLocaleLowerCase() === "user" &&
    item.creatorTargetId?.trim() === "1";
}

export function errorMessage(error: unknown) {
  if (error instanceof ScanError) {
    switch (error.code) {
      case "invalidInput":
        return "Enter a valid Roblox username, numeric user ID, or player profile URL.";
      case "privateInventory":
        return "Roblox reports that this player's inventory is private, so it cannot be scanned publicly.";
      case "permissionDenied":
        return "Roblox denied an anonymous public inventory request. Any categories Roblox did return remain available; private or protected data cannot be bypassed.";
      case "notFound":
        return "No Roblox player matched that username, user ID, or profile URL.";
      case "rateLimited":
        return "Roblox is still rate limiting this scan. Completed stages are saved; wait for Roblox's cooldown, then retry only the unfinished categories.";
      case "cancelled":
        return "Scan stopped. Previously loaded results are still available.";
      case "network":
        return "The Roblox API could not be reached. Check your connection and try again.";
      default:
        return error.message || "The scan could not be completed.";
    }
  }
  return error instanceof Error ? error.message : "The scan could not be completed.";
}

function CategoryCheckbox({
  category,
  checked,
  count,
  onChange,
}: {
  category: CategoryOption;
  checked: boolean;
  count?: number;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="category-option">
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="checkmark" aria-hidden="true">
        <Icon name="check" />
      </span>
      <span>{category.label}</span>
      {typeof count === "number" && count > 0 ? (
        <span className="category-count">{formatCount(count)}</span>
      ) : null}
    </label>
  );
}

function CategoryGroup({
  name,
  categories,
  selected,
  itemCounts,
  onCategoryChange,
  onGroupChange,
}: {
  name: string;
  categories: CategoryOption[];
  selected: Set<string>;
  itemCounts: Map<string, number>;
  onCategoryChange: (id: string, checked: boolean) => void;
  onGroupChange: (categories: CategoryOption[], checked: boolean) => void;
}) {
  const checkedCount = categories.filter((category) => selected.has(category.id)).length;
  const allChecked = checkedCount === categories.length;
  const partiallyChecked = checkedCount > 0 && !allChecked;
  const checkboxRef = useCallback(
    (node: HTMLInputElement | null) => {
      if (node) node.indeterminate = partiallyChecked;
    },
    [partiallyChecked],
  );

  return (
    <details className="category-group">
      <summary>
        <span className="summary-chevron">
          <Icon name="chevron" />
        </span>
        <label onClick={(event) => event.stopPropagation()}>
          <input
            checked={allChecked}
            onChange={(event) => onGroupChange(categories, event.target.checked)}
            ref={checkboxRef}
            type="checkbox"
          />
          <span className="checkmark" aria-hidden="true">
            <Icon name="check" />
          </span>
          <span>{name}</span>
        </label>
        <span className="group-total">
          {checkedCount}/{categories.length}
        </span>
      </summary>
      <div className="category-options">
        {categories.map((category) => (
          <CategoryCheckbox
            category={category}
            checked={selected.has(category.id)}
            count={itemCounts.get(category.id)}
            key={category.id}
            onChange={(checked) => onCategoryChange(category.id, checked)}
          />
        ))}
      </div>
    </details>
  );
}

export function ItemCard({
  item,
  categoryLabel,
}: {
  item: GroupedInventoryItem;
  categoryLabel: string;
}) {
  const copies = item.copies.length;
  const sourceGiftMetric = item.rarity.kind === "unavailable"
    ? item.giftOrigin?.sourceMetric
    : undefined;
  const sourceGiftName = item.giftOrigin?.sourceItemName ?? item.giftOrigin?.sourceName ?? "Source gift";
  const rarityClass =
    sourceGiftMetric
      ? "gift"
      : item.rarity.kind === "officialSupply"
      ? "known"
      : item.rarity.kind === "badgeAwards"
        ? "badge"
        : item.rarity.kind === "wikiPurchases"
          ? "wiki"
        : "unknown";
  const isGiftPurchases = sourceGiftMetric !== undefined;
  const isWikiPurchases = !isGiftPurchases && item.rarity.kind === "wikiPurchases";
  const metricLabel = isGiftPurchases
    ? "Source gift purchases"
    : isWikiPurchases
      ? "Wiki purchases"
      : item.rarity.label;
  const metricCount = sourceGiftMetric?.count ?? item.rarity.count;
  const metricSourceUrl = sourceGiftMetric?.sourceUrl ?? item.rarity.sourceUrl;
  const collector = item.collector && item.collector.tier !== "none"
    ? item.collector
    : undefined;
  const collectorTierLabel = collector
    ? {
        exceptional: "Exceptional",
        rare: "Rare",
        notable: "Notable",
        none: "Not rated",
      }[collector.tier]
    : undefined;

  return (
    <article className="item-card">
      <div className="thumbnail-wrap">
        {item.thumbnailUrl ? (
          <img alt="" loading="lazy" src={item.thumbnailUrl} />
        ) : (
          <div className="thumbnail-placeholder" aria-hidden="true">
            <Icon name="inventory" />
          </div>
        )}
        <span className="copy-pill" aria-label={`${copies} copies owned`}>
          <Icon name="copy" /> ×{formatCount(copies)}
        </span>
        {item.isLimited ? <span className="limited-pill">Limited</span> : null}
        {item.saleStatus === "offSale" ? <span className="sale-pill">Off sale</span> : null}
        {collector ? (
          <span
            aria-label={`${collectorTierLabel} estimated collector rating`}
            className={`collector-pill ${collector.tier}`}
          >
            Collector {collectorTierLabel}
          </span>
        ) : null}
      </div>

      <div className="card-content">
        <div>
          <p className="item-eyebrow">
            {item.assetType ?? categoryLabel}
            {item.creatorName ? ` · ${item.creatorName}` : ""}
          </p>
          <h3 title={item.name}>{item.name}</h3>
        </div>

        {item.giftRewards?.length ? (
          <div className="gift-origin gift-contents">
            <span className="gift-origin-badge"><Icon name="gift" /> Gift contents</span>
            <div>
              <span>Revealed</span>
              {item.giftRewards.map((reward) => (
                <div className="gift-reward-link" key={reward.rewardItemKey}>
                  <a href={reward.rewardRobloxUrl} rel="noopener noreferrer" target="_blank">
                    {reward.rewardItemName} <Icon name="external" />
                  </a>
                  <small>You own ×{formatCount(reward.rewardOwnedCopies)} of this reward</small>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {item.giftOrigin ? (
          <div className="gift-origin">
            <span className="gift-origin-badge"><Icon name="gift" /> Gift reward</span>
            <div>
              <span>Came from</span>
              {item.giftOrigin.sourceRobloxUrl ? (
                <a href={item.giftOrigin.sourceRobloxUrl} rel="noopener noreferrer" target="_blank">
                  {sourceGiftName} <Icon name="external" />
                </a>
              ) : (
                <strong>{sourceGiftName}</strong>
              )}
              {item.giftOrigin.sourceOwnedCopies ? (
                <small>You own ×{formatCount(item.giftOrigin.sourceOwnedCopies)} of the source gift</small>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={`rarity-block ${rarityClass}`}>
          <div className="metric-main">
            <span>{metricLabel}</span>
            <strong>
              {metricCount === null
                ? "—"
                : formatCount(metricCount)}
            </strong>
          </div>
          {isGiftPurchases ? (
            <small className="metric-note">
              {sourceGiftMetric.asOf
                ? `Source gift figure reported as of ${sourceGiftMetric.asOf}; release basis only, not a direct reward count or current copies/owners. Random, multi-item, free, or separate releases may differ.`
                : "Historical source-gift purchases are a release basis only, not a direct reward count or current copies/owners. Random, multi-item, free, or separate releases may differ."}
            </small>
          ) : isWikiPurchases ? (
            <small className="metric-note">
              {item.rarity.kind === "wikiPurchases" && item.rarity.asOf
                ? `Reported as of ${item.rarity.asOf}; not current unique owners.`
                : "Historical purchases, not current unique owners."}
            </small>
          ) : null}
          {metricSourceUrl ? (
            <a
              aria-label={
                isGiftPurchases
                  ? `Open wiki source for ${sourceGiftName}'s historical purchase count used by ${item.name}`
                  : isWikiPurchases
                  ? `Open wiki source for ${item.name}'s historical purchase count`
                  : `Open official Roblox source for ${item.name}'s ${metricLabel.toLocaleLowerCase()}`
              }
              className="metric-source"
              href={metricSourceUrl}
              rel="noopener noreferrer"
              target="_blank"
              title={
                isGiftPurchases
                  ? "Open the source gift's wiki purchase history"
                  : isWikiPurchases
                  ? "Open the wiki page used for this historical purchase count"
                  : "Open this metric's official Roblox source"
              }
            >
              Source <Icon name="external" />
            </a>
          ) : null}
        </div>

        {collector ? (
          <div className={`collector-block ${collector.tier}`}>
            <div className="collector-heading">
              <span>Collector rating <small>estimated</small></span>
              <strong>{collector.score}<small>/100</small></strong>
            </div>
            <div className="collector-signals">
              {collector.signals.slice(0, 5).map((signal) => (
                <span className={signal.points < 0 ? "negative" : ""} key={`${signal.kind}-${signal.label}`}>
                  {signal.label}
                </span>
              ))}
            </div>
            <small className="collector-note">{collector.note}</small>
            <a
              aria-label={`Open evidence for ${item.name}'s estimated collector rating`}
              className="metric-source"
              href={collector.sourceUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Evidence source <Icon name="external" />
            </a>
          </div>
        ) : null}

        <div className="card-links">
          <a aria-label={`Open ${item.name} on Roblox`} href={item.robloxUrl} rel="noopener noreferrer" target="_blank">
            Roblox <Icon name="external" />
          </a>
        </div>
      </div>

      {copies > 1 ? (
        <details className="copy-details">
          <summary>
            View {formatCount(copies)} owned copies
            <Icon name="chevron" />
          </summary>
          <div className="copy-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Instance ID</th>
                  <th>Serial</th>
                  <th>Acquired</th>
                </tr>
              </thead>
              <tbody>
                {item.copies.map((copy, index) => (
                  <tr key={`${copy.instanceId}-${index}`}>
                    <td title={copy.instanceId}>{copy.instanceId}</td>
                    <td>{copy.serialNumber ?? "—"}</td>
                    <td>{formatDate(copy.acquiredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </article>
  );
}

export default function App() {
  const webDeployment = isWebDeployment();
  const [playerInput, setPlayerInput] = useState(getInitialInput);
  const [selectedCategories, setSelectedCategories] = useState(
    () => new Set<string>(CATEGORY_PRESETS.all),
  );
  const [scannedCategories, setScannedCategories] = useState(
    () => new Set<string>(),
  );
  const [items, setItems] = useState<GroupedInventoryItem[]>([]);
  const [user, setUser] = useState<ResolvedUser | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [progress, setProgress] = useState<ScanProgress>(IDLE_PROGRESS);
  const [scanError, setScanError] = useState("");
  const [scanErrorCode, setScanErrorCode] = useState<ScanErrorCode | null>(null);
  const [scanStage, setScanStage] = useState({ current: 0, total: 0, label: "" });
  const [query, setQuery] = useState<string>(DEFAULT_RESULT_FILTERS.query);
  const [onlyDuplicates, setOnlyDuplicates] = useState<boolean>(DEFAULT_RESULT_FILTERS.onlyDuplicates);
  const [onlyOffSale, setOnlyOffSale] = useState<boolean>(DEFAULT_RESULT_FILTERS.onlyOffSale);
  const [collectorOnly, setCollectorOnly] = useState<boolean>(DEFAULT_RESULT_FILTERS.collectorOnly);
  const [limited, setLimited] = useState<LimitedFilter>(DEFAULT_RESULT_FILTERS.limited);
  const [creator, setCreator] = useState<CreatorFilter>(DEFAULT_RESULT_FILTERS.creator);
  const [knownSupply, setKnownSupply] = useState<boolean>(DEFAULT_RESULT_FILTERS.knownSupply);
  const [sort, setSort] = useState<SortMode>("rarest");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [clearStatus, setClearStatus] = useState("");
  const [mobileCategoriesOpen, setMobileCategoriesOpen] = useState(false);
  const [activePage, setActivePage] = useState<DashboardPage>("inventory");
  const [graphicDraft, setGraphicDraft] = useState<GraphicBuilderDraft>(() => createGraphicDraft());

  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);
  const resumeWaiters = useRef<Array<() => void>>([]);
  const lastScanInput = useRef("");
  const aboutTriggerRef = useRef<HTMLButtonElement | null>(null);
  const aboutDialogRef = useRef<HTMLElement | null>(null);
  const graphicOwnerIdRef = useRef<string | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!aboutOpen) return undefined;
    const dialog = aboutDialogRef.current;
    if (!dialog) return undefined;

    const focusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    const focusTimer = window.setTimeout(() => focusableElements()[0]?.focus(), 0);

    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAboutOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleDialogKey);
      aboutTriggerRef.current?.focus();
    };
  }, [aboutOpen]);

  const categoriesByGroup = useMemo(() => {
    const groups = new Map<string, CategoryOption[]>();
    for (const group of CATEGORY_GROUPS) {
      groups.set(group, []);
    }
    for (const category of CATEGORY_OPTIONS) {
      const group = groups.get(category.group) ?? [];
      group.push(category);
      groups.set(category.group, group);
    }
    return new Map([...groups].filter(([, categories]) => categories.length > 0));
  }, []);

  const itemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const categoryLabelById = useMemo(
    () => new Map(CATEGORY_OPTIONS.map((category) => [category.id, category.label])),
    [],
  );

  const deferredQuery = useDeferredValue(query);
  const filteredItems = useMemo(
    () =>
      filterAndSortItems(items, {
        query: deferredQuery,
        categoryIds: selectedCategories,
        onlyDuplicates,
        onlyOffSale,
        collectorOnly,
        limited,
        creator,
        knownSupply,
        sort,
      }),
    [items, deferredQuery, selectedCategories, onlyDuplicates, onlyOffSale, collectorOnly, limited, creator, knownSupply, sort],
  );

  const missingSelectedCategories = useMemo(
    () => [...selectedCategories].filter((id) => !scannedCategories.has(id)),
    [selectedCategories, scannedCategories],
  );

  const duplicateItems = useMemo(
    () => items.filter((item) => item.copies.length > 1).length,
    [items],
  );
  const ownedCopies = useMemo(
    () => items.reduce((total, item) => total + item.copies.length, 0),
    [items],
  );
  const knownSupplyItems = useMemo(
    () => items.filter((item) => item.rarity.kind === "officialSupply").length,
    [items],
  );
  const collectorItems = useMemo(
    () => items.filter((item) => collectorScore(item) !== null).length,
    [items],
  );
  const selectedOffSale = useMemo(
    () => summarizeConfirmedOffSale(items, selectedCategories),
    [items, selectedCategories],
  );
  const hasWikiPurchaseMetrics = useMemo(
    () => items.some((item) => item.rarity.kind === "wikiPurchases" || item.giftOrigin?.sourceMetric),
    [items],
  );

  const releasePausedScans = useCallback(() => {
    const waiters = resumeWaiters.current.splice(0);
    waiters.forEach((resolve) => resolve());
  }, []);

  const clearLocalData = useCallback(async () => {
    abortRef.current?.abort();
    pausedRef.current = false;
    releasePausedScans();
    await clearInventoryLensLocalData();
    setPlayerInput("");
    setSelectedCategories(new Set(CATEGORY_PRESETS.all));
    setScannedCategories(new Set());
    setItems([]);
    setUser(null);
    setWarnings([]);
    setScanState("idle");
    setProgress(IDLE_PROGRESS);
    setScanError("");
    setScanErrorCode(null);
    setScanStage({ current: 0, total: 0, label: "" });
    setQuery(DEFAULT_RESULT_FILTERS.query);
    setOnlyDuplicates(DEFAULT_RESULT_FILTERS.onlyDuplicates);
    setOnlyOffSale(DEFAULT_RESULT_FILTERS.onlyOffSale);
    setCollectorOnly(DEFAULT_RESULT_FILTERS.collectorOnly);
    setLimited(DEFAULT_RESULT_FILTERS.limited);
    setCreator(DEFAULT_RESULT_FILTERS.creator);
    setKnownSupply(DEFAULT_RESULT_FILTERS.knownSupply);
    setSort("rarest");
    setActivePage("inventory");
    setGraphicDraft(createGraphicDraft());
    graphicOwnerIdRef.current = null;
    lastScanInput.current = "";
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    setClearStatus("Local dashboard data cleared.");
  }, [releasePausedScans]);

  const handlePreset = useCallback((ids: readonly string[]) => {
    setSelectedCategories(new Set(ids));
  }, []);

  const handleCategoryChange = useCallback((id: string, checked: boolean) => {
    setSelectedCategories((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleGroupChange = useCallback(
    (categories: CategoryOption[], checked: boolean) => {
      setSelectedCategories((current) => {
        const next = new Set(current);
        for (const category of categories) {
          if (checked) next.add(category.id);
          else next.delete(category.id);
        }
        return next;
      });
    },
    [],
  );

  const startScan = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const input = playerInput.trim();
      if (!input) {
        setScanError("Enter a Roblox username, user ID, or profile URL.");
        setScanErrorCode("invalidInput");
        return;
      }
      if (!selectedCategories.size) {
        setScanError("Select at least one inventory category.");
        setScanErrorCode("invalidInput");
        return;
      }

      const normalizedInput = input.toLocaleLowerCase();
      const isIncremental =
        Boolean(user) && lastScanInput.current === normalizedInput;
      const categoriesToLoad = isIncremental
        ? [...selectedCategories].filter((id) => !scannedCategories.has(id))
        : [...selectedCategories];
      const segments = planScanSegments(categoriesToLoad);

      if (isIncremental && categoriesToLoad.length === 0) {
        setScanError("");
        setScanErrorCode(null);
        setProgress({
          phase: "done",
          pages: progress.pages,
          records: ownedCopies,
          message: "All selected categories are already loaded",
        });
        return;
      }
      if (segments.length === 0) {
        setScanError("The selected categories are not supported by this build.");
        setScanErrorCode("invalidInput");
        return;
      }

      if (!isIncremental) {
        setItems([]);
        setUser(null);
        setWarnings([]);
        setScannedCategories(new Set());
      }

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      pausedRef.current = false;
      releasePausedScans();
      setScanError("");
      setScanErrorCode(null);
      setScanState("scanning");
      setScanStage({ current: 0, total: segments.length, label: "Preparing scan" });
      setProgress({
        phase: "resolving",
        pages: isIncremental ? progress.pages : 0,
        records: isIncremental ? ownedCopies : 0,
        message: isIncremental
          ? `Loading ${categoriesToLoad.length} newly selected ${categoriesToLoad.length === 1 ? "category" : "categories"}`
          : "Resolving Roblox player",
      });

      const waitIfPaused = async () => {
        if (!pausedRef.current) return;
        await new Promise<void>((resolve) => {
          resumeWaiters.current.push(resolve);
        });
      };

      let completedPages = isIncremental ? progress.pages : 0;
      let completedRecords = isIncremental ? ownedCopies : 0;
      let successfulStages = 0;
      let skippedStages = 0;
      let scannedCategoryCount = 0;
      let deniedCategoryCount = 0;
      let activeSegment: ScanSegment | null = null;
      let completedCategories = new Set(
        isIncremental ? scannedCategories : [],
      );
      let resolvedUserForRun: ResolvedUser | null = isIncremental ? user : null;
      let visibilityCheckedForRun = isIncremental;
      const sharedClient = new RobloxHttpClient({
        fetch: externalDataFetch,
        maxRateLimitRetries: 1,
        onRateLimit: ({ delayMs }) => {
          const seconds = Math.max(1, Math.ceil(delayMs / 1_000));
          setProgress((current) => ({
            ...current,
            message: `Roblox asked us to wait ${seconds} ${seconds === 1 ? "second" : "seconds"}; retrying this page once...`,
          }));
        },
      });

      try {
        for (let index = 0; index < segments.length; index += 1) {
          const segment = segments[index];
          activeSegment = segment;
          setScanStage({
            current: index + 1,
            total: segments.length,
            label: segment.label,
          });
          setProgress({
            phase: "inventory",
            pages: completedPages,
            records: completedRecords,
            message: `Starting ${segment.label.toLocaleLowerCase()}`,
          });

          await waitIfPaused();
          if (controller.signal.aborted) {
            throw new ScanError("cancelled", "The scan was cancelled.");
          }

          let segmentPages = 0;
          let result: ScanResult;
          try {
            result = await scanInventory({
              input,
              categoryIds: segment.categoryIds,
              client: sharedClient,
              fetch: externalDataFetch,
              resolvedUser: resolvedUserForRun ?? undefined,
              skipVisibilityCheck: visibilityCheckedForRun,
              signal: controller.signal,
              waitIfPaused,
              onProgress: (segmentProgress) => {
                segmentPages = Math.max(segmentPages, segmentProgress.pages);
                setProgress({
                  ...segmentProgress,
                  pages: completedPages + segmentProgress.pages,
                  records: completedRecords + segmentProgress.records,
                  message:
                    segments.length > 1
                      ? `${segment.label}: ${segmentProgress.message}`
                      : segmentProgress.message,
                });
              },
            });
          } catch (error) {
            if (
              error instanceof ScanError &&
              error.code === "permissionDenied" &&
              segment.optional
            ) {
              skippedStages += 1;
              const warning = `${segment.label} was not loaded because Roblox denied access. Other successful categories remain available.`;
              setWarnings((current) => [...new Set([...current, warning])]);
              continue;
            }
            throw error;
          }

          if (controller.signal.aborted) {
            throw new ScanError("cancelled", "The scan was cancelled.");
          }

          resolvedUserForRun = result.user;
          visibilityCheckedForRun = true;

          const shouldMerge = isIncremental || successfulStages > 0 || skippedStages > 0;
          if (graphicOwnerIdRef.current !== result.user.id) {
            graphicOwnerIdRef.current = result.user.id;
            setGraphicDraft(createGraphicDraft());
          }
          setUser(result.user);
          setItems((current) =>
            shouldMerge ? mergeGroupedItems(current, result.items) : result.items,
          );
          setWarnings((current) =>
            shouldMerge
              ? [...new Set([...current, ...result.warnings])]
              : result.warnings,
          );

          completedCategories = recordSuccessfulSegment(
            completedCategories,
            [
              ...result.coverage.scannedCategoryIds,
              ...result.coverage.unsupportedCategoryIds,
            ],
            true,
          );
          setScannedCategories(completedCategories);
          scannedCategoryCount += result.coverage.scannedCategoryIds.length;
          deniedCategoryCount += result.coverage.deniedCategoryIds.length;
          lastScanInput.current = normalizedInput;
          completedPages += segmentPages;
          completedRecords += result.records.length;
          successfulStages += 1;
        }

        const everyPublicCategoryDenied =
          (deniedCategoryCount > 0 && scannedCategoryCount === 0) ||
          (successfulStages === 0 && skippedStages > 0);
        setScanState(successfulStages > 0 ? "done" : "idle");
        setScanStage({
          current: segments.length,
          total: segments.length,
          label: "Complete",
        });
        if (everyPublicCategoryDenied) {
          setScanErrorCode("permissionDenied");
          setScanError(
            "Roblox denied anonymous access to every selected public category. Try another category or player; private data cannot be bypassed.",
          );
        }
        setProgress({
          phase: "done",
          pages: completedPages,
          records: completedRecords,
          message: everyPublicCategoryDenied
            ? "No selected public categories were available"
            : skippedStages || deniedCategoryCount > 0
              ? "Scan complete with some categories unavailable"
              : isIncremental
                ? "New categories merged into this inventory"
                : "Inventory scan complete",
        });
      } catch (error) {
        const code = error instanceof ScanError ? error.code : null;
        const hasPreservedResults = isIncremental || successfulStages > 0;
        setScanState(hasPreservedResults ? "done" : "idle");
        setScanErrorCode(code);
        if (code === "rateLimited") {
          const stage = activeSegment?.label.toLocaleLowerCase() ?? "this scan";
          setScanError(
            `Roblox is still rate limiting ${stage}. ${hasPreservedResults ? "Completed stages are saved. " : ""}Wait for Roblox's cooldown, then retry; only unfinished categories will run again.`,
          );
        } else {
          setScanError(errorMessage(error));
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        pausedRef.current = false;
        releasePausedScans();
      }
    },
    [
      ownedCopies,
      playerInput,
      progress.pages,
      releasePausedScans,
      scannedCategories,
      selectedCategories,
      user,
    ],
  );

  const togglePause = useCallback(() => {
    if (scanState === "paused") {
      pausedRef.current = false;
      releasePausedScans();
      setScanState("scanning");
      return;
    }
    if (scanState === "scanning") {
      pausedRef.current = true;
      setScanState("paused");
    }
  }, [releasePausedScans, scanState]);

  const cancelScan = useCallback(() => {
    pausedRef.current = false;
    releasePausedScans();
    abortRef.current?.abort();
    setScanState(items.length ? "done" : "idle");
    setScanErrorCode("cancelled");
    setScanError("Scan stopped. Previously loaded results are still available.");
  }, [items.length, releasePausedScans]);

  const isBusy = scanState === "scanning" || scanState === "paused";
  const isCurrentTarget =
    Boolean(user) &&
    lastScanInput.current === playerInput.trim().toLocaleLowerCase();
  const scanButtonLabel = isBusy
    ? "Scanning…"
    : scanErrorCode === "rateLimited" && isCurrentTarget && missingSelectedCategories.length
      ? `Retry ${missingSelectedCategories.length} unfinished ${missingSelectedCategories.length === 1 ? "category" : "categories"}`
    : isCurrentTarget && missingSelectedCategories.length
      ? `Load ${missingSelectedCategories.length} new ${missingSelectedCategories.length === 1 ? "category" : "categories"}`
      : isCurrentTarget
        ? "Scan selected categories"
        : "Scan inventory";

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand brand-button" onClick={() => setActivePage("inventory")} type="button" aria-label="Inventory Lens home">
          <span className="brand-mark" aria-hidden="true">
            <img alt="" src="./icons/icon-48.png" />
          </span>
          <span>
            <strong>Inventory Lens</strong>
          </span>
        </button>
        <nav className="dashboard-nav" aria-label="Dashboard pages">
          <button
            aria-current={activePage === "inventory" ? "page" : undefined}
            className={activePage === "inventory" ? "active" : ""}
            onClick={() => setActivePage("inventory")}
            type="button"
          >Inventory</button>
          <button
            aria-current={activePage === "graphic" ? "page" : undefined}
            className={activePage === "graphic" ? "active" : ""}
            onClick={() => setActivePage("graphic")}
            type="button"
          >Graphic Builder</button>
        </nav>
        <div className="topbar-meta">
          <a
            aria-label="Open Inventory Lens source on GitHub"
            className="source-link"
            href={SOURCE_REPOSITORY_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span>Open sourced</span>
            <Icon name="external" />
          </a>
          <button className="about-trigger" onClick={() => setAboutOpen(true)} ref={aboutTriggerRef} type="button">
            About
          </button>
        </div>
      </header>

      <main>
        {activePage === "graphic" ? (
          <GraphicBuilder
            draft={graphicDraft}
            items={items}
            onBack={() => setActivePage("inventory")}
            offSaleSummary={{
              uniqueItems: selectedOffSale.uniqueItems,
              ownedCopies: selectedOffSale.ownedCopies,
              complete: missingSelectedCategories.length === 0,
            }}
            setDraft={setGraphicDraft}
            user={user}
          />
        ) : (
          <>
        <section className="scanner-panel" aria-labelledby="scanner-title">
          <div className="scanner-heading">
            <h1 id="scanner-title">Scan inventory</h1>
            <p>Count copies and review off-sale, gift, and collector signals.</p>
          </div>

          <form className="player-search" onSubmit={startScan}>
            <label htmlFor="player-input">Player</label>
            <div className="search-row">
              <div className="input-with-icon player-input">
                <Icon name="search" />
                <input
                  autoCapitalize="off"
                  autoComplete="off"
                  id="player-input"
                  onChange={(event) => setPlayerInput(event.target.value)}
                  placeholder="Username, user ID, or profile URL"
                  spellCheck={false}
                  value={playerInput}
                />
              </div>
              <button className="button primary scan-button" disabled={isBusy} type="submit">
                {scanButtonLabel} <Icon name="arrow" />
              </button>
            </div>
          </form>
        </section>

        <div className="workspace">
          <aside className={`category-sidebar${mobileCategoriesOpen ? " mobile-open" : ""}`} aria-label="Inventory category filters">
            <div className="sidebar-heading">
              <div>
                <h2>Categories</h2>
              </div>
              <span>{selectedCategories.size} selected</span>
              <button
                aria-controls="inventory-category-list"
                aria-expanded={mobileCategoriesOpen}
                className="mobile-category-toggle"
                onClick={() => setMobileCategoriesOpen((current) => !current)}
                type="button"
              >
                {mobileCategoriesOpen ? "Hide" : "Show"}
                <Icon name="chevron" />
              </button>
            </div>

            <div className="preset-grid" aria-label="Category presets">
              <button onClick={() => handlePreset(CATEGORY_PRESETS.all)} type="button">All</button>
              <button onClick={() => handlePreset(CATEGORY_PRESETS.avatar)} type="button">Avatar only</button>
              <button onClick={() => handlePreset(CATEGORY_PRESETS.noClassicClothing)} type="button">No classic clothing</button>
              <button onClick={() => handlePreset(CATEGORY_PRESETS.clear)} type="button">Clear</button>
            </div>
            <div className="category-list" id="inventory-category-list">
              {[...categoriesByGroup].map(([group, categories]) => (
                <CategoryGroup
                  categories={categories}
                  itemCounts={itemCounts}
                  key={group}
                  name={group}
                  onCategoryChange={handleCategoryChange}
                  onGroupChange={handleGroupChange}
                  selected={selectedCategories}
                />
              ))}
            </div>

            {isCurrentTarget && missingSelectedCategories.length > 0 && !isBusy ? (
              <button className="button secondary sidebar-load" onClick={() => void startScan()} type="button">
                {scanErrorCode === "rateLimited" ? "Retry" : "Load"} {missingSelectedCategories.length} {scanErrorCode === "rateLimited" ? "unfinished" : "new"}
                <Icon name="arrow" />
              </button>
            ) : null}
          </aside>

          <section className="results" aria-labelledby="results-heading">
            {isBusy ? (
              <section className="scan-progress" aria-live="polite" role="status">
                <div className="progress-icon">
                  <span className={scanState === "scanning" ? "spinner" : "paused-bars"} />
                </div>
                <div className="progress-copy">
                  <div className="progress-heading">
                    <div>
                      <span className="section-kicker">
                        {progress.phase}
                        {scanStage.total > 1
                          ? ` · stage ${scanStage.current} of ${scanStage.total}`
                          : ""}
                      </span>
                      <h2>{scanState === "paused" ? "Scan paused" : progress.message}</h2>
                    </div>
                    <strong>{formatCount(progress.records)} records</strong>
                  </div>
                  <div
                    aria-label="Inventory scan in progress"
                    aria-valuetext={`${progress.pages} pages and ${progress.records} records loaded`}
                    className="progress-track"
                    role="progressbar"
                  >
                    <span />
                  </div>
                  <p>
                    Page {formatCount(progress.pages)} · Results appear when this scan segment finishes.
                  </p>
                </div>
                <div className="progress-actions">
                  <button className="button ghost" onClick={togglePause} type="button">
                    <Icon name={scanState === "paused" ? "play" : "pause"} />
                    {scanState === "paused" ? "Resume" : "Pause"}
                  </button>
                  <button className="button ghost danger" onClick={cancelScan} type="button">
                    <Icon name="stop" /> Stop
                  </button>
                </div>
              </section>
            ) : null}

            {scanError ? (
              <div className="notice error-notice" role="alert">
                <Icon name="warning" />
                <div><strong>Couldn’t complete that request</strong><p>{scanError}</p></div>
                <div className="notice-actions">
                  {scanErrorCode === "rateLimited" ? (
                    <button
                      className="button secondary"
                      disabled={isBusy}
                      onClick={() => void startScan()}
                      type="button"
                    >
                      Retry unfinished
                    </button>
                  ) : null}
                  <button
                    aria-label="Dismiss error"
                    className="notice-dismiss"
                    onClick={() => {
                      setScanError("");
                      setScanErrorCode(null);
                    }}
                    type="button"
                  >×</button>
                </div>
              </div>
            ) : null}

            {warnings.length > 0 ? (
              <div className="notice warning-notice">
                <Icon name="warning" />
                <div>
                  <strong>Scan completed with {warnings.length} {warnings.length === 1 ? "note" : "notes"}</strong>
                  <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                </div>
              </div>
            ) : null}

            {user ? (
              <>
                <section className="profile-summary">
                  <div className="profile-identity">
                    <div className="avatar">
                      {user.thumbnailUrl ? <img alt="" src={user.thumbnailUrl} /> : <Icon name="user" />}
                    </div>
                    <div>
                      <span className="section-kicker">Inventory owner</span>
                      <h2 id="results-heading">
                        {user.displayName}
                        {user.hasVerifiedBadge ? <span className="verified" title="Verified account">✓</span> : null}
                      </h2>
                      <p>@{user.name} · User {user.id}</p>
                    </div>
                  </div>
                  <div className="profile-stats">
                    <div><strong>{formatCount(items.length)}</strong><span>Unique items</span></div>
                    <div><strong>{formatCount(ownedCopies)}</strong><span>Owned copies</span></div>
                    <div><strong>{formatCount(duplicateItems)}</strong><span>Duplicates</span></div>
                    <div><strong>{formatCount(knownSupplyItems)}</strong><span>Known supply</span></div>
                    <div><strong>{formatCount(collectorItems)}</strong><span>Collector picks</span></div>
                    <div
                      className="off-sale-stat"
                      data-off-sale-copies={selectedOffSale.ownedCopies}
                      data-off-sale-items={selectedOffSale.uniqueItems}
                      title="Confirmed off-sale items in the categories selected in the sidebar"
                    >
                      <strong>{formatCount(selectedOffSale.uniqueItems)}</strong>
                      <span>Off-sale selected</span>
                      <small>{formatCount(selectedOffSale.ownedCopies)} copies</small>
                    </div>
                  </div>
                </section>

                <section className="filter-panel" aria-label="Result filters">
                  <div className="filter-search">
                    <label htmlFor="item-search">Search items</label>
                    <div className="input-with-icon">
                      <Icon name="search" />
                      <input
                        id="item-search"
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search this inventory"
                        type="search"
                        value={query}
                      />
                    </div>
                  </div>
                  <label className="filter-select">
                    <span>Item type</span>
                    <select onChange={(event) => setLimited(event.target.value as LimitedFilter)} value={limited}>
                      <option value="all">Limited & non-limited</option>
                      <option value="limited">Limited only</option>
                      <option value="nonlimited">Non-limited only</option>
                    </select>
                  </label>
                  <label className="filter-select creator-select">
                    <span>Creator</span>
                    <select onChange={(event) => setCreator(event.target.value as CreatorFilter)} value={creator}>
                      <option value="all">All creators</option>
                      <option value="roblox">Roblox only</option>
                    </select>
                  </label>
                  <label className="filter-select sort-select">
                    <span>Sort by</span>
                    <select onChange={(event) => setSort(event.target.value as SortMode)} value={sort}>
                      <option value="rarest">Rarest official supply</option>
                      <option value="collector">Collector rarity estimate</option>
                      <option value="wikiFewest">Fewest direct item wiki purchases</option>
                      <option value="copiesHigh">Most copies owned</option>
                      <option value="copiesLow">Fewest copies owned</option>
                      <option value="newest">Newest acquired</option>
                      <option value="oldest">Oldest acquired</option>
                      <option value="name">Name A–Z</option>
                    </select>
                  </label>
                  <div className="toggle-filters">
                    <label className="toggle-row">
                      <input checked={onlyDuplicates} onChange={(event) => setOnlyDuplicates(event.target.checked)} type="checkbox" />
                      <span className="toggle" aria-hidden="true" />
                      <span>Only duplicates</span>
                    </label>
                    <label
                      className="toggle-row"
                      title="Shows off-sale items with strong collector signals such as event exclusivity, age, and popularity."
                    >
                      <input
                        aria-label="Only collector picks"
                        checked={collectorOnly}
                        onChange={(event) => setCollectorOnly(event.target.checked)}
                        type="checkbox"
                      />
                      <span className="toggle" aria-hidden="true" />
                      <span>Collector picks <small>estimated</small></span>
                    </label>
                    <label
                      className="toggle-row"
                      title="Shows only items Roblox explicitly classifies as off-sale; unknown status is hidden."
                    >
                      <input
                        aria-label="Only items confirmed off-sale"
                        checked={onlyOffSale}
                        onChange={(event) => setOnlyOffSale(event.target.checked)}
                        type="checkbox"
                      />
                      <span className="toggle" aria-hidden="true" />
                      <span>Only off-sale <small>confirmed only</small></span>
                    </label>
                    <label className="toggle-row">
                      <input checked={knownSupply} onChange={(event) => setKnownSupply(event.target.checked)} type="checkbox" />
                      <span className="toggle" aria-hidden="true" />
                      <span>Known official supply</span>
                    </label>
                  </div>
                </section>

                <div className="results-meta">
                  <div>
                    <Icon name="sliders" />
                    Showing <strong>{formatCount(filteredItems.length)}</strong> of {formatCount(items.length)} items
                    <span
                      className="off-sale-total"
                      title="Confirmed off-sale total for the categories selected in the sidebar"
                    >
                      <strong>{formatCount(selectedOffSale.uniqueItems)}</strong> off-sale
                      <span>·</span>
                      {formatCount(selectedOffSale.ownedCopies)} copies
                      <small>{missingSelectedCategories.length ? "load pending" : "selected categories"}</small>
                    </span>
                  </div>
                  <p>
                    {collectorOnly || sort === "collector"
                      ? "Collector ratings estimate significance from item history, age, availability, and popularity; they are not supply or owner counts."
                      : onlyOffSale
                      ? "Only items confirmed off-sale are shown; unknown status is excluded."
                      : collectorItems > 0
                      ? "Collector ratings are explainable estimates, not supply or current owner counts."
                      : hasWikiPurchaseMetrics
                      ? "Wiki and source-gift purchases are historical, not current copies or owners; official supply still drives rarity."
                      : "Unknown supply always sorts last."}
                  </p>
                </div>

                {filteredItems.length ? (
                  <div className="item-grid">
                    {filteredItems.map((item) => (
                      <ItemCard
                        categoryLabel={categoryLabelById.get(item.categoryId) ?? "Inventory item"}
                        item={item}
                        key={item.key}
                      />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="empty-state compact-empty">
                    <div className="empty-icon"><Icon name="inventory" /></div>
                    <h2>No items found in this scan</h2>
                    <p>The selected categories may be empty. Enable more categories in the sidebar to load and merge them.</p>
                  </div>
                ) : (
                  <div className="empty-state compact-empty">
                    <div className="empty-icon"><Icon name="search" /></div>
                    <h2>No items match these filters</h2>
                    <p>Try a broader search, re-enable a category, or clear the duplicate, collector, off-sale, and supply filters.</p>
                    <button className="button secondary" onClick={() => {
                      setQuery(DEFAULT_RESULT_FILTERS.query);
                      setOnlyDuplicates(DEFAULT_RESULT_FILTERS.onlyDuplicates);
                      setOnlyOffSale(DEFAULT_RESULT_FILTERS.onlyOffSale);
                      setCollectorOnly(DEFAULT_RESULT_FILTERS.collectorOnly);
                      setLimited(DEFAULT_RESULT_FILTERS.limited);
                      setCreator(DEFAULT_RESULT_FILTERS.creator);
                      setKnownSupply(DEFAULT_RESULT_FILTERS.knownSupply);
                      handlePreset(CATEGORY_PRESETS.all);
                    }} type="button">Reset filters</button>
                  </div>
                )}
              </>
            ) : !isBusy ? (
              <div className="empty-state compact-empty initial-empty">
                <h2>No inventory loaded</h2>
                <p>Enter a username, user ID, or profile URL, then scan the selected categories.</p>
              </div>
            ) : null}
          </section>
        </div>
          </>
        )}
      </main>

      {aboutOpen ? (
        <div
          className="about-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAboutOpen(false);
          }}
        >
          <section aria-describedby="about-intro" aria-labelledby="about-title" aria-modal="true" className="about-panel" ref={aboutDialogRef} role="dialog">
            <div className="about-heading">
              <div>
                <span className="section-kicker">About & privacy</span>
                <h2 id="about-title">Inventory Lens</h2>
              </div>
              <button aria-label="Close About and privacy" className="about-close" onClick={() => setAboutOpen(false)} type="button">×</button>
            </div>
            <p className="about-intro" id="about-intro">
              Inventory Lens analyzes public Roblox inventory data in your browser and keeps distinct metrics separately labeled.
            </p>
            <ul className="privacy-list">
              <li>No Inventory Lens account is required or created.</li>
              <li>Inventory Lens does not sign in to Roblox or request your Roblox login.</li>
              <li>There are no analytics, telemetry, or results sent to the developer.</li>
              <li>Scan results are processed in this browser tab and are not stored in an Inventory Lens database.</li>
              {webDeployment ? (
                <>
                  <li>Public Roblox and Fandom API requests pass through this deployment&apos;s stateless, same-origin Vercel Function so normal websites can satisfy browser CORS rules.</li>
                  <li>The function receives the selected player identifier, required public API paths, catalog IDs, and wiki item-title lookups in transit. It has no app-level storage, account, API key, telemetry, or result logging.</li>
                  <li>Vercel, Roblox, and Fandom may receive ordinary network metadata such as IP addresses and request headers under their own policies. Roblox image-CDN files load directly in your browser.</li>
                  <li>Report data, Graphic Builder draft, controls, and caches stay in this tab&apos;s memory and are discarded when the tab reloads or closes.</li>
                </>
              ) : (
                <>
                  <li>Roblox and Fandom are contacted directly only for required public data. They may receive normal request metadata, such as your IP address and browser request headers.</li>
                  <li>Fandom receives item-title lookups derived from the scanned inventory, but not the player identity or full inventory payload.</li>
                  <li>Report, Graphic Builder draft, controls, and caches stay locally in the extension context; only a reusable numeric dashboard tab ID is stored in browser session storage.</li>
                </>
              )}
              <li>Graphic Builder images are composed locally in a canvas, and the exported PNG is created and downloaded on your device.</li>
              <li>Clear local data resets the report, Graphic Builder draft, controls, and in-memory caches{webDeployment ? "." : " and clears the dashboard tab ID."}</li>
              <li>The source code is publicly available under the MIT License.</li>
            </ul>
            <div className="clear-data-row">
              <div>
                <strong>Clear local data</strong>
                <p>{webDeployment
                  ? "Remove this report and reset dashboard controls and in-memory data in this tab."
                  : "Remove this report, reset dashboard controls, and clear extension session metadata on this device."}</p>
                <span aria-live="polite" role="status">{clearStatus}</span>
              </div>
              <button className="button secondary danger-outline" onClick={() => void clearLocalData()} type="button">
                Clear local data
              </button>
            </div>
            <small className="about-disclaimer">Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.</small>
          </section>
        </div>
      ) : null}

      <footer>
        <p>Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.</p>
        <span>Official supply and wiki purchase history stay separately labeled.</span>
      </footer>
    </div>
  );
}
