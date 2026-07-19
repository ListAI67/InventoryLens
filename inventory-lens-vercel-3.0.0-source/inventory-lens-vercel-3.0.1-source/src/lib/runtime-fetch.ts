import {
  ENDPOINT_ORIGINS,
  ROBLOX_HTTP_ALLOWED_ORIGINS,
} from "./endpoints";
import type { FetchLike } from "./http";

const EXTERNAL_DATA_ORIGINS = new Set<string>([
  ...ROBLOX_HTTP_ALLOWED_ORIGINS,
  ENDPOINT_ORIGINS.fandom,
]);
const ALLOWED_HEADERS = Object.freeze(["accept", "content-type", "x-csrf-token"]);

export interface ExternalDataFetchOptions {
  fetch?: FetchLike;
  pageUrl?: string | URL;
}

function currentPageUrl(): URL | undefined {
  if (typeof globalThis.location?.href !== "string") return undefined;
  try {
    return new URL(globalThis.location.href);
  } catch {
    return undefined;
  }
}

export function isWebDeployment(pageUrl: string | URL | undefined = currentPageUrl()): boolean {
  if (!pageUrl) return false;
  try {
    const protocol = new URL(pageUrl.toString()).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function safeHeaders(source: Headers): Headers {
  const result = new Headers();
  for (const name of ALLOWED_HEADERS) {
    const value = source.get(name);
    if (value !== null) result.set(name, value);
  }
  return result;
}

/**
 * Creates the one external-data fetch boundary used by both targets. The
 * extension calls the allowlisted providers directly; an HTTP(S) deployment
 * sends the same request through its same-origin Vercel Function for CORS.
 */
export function createExternalDataFetch(options: ExternalDataFetchOptions = {}): FetchLike {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  return async (input, init = {}) => {
    const request = new Request(input, init);
    const target = new URL(request.url);
    if (!EXTERNAL_DATA_ORIGINS.has(target.origin) || target.protocol !== "https:") {
      throw new TypeError("Blocked an unexpected external data destination.");
    }

    const pageUrl = options.pageUrl ? new URL(options.pageUrl.toString()) : currentPageUrl();
    const useProxy = isWebDeployment(pageUrl);
    const destination = useProxy
      ? new URL(`/api/proxy?url=${encodeURIComponent(target.toString())}`, pageUrl!.origin)
      : target;
    const method = request.method.toUpperCase();
    const body = method === "GET" || method === "HEAD"
      ? undefined
      : await request.clone().arrayBuffer();

    return fetchImpl(destination, {
      method,
      headers: safeHeaders(request.headers),
      body,
      credentials: "omit",
      signal: request.signal,
    });
  };
}

export const externalDataFetch: FetchLike = (input, init) =>
  createExternalDataFetch()(input, init);
