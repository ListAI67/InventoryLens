import {
  getCategory,
  includesBundles,
  legacyAssetTypeIdsForCategoryId,
  selectedCategories,
  selectedLegacyAssetTypeIds,
  selectedUnsupportedPublicCategoryIds,
} from "./categories";
import { fandomItemRequestsForRecords, fetchFandomItemMetadata } from "./fandom";
import { groupInventoryRecords } from "./grouping";
import { RobloxHttpClient, throwIfAborted, type FetchLike } from "./http";
import { canViewInventory } from "./inventory";
import { listCreatedPlaces, listOwnedBundles, listPublicAssets } from "./legacy";
import {
  catalogRequestsForRecords,
  fetchCatalogMetadata,
  fetchThumbnails,
} from "./metadata";
import { normalizeBundles, normalizeCreatedPlaces, normalizeLegacyAssets } from "./normalize";
import {
  ScanError,
  type CatalogItemMetadata,
  type FandomItemMetadata,
  type GroupedInventoryItem,
  type NormalizedInventoryRecord,
  type ResolvedUser,
  type ScanCoverage,
  type ScanProgress,
} from "./types";
import { resolveUserInput } from "./users";

export interface ScanOptions {
  input: string;
  categoryIds: string[];
  signal?: AbortSignal;
  /** Called at every safe page/batch boundary. Resolve it to continue. */
  waitIfPaused?: () => Promise<void>;
  onProgress?: (progress: ScanProgress) => void;
  fetch?: FetchLike;
  /** Reuses rate-limit cooldown state across sequential category stages. */
  client?: RobloxHttpClient;
  /** Reuses a user already resolved by an earlier segment in the same run. */
  resolvedUser?: ResolvedUser;
  /** Safe only after this exact user's visibility was checked earlier in the run. */
  skipVisibilityCheck?: boolean;
}

export interface ScanResult {
  user: ResolvedUser;
  items: GroupedInventoryItem[];
  records: NormalizedInventoryRecord[];
  warnings: string[];
  coverage: ScanCoverage;
}

export interface PauseGate {
  pause(): void;
  resume(): void;
  waitIfPaused(): Promise<void>;
  readonly isPaused: boolean;
}

/** In-memory pause controller. AbortSignal remains the cancellation mechanism. */
export function createPauseGate(): PauseGate {
  let paused = false;
  const waiters = new Set<() => void>();
  return {
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      for (const resolve of waiters) resolve();
      waiters.clear();
    },
    waitIfPaused() {
      if (!paused) return Promise.resolve();
      return new Promise<void>((resolve) => waiters.add(resolve));
    },
    get isPaused() {
      return paused;
    },
  };
}

function shouldRethrowEnrichmentError(error: unknown): boolean {
  return error instanceof ScanError && error.code === "cancelled";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function categoryDescription(categoryId: string): string {
  const category = getCategory(categoryId);
  if (!category) return categoryId;
  return category.group === category.label
    ? category.label
    : `${category.group}: ${category.label}`;
}

/**
 * Scans only Roblox endpoints that permit anonymous, cookie-free reads. Asset
 * copies are enumerated one numeric AssetType at a time because that endpoint
 * is the public response that includes the exact userAssetId for every copy.
 */
export async function scanInventory(options: ScanOptions): Promise<ScanResult> {
  const warnings: string[] = [];
  const scannedCategoryIds: string[] = [];
  const partialCategoryIds: string[] = [];
  const deniedCategoryIds: string[] = [];
  const unsupportedCategoryIds = selectedUnsupportedPublicCategoryIds(options.categoryIds);
  let pages = 0;
  let latestPhase: ScanProgress["phase"] = "idle";
  let latestRecords = 0;
  let latestCheckpoint: ScanProgress["checkpoint"];
  const progress = (update: Omit<ScanProgress, "pages"> & { pages?: number }) => {
    latestPhase = update.phase;
    latestRecords = update.records;
    if (update.checkpoint) latestCheckpoint = update.checkpoint;
    options.onProgress?.({ ...update, pages: update.pages ?? pages });
  };

  // Public inventory scans should not wait through an unbounded series of
  // throttles. One header-aware retry is attempted; adapters then return the
  // completed pages and mark unfinished categories as partial.
  const client = options.client ?? new RobloxHttpClient({
      fetch: options.fetch,
      maxRateLimitRetries: 1,
      onRateLimit: ({ delayMs }) => {
        const seconds = Math.max(1, Math.ceil(delayMs / 1_000));
        options.onProgress?.({
          phase: latestPhase === "idle" ? "resolving" : latestPhase,
          pages,
          records: latestRecords,
          message: `Roblox asked us to wait ${seconds} ${seconds === 1 ? "second" : "seconds"}; retrying this page once...`,
          checkpoint: latestCheckpoint,
        });
      },
    });

  progress({
    phase: "resolving",
    records: 0,
    message: options.resolvedUser ? "Using resolved Roblox user..." : "Resolving Roblox user...",
  });
  const user = options.resolvedUser ?? await resolveUserInput(options.input, { client, signal: options.signal });

  await options.waitIfPaused?.();
  throwIfAborted(options.signal);
  if (!options.skipVisibilityCheck) {
    progress({ phase: "inventory", records: 0, message: "Checking public inventory visibility..." });
    try {
      const visibility = await canViewInventory({ userId: user.id, client, signal: options.signal });
      if (visibility === false) {
        throw new ScanError(
          "privateInventory",
          "Roblox reports that this player's inventory is private.",
          403,
        );
      }
      if (visibility === undefined) {
        warnings.push("Roblox did not return a clear inventory-visibility value; public categories were tried directly.");
      }
    } catch (error) {
      if (
        !(error instanceof ScanError) ||
        error.code === "cancelled" ||
        error.code === "privateInventory"
      ) {
        throw error;
      }
      warnings.push(
        "Roblox's inventory-visibility check was unavailable; public categories were tried directly.",
      );
    }
  }

  if (unsupportedCategoryIds.length) {
    const labels = unsupportedCategoryIds.map(categoryDescription).join(", ");
    warnings.push(
      `${labels} ${unsupportedCategoryIds.length === 1 ? "is" : "are"} unavailable through Roblox's public no-login inventory APIs and ${unsupportedCategoryIds.length === 1 ? "was" : "were"} skipped.`,
    );
  }

  const records: NormalizedInventoryRecord[] = [];
  const assetTypeIds = selectedLegacyAssetTypeIds(options.categoryIds);
  const assetCategories = selectedCategories(options.categoryIds).filter((category) =>
    legacyAssetTypeIdsForCategoryId(category.id).length > 0 &&
    !unsupportedCategoryIds.includes(category.id),
  );

  if (assetTypeIds.length) {
    progress({ phase: "inventory", records: 0, message: "Loading exact public asset copies..." });
    const totalsByType = new Map<number, number>();
    const publicAssets = await listPublicAssets(assetTypeIds, {
      userId: user.id,
      client,
      signal: options.signal,
      waitIfPaused: options.waitIfPaused,
      onWarning: (warning) => warnings.push(warning),
      onPage: ({ totalRecords, nextPageToken, assetTypeId }) => {
        pages += 1;
        if (assetTypeId !== undefined) totalsByType.set(assetTypeId, totalRecords);
        const loaded = [...totalsByType.values()].reduce((sum, value) => sum + value, 0);
        progress({
          phase: "inventory",
          records: loaded,
          message: `Loaded ${loaded.toLocaleString()} exact asset ${loaded === 1 ? "copy" : "copies"}...`,
          checkpoint: { source: "assets", pageToken: nextPageToken, assetTypeId },
        });
      },
    });
    records.push(...normalizeLegacyAssets(publicAssets.items));

    const unfinishedTypes = new Set([
      ...publicAssets.partialAssetTypeIds,
      ...publicAssets.failedAssetTypeIds,
      ...publicAssets.unscannedAssetTypeIds,
    ]);
    const deniedTypes = new Set(publicAssets.deniedAssetTypeIds);
    for (const category of assetCategories) {
      const ids = legacyAssetTypeIdsForCategoryId(category.id);
      if (ids.length > 0 && ids.every((id) => deniedTypes.has(id))) {
        deniedCategoryIds.push(category.id);
      } else if (ids.some((id) => unfinishedTypes.has(id) || deniedTypes.has(id))) {
        partialCategoryIds.push(category.id);
      } else {
        scannedCategoryIds.push(category.id);
      }
    }
  }

  if (options.categoryIds.includes("places.created")) {
    progress({ phase: "inventory", records: records.length, message: "Loading created places..." });
    try {
      const places = await listCreatedPlaces({
        userId: user.id,
        client,
        signal: options.signal,
        waitIfPaused: options.waitIfPaused,
        onPage: ({ totalRecords, nextPageToken }) => {
          pages += 1;
          progress({
            phase: "inventory",
            records: records.length + totalRecords,
            message: "Loading created places...",
            checkpoint: { source: "places", pageToken: nextPageToken },
          });
        },
      });
      records.push(...normalizeCreatedPlaces(places.items));
      if (places.stoppedBecause === "rateLimited" || places.stoppedBecause === "network" || places.stoppedBecause === "repeatedToken" || places.stoppedBecause === "safetyLimit") {
        partialCategoryIds.push("places.created");
        warnings.push("Created places were only partially loaded; completed pages were kept.");
      } else {
        scannedCategoryIds.push("places.created");
      }
    } catch (error) {
      if (error instanceof ScanError && (error.code === "cancelled" || error.code === "privateInventory")) throw error;
      if (error instanceof ScanError && error.code === "permissionDenied") {
        deniedCategoryIds.push("places.created");
        warnings.push("Roblox denied anonymous access to created places; other public inventory results were kept.");
      } else {
        partialCategoryIds.push("places.created");
        warnings.push("Created places were unavailable; other public inventory results were kept.");
      }
    }
  }

  if (includesBundles(options.categoryIds)) {
    progress({ phase: "inventory", records: records.length, message: "Loading owned bundles..." });
    try {
      const bundles = await listOwnedBundles({
        userId: user.id,
        client,
        signal: options.signal,
        waitIfPaused: options.waitIfPaused,
        onPage: ({ totalRecords, nextPageToken }) => {
          pages += 1;
          progress({
            phase: "inventory",
            records: records.length + totalRecords,
            message: "Loading owned bundles...",
            checkpoint: { source: "bundles", pageToken: nextPageToken },
          });
        },
      });
      records.push(...normalizeBundles(bundles.items));
      if (bundles.stoppedBecause === "rateLimited" || bundles.stoppedBecause === "network" || bundles.stoppedBecause === "repeatedToken" || bundles.stoppedBecause === "safetyLimit") {
        partialCategoryIds.push("bundles");
        warnings.push("Bundles were only partially loaded; completed pages were kept.");
      } else {
        scannedCategoryIds.push("bundles");
      }
    } catch (error) {
      if (error instanceof ScanError && (error.code === "cancelled" || error.code === "privateInventory")) throw error;
      if (error instanceof ScanError && error.code === "permissionDenied") {
        deniedCategoryIds.push("bundles");
        warnings.push("Roblox denied anonymous access to bundles; other public inventory results were kept.");
      } else {
        partialCategoryIds.push("bundles");
        warnings.push("Bundles were unavailable; other public inventory results were kept.");
      }
    }
  }

  progress({ phase: "metadata", records: records.length, message: "Loading official item details..." });
  let catalog = new Map<string, CatalogItemMetadata>();
  try {
    catalog = await fetchCatalogMetadata(catalogRequestsForRecords(records), {
      client,
      signal: options.signal,
      waitIfPaused: options.waitIfPaused,
      onBatch: (completed, total) => progress({
        phase: "metadata",
        records: records.length,
        message: `Loaded details for ${completed.toLocaleString()} of ${total.toLocaleString()} catalog items...`,
        checkpoint: { source: "metadata" },
      }),
    });
  } catch (error) {
    if (shouldRethrowEnrichmentError(error)) throw error;
    warnings.push("Some catalog details were unavailable; those public counts are shown as unavailable.");
  }

  let fandomItems = new Map<string, FandomItemMetadata>();
  try {
    const fandomRequests = fandomItemRequestsForRecords(records, catalog);
    if (fandomRequests.length) {
      progress({
        phase: "metadata",
        records: records.length,
        message: "Checking Roblox Wiki item history...",
      });
      fandomItems = await fetchFandomItemMetadata(fandomRequests, {
        fetch: options.fetch ?? client.fetch,
        signal: options.signal,
        waitIfPaused: options.waitIfPaused,
        onWarning: (warning) => warnings.push(warning),
        onBatch: (completed, total) => progress({
          phase: "metadata",
          records: records.length,
          message: `Checked ${completed.toLocaleString()} of ${total.toLocaleString()} Roblox Wiki records...`,
          checkpoint: { source: "metadata" },
        }),
      });
    }
  } catch (error) {
    if (shouldRethrowEnrichmentError(error)) throw error;
    warnings.push("Roblox Wiki item history was unavailable; official Roblox results were kept.");
  }

  let thumbnails = new Map<string, string>();
  try {
    thumbnails = await fetchThumbnails(records, {
      client,
      signal: options.signal,
      waitIfPaused: options.waitIfPaused,
      onWarning: (warning) => warnings.push(warning),
      onBatch: (completed, total) => progress({
        phase: "metadata",
        records: records.length,
        message: `Loaded ${completed.toLocaleString()} of ${total.toLocaleString()} thumbnails...`,
        checkpoint: { source: "metadata" },
      }),
    });
  } catch (error) {
    if (shouldRethrowEnrichmentError(error)) throw error;
    warnings.push("Some thumbnails were unavailable.");
  }

  const coverage: ScanCoverage = {
    scannedCategoryIds: unique(scannedCategoryIds),
    partialCategoryIds: unique(partialCategoryIds),
    deniedCategoryIds: unique(deniedCategoryIds),
    unsupportedCategoryIds: unique(unsupportedCategoryIds),
  };
  const items = groupInventoryRecords(records, { catalog, fandomItems, thumbnails });
  progress({ phase: "done", records: records.length, message: `Found ${items.length.toLocaleString()} distinct items.` });
  return { user, items, records, warnings: unique(warnings), coverage };
}

export { mergeGroupedItems } from "./grouping";
