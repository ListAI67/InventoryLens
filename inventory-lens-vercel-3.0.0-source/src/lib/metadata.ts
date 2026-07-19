import { RobloxHttpClient, throwIfAborted } from "./http";
import { BoundedTtlCache } from "./cache";
import { endpointUrl, safeRobloxThumbnailUrl } from "./endpoints";
import { inventoryKey } from "./normalize";
import { ScanError, type CatalogItemMetadata, type NormalizedInventoryRecord } from "./types";

export interface CatalogItemRequest {
  id: string;
  itemType: "Asset" | "Bundle";
}

interface CatalogDetailsResponse {
  data?: Array<{
    id?: number | string;
    itemType?: string;
    name?: string;
    assetType?: string | number;
    bundleType?: string;
    creator?: { name?: string };
    creatorName?: string;
    creatorType?: string;
    creatorTargetId?: number | string;
    itemStatus?: string[];
    itemRestrictions?: string[];
    collectibleItemId?: string;
    totalQuantity?: number;
    price?: number;
    priceStatus?: string;
    isOffSale?: boolean;
    purchaseCount?: number;
    sales?: number;
    favoriteCount?: number;
    itemCreatedUtc?: string;
    description?: string;
  }>;
}

interface ThumbnailApiResponse {
  data?: Array<{
    targetId?: number | string;
    state?: string;
    imageUrl?: string;
  }>;
}

export interface EnrichmentOptions {
  client: RobloxHttpClient;
  signal?: AbortSignal;
  waitIfPaused?: () => Promise<void>;
  onBatch?: (completed: number, total: number) => void | Promise<void>;
  onWarning?: (warning: string) => void;
}

const catalogCache = new BoundedTtlCache<string, CatalogItemMetadata>({
  maxEntries: 4_000,
  ttlMs: 60 * 60 * 1_000,
});
const thumbnailCache = new BoundedTtlCache<string, string>({
  maxEntries: 8_000,
  ttlMs: 30 * 60 * 1_000,
});

export function clearMetadataCaches(): void {
  catalogCache.clear();
  thumbnailCache.clear();
}

export function chunk<T>(values: readonly T[], maximum: number): T[][] {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError("Chunk size must be a positive integer.");
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += maximum) chunks.push(values.slice(index, index + maximum));
  return chunks;
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function catalogRequestKey(request: CatalogItemRequest): string {
  return inventoryKey(request.itemType === "Asset" ? "asset" : "bundle", request.id);
}

export function catalogRequestsForRecords(records: readonly NormalizedInventoryRecord[]): CatalogItemRequest[] {
  const requests: CatalogItemRequest[] = [];
  for (const record of records) {
    if (record.kind === "asset") requests.push({ id: record.id, itemType: "Asset" });
    if (record.kind === "bundle") requests.push({ id: record.id, itemType: "Bundle" });
  }
  return uniqueBy(requests, catalogRequestKey);
}

function mapCatalogItem(item: NonNullable<CatalogDetailsResponse["data"]>[number]): CatalogItemMetadata | undefined {
  if (item.id === undefined || (item.itemType !== "Asset" && item.itemType !== "Bundle")) return undefined;
  const id = String(item.id);
  const key = inventoryKey(item.itemType === "Asset" ? "asset" : "bundle", id);
  return {
    key,
    id,
    itemType: item.itemType,
    name: item.name || `${item.itemType} ${id}`,
    assetType: item.assetType,
    bundleType: item.bundleType,
    creatorName: item.creatorName || item.creator?.name,
    creatorType: item.creatorType,
    creatorTargetId: item.creatorTargetId === undefined ? undefined : String(item.creatorTargetId),
    itemStatus: Array.isArray(item.itemStatus) ? item.itemStatus : [],
    itemRestrictions: Array.isArray(item.itemRestrictions) ? item.itemRestrictions : [],
    collectibleItemId: item.collectibleItemId,
    totalQuantity: item.totalQuantity,
    price: item.price,
    priceStatus: item.priceStatus,
    isOffSale: item.isOffSale,
    sales: item.sales ?? item.purchaseCount,
    favoriteCount: item.favoriteCount,
    createdAt: item.itemCreatedUtc,
    description: item.description,
  };
}

/** Catalog accepts at most 120 items and challenges anonymous POSTs for CSRF once. */
export async function fetchCatalogMetadata(
  requests: readonly CatalogItemRequest[],
  options: EnrichmentOptions,
): Promise<Map<string, CatalogItemMetadata>> {
  const unique = uniqueBy(requests, catalogRequestKey);
  const result = new Map<string, CatalogItemMetadata>();
  const uncached = unique.filter((request) => {
    const cached = catalogCache.get(catalogRequestKey(request));
    if (cached) result.set(cached.key, cached);
    return !cached;
  });
  let completed = unique.length - uncached.length;
  let csrfToken: string | undefined;

  for (const batch of chunk(uncached, 120)) {
    throwIfAborted(options.signal);
    await options.waitIfPaused?.();
    throwIfAborted(options.signal);

    const requestBody = JSON.stringify({
      items: batch.map(({ id, itemType }) => ({ id: Number(id), itemType })),
    });
    const request = async (token?: string) => {
      const headers = new Headers({ "Content-Type": "application/json" });
      if (token) headers.set("x-csrf-token", token);
      return options.client.request(
        endpointUrl("catalog", "/v1/catalog/items/details"),
        { method: "POST", headers, body: requestBody, signal: options.signal },
        { allowStatuses: [403] },
      );
    };

    let response = await request(csrfToken);
    if (response.status === 403) {
      const challengeToken = response.headers.get("x-csrf-token") || undefined;
      if (!challengeToken) throw new ScanError("network", "Roblox rejected the anonymous catalog metadata request.", 403);
      csrfToken = challengeToken;
      response = await request(csrfToken);
      if (response.status === 403) throw new ScanError("network", "Roblox rejected the catalog CSRF challenge.", 403);
    }

    let body: CatalogDetailsResponse;
    try {
      body = (await response.json()) as CatalogDetailsResponse;
    } catch {
      throw new ScanError("network", "Roblox returned unreadable catalog metadata.", response.status);
    }
    for (const raw of body.data ?? []) {
      const metadata = mapCatalogItem(raw);
      if (!metadata) continue;
      result.set(metadata.key, metadata);
      catalogCache.set(metadata.key, metadata);
    }
    completed += batch.length;
    await options.onBatch?.(completed, unique.length);
  }

  return result;
}

type ThumbnailKind = "asset" | "bundle" | "badge" | "gamePass";

function thumbnailEndpoint(kind: ThumbnailKind, ids: readonly string[]): string {
  const joined = ids.join(",");
  switch (kind) {
    case "asset":
      return endpointUrl("thumbnails", "/v1/assets", {
        assetIds: joined,
        returnPolicy: "PlaceHolder",
        size: "420x420",
        format: "Png",
        isCircular: "false",
      }).toString();
    case "bundle":
      return endpointUrl("thumbnails", "/v1/bundles/thumbnails", {
        bundleIds: joined,
        size: "420x420",
        format: "Png",
        isCircular: "false",
      }).toString();
    case "badge":
      return endpointUrl("thumbnails", "/v1/badges/icons", {
        badgeIds: joined,
        size: "150x150",
        format: "Png",
        isCircular: "false",
      }).toString();
    case "gamePass":
      return endpointUrl("thumbnails", "/v1/game-passes", {
        gamePassIds: joined,
        size: "150x150",
        format: "Png",
        isCircular: "false",
      }).toString();
  }
}

export async function fetchThumbnails(
  records: readonly NormalizedInventoryRecord[],
  options: EnrichmentOptions,
): Promise<Map<string, string>> {
  const supported = records.filter(
    (record): record is NormalizedInventoryRecord & { kind: ThumbnailKind } => record.kind !== "privateServer",
  );
  const unique = uniqueBy(supported, ({ key }) => key);
  const result = new Map<string, string>();
  let completed = 0;

  for (const record of unique) {
    const cached = thumbnailCache.get(record.key);
    if (cached) {
      result.set(record.key, cached);
      completed += 1;
    }
  }

  for (const kind of ["asset", "bundle", "badge", "gamePass"] as const) {
    const recordsForKind = unique.filter((record) => record.kind === kind && !result.has(record.key));
    for (const batch of chunk(recordsForKind, 100)) {
      throwIfAborted(options.signal);
      await options.waitIfPaused?.();
      throwIfAborted(options.signal);
      try {
        const response = await options.client.json<ThumbnailApiResponse>(
          thumbnailEndpoint(kind, batch.map(({ id }) => id)),
          { signal: options.signal },
        );
        for (const thumbnail of response.data ?? []) {
          if (thumbnail.targetId === undefined || thumbnail.state !== "Completed") continue;
          const imageUrl = safeRobloxThumbnailUrl(thumbnail.imageUrl);
          if (!imageUrl) continue;
          const key = inventoryKey(kind, String(thumbnail.targetId));
          result.set(key, imageUrl);
          thumbnailCache.set(key, imageUrl);
        }
      } catch (error) {
        if (error instanceof ScanError && (error.code === "cancelled" || error.code === "rateLimited")) throw error;
        options.onWarning?.(`${kind} thumbnails were unavailable for one batch.`);
      }
      completed += batch.length;
      await options.onBatch?.(completed, unique.length);
    }
  }

  return result;
}
