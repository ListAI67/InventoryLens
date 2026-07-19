import {
  LEGACY_ASSET_TYPE_NAME_BY_ID,
  categoryForLegacyAssetType,
} from "./categories";
import type { CreatedPlace, LegacyAssetItem, LegacyMakeupItem, OwnedBundle } from "./legacy";
import type { InventoryKind, NormalizedInventoryRecord } from "./types";

export function inventoryKey(kind: InventoryKind, id: string | number): string {
  return `${kind}:${String(id)}`;
}

/**
 * Converts public legacy assets to copy records using exact userAssetIds.
 * Malformed rows without either identity are skipped, and repeated rows from
 * overlapping/replayed pages are collapsed before grouping.
 */
export function normalizeLegacyAssets(items: readonly LegacyAssetItem[]): NormalizedInventoryRecord[] {
  const byUserAssetId = new Map<string, NormalizedInventoryRecord>();
  for (const item of items) {
    if (item.assetId === undefined || item.assetId === null) continue;
    if (item.userAssetId === undefined || item.userAssetId === null) continue;
    const id = String(item.assetId);
    const instanceId = String(item.userAssetId);
    const record: NormalizedInventoryRecord = {
      key: inventoryKey("asset", id),
      kind: "asset",
      id,
      name: item.assetName,
      assetType: LEGACY_ASSET_TYPE_NAME_BY_ID[item.assetTypeId] ?? `ASSET_TYPE_${item.assetTypeId}`,
      categoryId: categoryForLegacyAssetType(item.assetTypeId)?.id ?? "uncategorized.assets",
      copy: {
        instanceId,
        acquiredAt: item.created,
        serialNumber: item.serialNumber,
        source: "legacy",
      },
    };
    const existing = byUserAssetId.get(instanceId);
    if (!existing || (!existing.copy.acquiredAt && record.copy.acquiredAt)) {
      byUserAssetId.set(instanceId, record);
    }
  }
  return [...byUserAssetId.values()];
}

export function normalizeLegacyMakeup(items: readonly LegacyMakeupItem[]): NormalizedInventoryRecord[] {
  return normalizeLegacyAssets(items);
}

export function normalizeBundles(items: readonly OwnedBundle[]): NormalizedInventoryRecord[] {
  return items.flatMap((item) => {
    if (item.id === undefined || item.id === null) return [];
    const id = String(item.id);
    return [{
      key: inventoryKey("bundle", id),
      kind: "bundle" as const,
      id,
      name: item.name,
      assetType: item.bundleType,
      categoryId: "bundles",
      copy: {
        instanceId: `bundle:${id}`,
        source: "bundle" as const,
      },
    }];
  });
}

export function normalizeCreatedPlaces(items: readonly CreatedPlace[]): NormalizedInventoryRecord[] {
  const byPlaceId = new Map<string, NormalizedInventoryRecord>();
  for (const item of items) {
    if (item.placeId === undefined || item.placeId === null) continue;
    const id = String(item.placeId);
    byPlaceId.set(id, {
      key: inventoryKey("asset", id),
      kind: "asset",
      id,
      name: item.name,
      assetType: "PLACE",
      categoryId: "places.created",
      copy: {
        instanceId: `place:${id}`,
        source: "places",
      },
    });
  }
  return [...byPlaceId.values()];
}
