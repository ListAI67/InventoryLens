import { clearFandomCache } from "./fandom";
import { clearMetadataCaches } from "./metadata";
import { clearExtensionStorage, type ExtensionStorageLike } from "./storage";

/**
 * UI-callable privacy control. Clears bounded module caches and all known
 * extension storage without touching browser history, cookies, or site data.
 */
export async function clearLocalExtensionData(storage?: ExtensionStorageLike): Promise<void> {
  clearMetadataCaches();
  clearFandomCache();
  await clearExtensionStorage(storage);
}
