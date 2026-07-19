import { RobloxHttpClient, throwIfAborted } from "./http";
import { endpointPathSegment, endpointUrl } from "./endpoints";
import type { InventoryPageProgress, PaginatedInventoryResult } from "./inventory";
import { ScanError } from "./types";

interface CursorPage<T> {
  data?: T[];
  nextPageCursor?: string;
}

export interface LegacyAssetItem {
  assetTypeId: number;
  userAssetId?: number | string;
  assetId?: number | string;
  assetName?: string;
  collectibleItemId?: string;
  collectibleItemInstanceId?: string;
  serialNumber?: number;
  created?: string;
  updated?: string;
}

/** Backwards-compatible name for the same public asset payload. */
export type LegacyMakeupItem = LegacyAssetItem;

export interface OwnedBundle {
  id?: number | string;
  name?: string;
  bundleType?: string;
  creator?: { name?: string };
}

export interface CreatedPlace {
  universeId?: number | string;
  placeId?: number | string;
  name?: string;
  creator?: { name?: string };
  priceInRobux?: number;
}

export interface LegacyAdapterOptions {
  userId: string;
  client: RobloxHttpClient;
  signal?: AbortSignal;
  waitIfPaused?: () => Promise<void>;
  onPage?: (progress: InventoryPageProgress & { assetTypeId?: number }) => void | Promise<void>;
  onWarning?: (warning: string) => void;
  /** Testable safety ceilings shared across a single adapter call. */
  maxPages?: number;
  maxItems?: number;
}

export const DEFAULT_MAX_INVENTORY_PAGES = 1_000;
export const DEFAULT_MAX_INVENTORY_ITEMS = 100_000;

function paginationLimit(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}

export interface PublicAssetInventoryResult extends PaginatedInventoryResult<LegacyAssetItem> {
  completedAssetTypeIds: number[];
  partialAssetTypeIds: number[];
  failedAssetTypeIds: number[];
  deniedAssetTypeIds: number[];
  unscannedAssetTypeIds: number[];
}

async function listCursorPages<T>(
  buildUrl: (cursor?: string) => URL,
  options: LegacyAdapterOptions,
  inventoryRequest: boolean,
  assetTypeId?: number,
): Promise<PaginatedInventoryResult<T>> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor = "";
  let pages = 0;
  const maxPages = paginationLimit(options.maxPages, DEFAULT_MAX_INVENTORY_PAGES, "maxPages");
  const maxItems = paginationLimit(options.maxItems, DEFAULT_MAX_INVENTORY_ITEMS, "maxItems");

  while (true) {
    throwIfAborted(options.signal);
    await options.waitIfPaused?.();
    throwIfAborted(options.signal);

    if (cursor) {
      if (seen.has(cursor)) return { items, pages, stoppedBecause: "repeatedToken" };
      seen.add(cursor);
    }

    let response: CursorPage<T>;
    try {
      response = await options.client.json<CursorPage<T>>(
        buildUrl(cursor || undefined),
        { signal: options.signal },
        { inventoryRequest },
      );
    } catch (error) {
      if (error instanceof ScanError && error.code === "rateLimited") {
        return { items, pages, stoppedBecause: "rateLimited" };
      }
      if (error instanceof ScanError && error.code === "network") {
        return { items, pages, stoppedBecause: "network" };
      }
      throw error;
    }

    pages += 1;
    const pageItems = Array.isArray(response.data) ? response.data : [];
    if (pageItems.length === 0) {
      await options.onPage?.({ page: pages, totalRecords: items.length, assetTypeId });
      return { items, pages, stoppedBecause: "emptyPage" };
    }

    const remainingCapacity = maxItems - items.length;
    if (pageItems.length > remainingCapacity) {
      items.push(...pageItems.slice(0, remainingCapacity));
      await options.onPage?.({ page: pages, totalRecords: items.length, assetTypeId });
      return { items, pages, stoppedBecause: "safetyLimit" };
    }
    items.push(...pageItems);
    const nextPageToken = response.nextPageCursor?.trim() || undefined;
    await options.onPage?.({ page: pages, totalRecords: items.length, nextPageToken, assetTypeId });
    if (!nextPageToken) return { items, pages };
    if (pages >= maxPages || items.length >= maxItems) {
      return { items, pages, stoppedBecause: "safetyLimit" };
    }
    if (seen.has(nextPageToken)) return { items, pages, stoppedBecause: "repeatedToken" };
    cursor = nextPageToken;
  }
}

/**
 * Enumerates selected public asset types one at a time. Invalid types are
 * isolated; persistent throttling/network failures return all safe pages and
 * stop before hammering every remaining type.
 */
export async function listPublicAssets(
  assetTypeIds: readonly number[],
  options: LegacyAdapterOptions,
): Promise<PublicAssetInventoryResult> {
  const orderedIds = [...new Set(assetTypeIds)];
  const items: LegacyAssetItem[] = [];
  const completedAssetTypeIds: number[] = [];
  const partialAssetTypeIds: number[] = [];
  const failedAssetTypeIds: number[] = [];
  const deniedAssetTypeIds: number[] = [];
  let unscannedAssetTypeIds: number[] = [];
  let pages = 0;
  let stoppedBecause: PublicAssetInventoryResult["stoppedBecause"];
  const maxPages = paginationLimit(options.maxPages, DEFAULT_MAX_INVENTORY_PAGES, "maxPages");
  const maxItems = paginationLimit(options.maxItems, DEFAULT_MAX_INVENTORY_ITEMS, "maxItems");

  for (let index = 0; index < orderedIds.length; index += 1) {
    if (pages >= maxPages || items.length >= maxItems) {
      unscannedAssetTypeIds = orderedIds.slice(index);
      stoppedBecause = "safetyLimit";
      options.onWarning?.("The public inventory safety limit was reached; completed items were kept.");
      break;
    }
    const assetTypeId = orderedIds[index]!;
    let result: PaginatedInventoryResult<Omit<LegacyAssetItem, "assetTypeId">>;
    try {
      result = await listCursorPages<Omit<LegacyAssetItem, "assetTypeId">>(
        (cursor) => {
          const url = new URL(
            endpointUrl(
              "inventory",
              `/v2/users/${endpointPathSegment(options.userId)}/inventory/${endpointPathSegment(assetTypeId)}`,
            ),
          );
          url.searchParams.set("limit", "100");
          url.searchParams.set("sortOrder", "Asc");
          if (cursor) url.searchParams.set("cursor", cursor);
          return url;
        },
        {
          ...options,
          maxPages: maxPages - pages,
          maxItems: maxItems - items.length,
        },
        true,
        assetTypeId,
      );
    } catch (error) {
      if (error instanceof ScanError && (error.code === "cancelled" || error.code === "privateInventory")) throw error;
      if (error instanceof ScanError && error.code === "permissionDenied") {
        failedAssetTypeIds.push(assetTypeId);
        deniedAssetTypeIds.push(assetTypeId);
        options.onWarning?.(
          `Roblox denied anonymous access to inventory asset type ${assetTypeId}; the scan continued with later types.`,
        );
        continue;
      }
      if (error instanceof ScanError && (error.status === 400 || error.status === 404)) {
        failedAssetTypeIds.push(assetTypeId);
        options.onWarning?.(`Roblox did not support public inventory asset type ${assetTypeId}; the scan continued.`);
        continue;
      }
      unscannedAssetTypeIds = orderedIds.slice(index);
      stoppedBecause = error instanceof ScanError && error.code === "rateLimited" ? "rateLimited" : "network";
      options.onWarning?.("Roblox interrupted public asset enumeration; already loaded asset types were kept.");
      break;
    }

    pages += result.pages;
    items.push(...result.items.map((item) => ({ ...item, assetTypeId })));
    if (
      result.stoppedBecause === "rateLimited" ||
      result.stoppedBecause === "network" ||
      result.stoppedBecause === "safetyLimit"
    ) {
      if (result.pages > 0 || result.items.length > 0) partialAssetTypeIds.push(assetTypeId);
      else unscannedAssetTypeIds.push(assetTypeId);
      unscannedAssetTypeIds.push(...orderedIds.slice(index + 1));
      stoppedBecause = result.stoppedBecause;
      options.onWarning?.(
        result.stoppedBecause === "rateLimited"
          ? "Roblox kept rate limiting public inventory pages; already loaded asset types were kept."
          : result.stoppedBecause === "safetyLimit"
            ? "The public inventory safety limit was reached; completed items were kept."
          : "Roblox interrupted public inventory pages; already loaded asset types were kept.",
      );
      break;
    }
    if (result.stoppedBecause === "repeatedToken") {
      partialAssetTypeIds.push(assetTypeId);
      stoppedBecause ||= "repeatedToken";
      options.onWarning?.(`Roblox repeated the cursor for asset type ${assetTypeId}; that type stopped safely.`);
    } else {
      completedAssetTypeIds.push(assetTypeId);
    }
  }

  return {
    items,
    pages,
    stoppedBecause,
    completedAssetTypeIds,
    partialAssetTypeIds,
    failedAssetTypeIds,
    deniedAssetTypeIds,
    unscannedAssetTypeIds: [...new Set(unscannedAssetTypeIds)],
  };
}

/** Compatibility wrapper retained for the makeup leaf categories. */
export async function listLegacyMakeup(
  assetTypeIds: readonly number[],
  options: LegacyAdapterOptions,
): Promise<PaginatedInventoryResult<LegacyMakeupItem>> {
  const result = await listPublicAssets(assetTypeIds, options);
  return {
    items: result.items,
    pages: result.pages,
    stoppedBecause: result.stoppedBecause,
  };
}

export function listOwnedBundles(options: LegacyAdapterOptions): Promise<PaginatedInventoryResult<OwnedBundle>> {
  return listCursorPages<OwnedBundle>(
    (cursor) => {
      const url = endpointUrl("catalog", `/v1/users/${endpointPathSegment(options.userId)}/bundles`);
      url.searchParams.set("limit", "100");
      url.searchParams.set("sortOrder", "1");
      if (cursor) url.searchParams.set("cursor", cursor);
      return url;
    },
    options,
    true,
  );
}

/** Public Created tab. MyGames/OtherGames require authorization. */
export function listCreatedPlaces(options: LegacyAdapterOptions): Promise<PaginatedInventoryResult<CreatedPlace>> {
  return listCursorPages<CreatedPlace>(
    (cursor) => {
      const url = endpointUrl("inventory", `/v1/users/${endpointPathSegment(options.userId)}/places/inventory`);
      url.searchParams.set("itemsPerPage", "100");
      url.searchParams.set("placesTab", "Created");
      if (cursor) url.searchParams.set("cursor", cursor);
      return url;
    },
    options,
    true,
  );
}
