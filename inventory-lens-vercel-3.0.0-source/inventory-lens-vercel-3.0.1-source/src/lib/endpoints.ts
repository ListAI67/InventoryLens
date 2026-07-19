import type { InventoryKind } from "./types.js";

export const ENDPOINT_ORIGINS = Object.freeze({
  users: "https://users.roblox.com",
  catalog: "https://catalog.roblox.com",
  inventory: "https://inventory.roblox.com",
  thumbnails: "https://thumbnails.roblox.com",
  robloxWeb: "https://www.roblox.com",
  fandom: "https://roblox.fandom.com",
});

export type EndpointService = keyof typeof ENDPOINT_ORIGINS;

export const ROBLOX_HTTP_ALLOWED_ORIGINS = Object.freeze([
  ENDPOINT_ORIGINS.users,
  ENDPOINT_ORIGINS.catalog,
  ENDPOINT_ORIGINS.inventory,
  ENDPOINT_ORIGINS.thumbnails,
]);

export function endpointUrl(
  service: EndpointService,
  pathname: string,
  searchParams?: Readonly<Record<string, string | number | undefined>>,
): URL {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (normalizedPath.startsWith("//") || normalizedPath.includes("\\")) {
    throw new TypeError("Endpoint path must stay on the configured origin.");
  }
  const expectedOrigin = ENDPOINT_ORIGINS[service];
  const url = new URL(normalizedPath, expectedOrigin);
  if (url.origin !== expectedOrigin) throw new TypeError("Endpoint path escaped its configured origin.");
  for (const [name, value] of Object.entries(searchParams ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  return url;
}

export function isAllowedRobloxHttpUrl(url: URL): boolean {
  return url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === "443") &&
    ROBLOX_HTTP_ALLOWED_ORIGINS.includes(url.origin as (typeof ROBLOX_HTTP_ALLOWED_ORIGINS)[number]);
}

export function endpointPathSegment(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function officialRobloxItemUrl(kind: InventoryKind, id: string): string {
  const safeId = endpointPathSegment(id);
  switch (kind) {
    case "asset":
      return endpointUrl("robloxWeb", `/catalog/${safeId}`).toString();
    case "bundle":
      return endpointUrl("robloxWeb", `/bundles/${safeId}`).toString();
    case "badge":
      return endpointUrl("robloxWeb", `/badges/${safeId}`).toString();
    case "gamePass":
      return endpointUrl("robloxWeb", `/game-pass/${safeId}`).toString();
    case "privateServer":
      return endpointUrl("robloxWeb", "/games").toString();
  }
}

export function fandomArticleUrl(title: string): string {
  return endpointUrl("fandom", `/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`).toString();
}

/**
 * Accepts only HTTPS URLs served by Roblox's dedicated image CDN. The API
 * response is remote data, so an arbitrary or executable URL is discarded.
 */
export function safeRobloxThumbnailUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase();
    const isRobloxCdn = hostname === "rbxcdn.com" || hostname.endsWith(".rbxcdn.com");
    if (
      url.protocol !== "https:" ||
      !isRobloxCdn ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}
