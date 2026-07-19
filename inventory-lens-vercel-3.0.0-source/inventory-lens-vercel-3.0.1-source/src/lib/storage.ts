/** Current validation/migration contract. No schema marker is persisted. */
export const STORAGE_SCHEMA_VERSION = 2 as const;

export const EXTENSION_STORAGE_KEYS = Object.freeze({
  dashboardTabId: "dashboardTabId",
});

/** Keys used by early API-key builds. They are removed idempotently on start. */
export const DEPRECATED_CREDENTIAL_STORAGE_KEYS = Object.freeze([
  "apiKey",
  "inventoryReadApiKey",
  "robloxInventoryApiKey",
  "robloxInventoryAnalyzerApiKey",
  "robloxInventoryCopyAnalyzerApiKey",
]);

export interface StorageAreaLike {
  get(keys: string | readonly string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | readonly string[]): Promise<void>;
}

export interface ExtensionStorageLike {
  session?: StorageAreaLike;
  local?: StorageAreaLike;
}

function browserStorage(): ExtensionStorageLike {
  if (typeof chrome === "undefined" || !chrome.storage) return {};
  return {
    session: chrome.storage.session as unknown as StorageAreaLike,
    local: chrome.storage.local as unknown as StorageAreaLike,
  };
}

function isTabId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export async function readDashboardTabId(storage: ExtensionStorageLike = browserStorage()): Promise<number | undefined> {
  if (!storage.session) return undefined;
  const stored = await storage.session.get(EXTENSION_STORAGE_KEYS.dashboardTabId);
  const value = stored[EXTENSION_STORAGE_KEYS.dashboardTabId];
  return isTabId(value) ? value : undefined;
}

export async function writeDashboardTabId(
  tabId: number,
  storage: ExtensionStorageLike = browserStorage(),
): Promise<void> {
  if (!isTabId(tabId)) throw new RangeError("Dashboard tab ID must be a positive safe integer.");
  await storage.session?.set({ [EXTENSION_STORAGE_KEYS.dashboardTabId]: tabId });
}

export async function clearDashboardTabId(storage: ExtensionStorageLike = browserStorage()): Promise<void> {
  await storage.session?.remove(EXTENSION_STORAGE_KEYS.dashboardTabId);
}

/**
 * Removes stale credential keys left by pre-no-key builds and validates the
 * sole current session value. It intentionally never reads or logs a secret.
 */
export async function migrateExtensionStorage(
  storage: ExtensionStorageLike = browserStorage(),
): Promise<{ schemaVersion: typeof STORAGE_SCHEMA_VERSION; removedInvalidDashboardTab: boolean }> {
  const stored = storage.session
    ? await storage.session.get(EXTENSION_STORAGE_KEYS.dashboardTabId)
    : {};
  const dashboardTabId = stored[EXTENSION_STORAGE_KEYS.dashboardTabId];
  const removedInvalidDashboardTab = dashboardTabId !== undefined && !isTabId(dashboardTabId);

  const removals: Promise<void>[] = [];
  if (removedInvalidDashboardTab && storage.session) {
    removals.push(storage.session.remove(EXTENSION_STORAGE_KEYS.dashboardTabId));
  }
  if (storage.session) removals.push(storage.session.remove(DEPRECATED_CREDENTIAL_STORAGE_KEYS));
  if (storage.local) removals.push(storage.local.remove(DEPRECATED_CREDENTIAL_STORAGE_KEYS));
  await Promise.all(removals);

  return { schemaVersion: STORAGE_SCHEMA_VERSION, removedInvalidDashboardTab };
}

/** Clears every current or deprecated extension-owned storage key. */
export async function clearExtensionStorage(storage: ExtensionStorageLike = browserStorage()): Promise<void> {
  const sessionKeys = [EXTENSION_STORAGE_KEYS.dashboardTabId, ...DEPRECATED_CREDENTIAL_STORAGE_KEYS];
  await Promise.all([
    storage.session?.remove(sessionKeys),
    storage.local?.remove(DEPRECATED_CREDENTIAL_STORAGE_KEYS),
  ]);
}
