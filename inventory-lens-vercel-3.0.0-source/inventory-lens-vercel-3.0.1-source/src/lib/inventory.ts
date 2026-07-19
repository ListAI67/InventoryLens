import { RobloxHttpClient } from "./http";
import { endpointPathSegment, endpointUrl } from "./endpoints";

export interface InventoryPageProgress {
  page: number;
  totalRecords: number;
  nextPageToken?: string;
}

export interface PaginatedInventoryResult<T> {
  items: T[];
  pages: number;
  stoppedBecause?: "emptyPage" | "repeatedToken" | "rateLimited" | "network" | "safetyLimit";
}

interface LegacyVisibilityResponse {
  canView?: boolean;
  canViewInventory?: boolean;
}

/** Roblox's public, read-only inventory privacy signal. */
export async function canViewInventory(options: {
  userId: string;
  client: RobloxHttpClient;
  signal?: AbortSignal;
}): Promise<boolean | undefined> {
  const response = await options.client.json<LegacyVisibilityResponse>(
    endpointUrl("inventory", `/v1/users/${endpointPathSegment(options.userId)}/can-view-inventory`),
    { signal: options.signal },
    { inventoryRequest: true },
  );
  return typeof response.canView === "boolean" ? response.canView : response.canViewInventory;
}
