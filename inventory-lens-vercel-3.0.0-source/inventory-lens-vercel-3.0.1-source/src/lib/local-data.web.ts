import { clearFandomCache } from "./fandom";
import { clearMetadataCaches } from "./metadata";

/** Clears only the bounded in-memory caches used by the hosted browser build. */
export async function clearLocalExtensionData(): Promise<void> {
  clearMetadataCaches();
  clearFandomCache();
}
