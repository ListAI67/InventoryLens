import { ScanError, type ScanErrorCode } from "./types";
import { isAllowedRobloxHttpUrl } from "./endpoints";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RequestContext {
  inventoryRequest?: boolean;
  allowStatuses?: readonly number[];
  errorCode?: ScanErrorCode;
}

export interface RobloxHttpClientOptions {
  fetch?: FetchLike;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  maxRateLimitRetries?: number;
  onRateLimit?: (event: RateLimitEvent) => void;
}

export interface RateLimitEvent {
  url: URL;
  attempt: number;
  delayMs: number;
}

function abortError(): ScanError {
  return new ScanError("cancelled", "The scan was cancelled.");
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

export async function abortableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (milliseconds <= 0) return;

  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = globalThis.setTimeout(finish, milliseconds);
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  throwIfAborted(signal);
}

function numericHeaderValues(value: string): number[] {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const values = parts.map(Number);
  return values.length === parts.length && values.every(Number.isFinite) ? values : [];
}

function secondsOrDate(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const numericValues = numericHeaderValues(value);
  if (numericValues.length) return Math.max(...numericValues.map((numeric) => Math.max(0, numeric * 1_000)));
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function conservativeDelay(milliseconds: number): number {
  // A zero reset header can arrive beside the real window reset. Never spin.
  return Math.min(Math.max(1_000, milliseconds), 120_000);
}

function resetDelay(response: Response, now = Date.now()): number | undefined {
  const resetAfter = secondsOrDate(response.headers.get("x-ratelimit-reset-after"), now);
  if (resetAfter !== undefined) return conservativeDelay(resetAfter);

  const resetHeader = response.headers.get("x-ratelimit-reset");
  if (!resetHeader) return undefined;
  const numericValues = numericHeaderValues(resetHeader);
  if (!numericValues.length) return undefined;
  const delays = numericValues.map((numeric) =>
    numeric > now / 1_000 - 60 ? numeric * 1_000 - now : numeric * 1_000,
  );
  return conservativeDelay(Math.max(...delays));
}

/** Computes a conservative wait from Roblox's common rate-limit headers. */
export function retryDelay(response: Response, attempt: number, now = Date.now()): number {
  const retryAfter = secondsOrDate(response.headers.get("retry-after"), now);
  if (retryAfter !== undefined) return conservativeDelay(retryAfter);

  const reset = resetDelay(response, now);
  if (reset !== undefined) return reset;

  return Math.min(5_000 * 2 ** attempt, 30_000);
}

interface ResponseErrorDetails {
  message: string;
  serverCode?: string;
}

async function responseErrorDetails(response: Response): Promise<ResponseErrorDetails> {
  const fallback = `Roblox request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""}).`;
  try {
    const body = (await response.clone().json()) as {
      message?: unknown;
      code?: unknown;
      errors?: Array<{ message?: unknown }>;
    };
    const message =
      (typeof body.message === "string" && body.message) ||
      (Array.isArray(body.errors) && typeof body.errors[0]?.message === "string" && body.errors[0].message) ||
      undefined;
    const serverCode = typeof body.code === "string" ? body.code : undefined;
    return { message: message || fallback, serverCode };
  } catch {
    return { message: fallback };
  }
}

function mapErrorCode(status: number, details: ResponseErrorDetails, context: RequestContext): ScanErrorCode {
  if (context.errorCode) return context.errorCode;
  if (status === 401) return "permissionDenied";
  if (status === 403) {
    if (
      context.inventoryRequest &&
      /private inventory|inventory (?:is|was) private|inventory (?:is|was) (?:not )?visible|does not allow (?:you )?to view|not authorized to view (?:this |the )?(?:user'?s )?inventory/i.test(details.message)
    ) {
      return "privateInventory";
    }
    return "permissionDenied";
  }
  if (status === 404) return "notFound";
  if (status === 429) return "rateLimited";
  if (status >= 500) return "network";
  return "unknown";
}

/**
 * Small fetch wrapper shared by all adapters. It never sends Roblox cookies
 * or API keys, and retries bounded 429 responses.
 */
export class RobloxHttpClient {
  readonly fetch: FetchLike;
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  private readonly maxRateLimitRetries: number;
  private readonly onRateLimit?: (event: RateLimitEvent) => void;
  private readonly cooldowns = new Map<string, { promise: Promise<void>; delayMs: number; notified: boolean }>();

  constructor(options: RobloxHttpClientOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? abortableSleep;
    this.maxRateLimitRetries = options.maxRateLimitRetries ?? 6;
    this.onRateLimit = options.onRateLimit;
  }

  private async waitForCooldown(url: URL): Promise<void> {
    const cooldown = this.cooldowns.get(url.origin);
    if (!cooldown) return;
    if (!cooldown.notified) {
      cooldown.notified = true;
      this.onRateLimit?.({ url, attempt: 0, delayMs: cooldown.delayMs });
    }
    await cooldown.promise;
  }

  private cooldown(origin: string, milliseconds: number, signal?: AbortSignal): Promise<void> {
    const current = this.cooldowns.get(origin);
    if (current) return current.promise;
    let pending: Promise<void>;
    pending = this.sleep(milliseconds, signal).finally(() => {
      if (this.cooldowns.get(origin)?.promise === pending) this.cooldowns.delete(origin);
    });
    this.cooldowns.set(origin, { promise: pending, delayMs: milliseconds, notified: false });
    return pending;
  }

  async request(url: string | URL, init: RequestInit = {}, context: RequestContext = {}): Promise<Response> {
    const requestUrl = new URL(url.toString());
    if (!isAllowedRobloxHttpUrl(requestUrl)) {
      throw new ScanError("network", "Blocked an unexpected Roblox request destination.");
    }
    const requestedHeaders = new Headers(init.headers);
    const headers = new Headers();
    // Only the headers used by the anonymous adapters are forwarded. This
    // prevents credentials supplied by a caller from riding along implicitly.
    for (const name of ["accept", "content-type", "x-csrf-token"]) {
      const value = requestedHeaders.get(name);
      if (value !== null) headers.set(name, value);
    }

    const requestInit: RequestInit = {
      ...init,
      headers,
      credentials: "omit",
    };

    for (let attempt = 0; ; attempt += 1) {
      throwIfAborted(init.signal ?? undefined);
      await this.waitForCooldown(requestUrl);
      throwIfAborted(init.signal ?? undefined);
      let response: Response;
      try {
        response = await this.fetch(requestUrl, requestInit);
      } catch (error) {
        if (init.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          throw abortError();
        }
        if (error instanceof ScanError) throw error;
        throw new ScanError("network", "Could not reach Roblox. Check your connection and try again.");
      }

      if (response.status === 429 && attempt < this.maxRateLimitRetries) {
        const delayMs = retryDelay(response, attempt);
        this.onRateLimit?.({ url: requestUrl, attempt: attempt + 1, delayMs });
        await this.cooldown(requestUrl.origin, delayMs, init.signal ?? undefined);
        continue;
      }

      if (response.ok || context.allowStatuses?.includes(response.status)) {
        if (response.ok) {
          const remainingHeader = response.headers.get("x-ratelimit-remaining");
          const remainingValues = remainingHeader ? numericHeaderValues(remainingHeader) : [];
          const proactiveDelay = remainingValues.some((remaining) => remaining <= 0)
            ? resetDelay(response)
            : undefined;
          if (proactiveDelay !== undefined) {
            // Return the successful response now; the shared origin gate paces
            // the next page/batch. Consume rejection if there is no next call.
            void this.cooldown(requestUrl.origin, proactiveDelay, init.signal ?? undefined).catch(() => undefined);
          }
        }
        return response;
      }

      const details = await responseErrorDetails(response);
      const code = mapErrorCode(response.status, details, context);
      const friendlyMessage =
        code === "privateInventory"
          ? "Roblox reports that this player's inventory is private."
          : code === "permissionDenied"
              ? "Roblox denied this anonymous public request. The requested category may require authentication."
            : code === "rateLimited"
              ? "Roblox kept rate limiting this request after the retry window. Try resuming the scan in a moment."
              : details.message;
      throw new ScanError(code, friendlyMessage, response.status);
    }
  }

  async json<T>(url: string | URL, init: RequestInit = {}, context: RequestContext = {}): Promise<T> {
    const response = await this.request(url, init, context);
    try {
      return (await response.json()) as T;
    } catch {
      throw new ScanError("network", "Roblox returned an unreadable response.", response.status);
    }
  }
}
