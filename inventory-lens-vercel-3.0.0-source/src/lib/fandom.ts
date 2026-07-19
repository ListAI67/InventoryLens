import {
  abortableSleep,
  retryDelay,
  throwIfAborted,
  type FetchLike,
} from "./http";
import { BoundedTtlCache } from "./cache";
import { endpointUrl, fandomArticleUrl } from "./endpoints";
import type {
  CatalogItemMetadata,
  FandomAcquisitionKind,
  FandomItemMetadata,
  FandomPurchaseMetadata,
  NormalizedInventoryRecord,
} from "./types";

const MAX_TITLES_PER_REQUEST = 20;
const MAX_REQUEST_URL_LENGTH = 6_000;
const DEFAULT_THROTTLE_MS = 200;
const MAX_RATE_LIMIT_RETRIES = 1;
const MAX_OPTIONAL_RETRY_DELAY_MS = 10_000;

export interface FandomItemRequest {
  key: string;
  kind: "asset" | "bundle";
  id: string;
  name: string;
}

/** @deprecated The enrichment now returns broader typed item history. */
export type FandomPurchaseRequest = FandomItemRequest;

export interface ParsedFandomPurchase {
  ids: string[];
  count: number;
  asOf?: string;
}

export interface ParsedFandomItem {
  ids: string[];
  purchaseCount?: number;
  purchaseAsOf?: string;
  favoriteCount?: number;
  favoriteAsOf?: string;
  distributionCount?: number;
  distributionLabel?: string;
  distributionAsOf?: string;
  publishedAt?: string;
  acquisitionKinds: FandomAcquisitionKind[];
}

export interface FandomEnrichmentOptions {
  fetch?: FetchLike;
  signal?: AbortSignal;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  throttleMs?: number;
  waitIfPaused?: () => Promise<void>;
  onBatch?: (completed: number, total: number) => void | Promise<void>;
  onWarning?: (warning: string) => void;
}

interface FandomRevisionPage {
  pageid?: number;
  title?: string;
  missing?: boolean;
  revisions?: Array<{
    slots?: {
      main?: {
        content?: string;
      };
    };
  }>;
}

interface FandomQueryResponse {
  error?: { code?: string; info?: string; lag?: number };
  query?: { pages?: FandomRevisionPage[] };
}

interface ParsedPage extends ParsedFandomItem {
  pageTitle: string;
  sourceUrl: string;
}

const fandomCache = new BoundedTtlCache<string, FandomItemMetadata | null>({
  maxEntries: 4_000,
  ttlMs: 60 * 60 * 1_000,
});

export function clearFandomCache(): void {
  fandomCache.clear();
}

function normalizeWikitext(content: string): string {
  return content
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<ref\b[^>]*>[^]*?<\/ref\s*>/gi, " ")
    .replace(/<ref\b[^>]*\/\s*>/gi, " ")
    .replace(/\{\{\s*formatnum\s*:\s*([\d, ]+)(?:\|[^}]*)?\}\}/gi, "$1")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[(?:https?:)?\/\/\S+\s+([^\]]+)\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|\{\{\s*nbsp\s*\}\}/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nearestAsOf(text: string, statementIndex: number): string | undefined {
  const start = Math.max(0, statementIndex - 260);
  const prefix = text.slice(start, statementIndex);
  const pattern = /\bAs of\s+((?:[A-Z][a-z]+\s+\d{1,2},\s+\d{4})|(?:\d{1,2}\s+[A-Z][a-z]+\s+\d{4}))/gi;
  let nearest: RegExpExecArray | null = null;
  for (let match = pattern.exec(prefix); match; match = pattern.exec(prefix)) nearest = match;
  if (!nearest?.[1]) return undefined;
  const distance = prefix.length - (nearest.index + nearest[0].length);
  const interveningText = prefix.slice(nearest.index + nearest[0].length);
  if (distance > 200 || /[.!?]/.test(interveningText)) return undefined;
  return nearest[1].replace(/\s+/g, " ").trim();
}

interface CountStatement {
  count: number;
  asOf?: string;
  timestamp?: number;
}

function selectCountStatement(text: string, pattern: RegExp, countGroup = 1): CountStatement | undefined {
  const statements: CountStatement[] = [];
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const count = Number(match[countGroup]!.replace(/[, ]/g, ""));
    if (!Number.isSafeInteger(count) || count <= 0) continue;
    const asOf = nearestAsOf(text, match.index);
    const parsedDate = asOf ? Date.parse(asOf) : Number.NaN;
    statements.push({ count, asOf, timestamp: Number.isFinite(parsedDate) ? parsedDate : undefined });
  }
  statements.sort((a, b) => {
    if (a.timestamp !== undefined && b.timestamp !== undefined) {
      if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
      return b.count - a.count;
    }
    if (a.timestamp !== undefined) return -1;
    if (b.timestamp !== undefined) return 1;
    return b.count - a.count;
  });
  return statements[0];
}

function publishedDate(text: string): string | undefined {
  const monthDate = "(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},\\s+\\d{4}";
  const match = new RegExp(`\\bpublished\\b[^.!?]{0,350}?\\bon\\s+(${monthDate})\\b`, "i").exec(text);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

function acquisitionKinds(text: string): FandomAcquisitionKind[] {
  const result: FandomAcquisitionKind[] = [];
  const add = (kind: FandomAcquisitionKind, matches: boolean) => {
    if (matches && !result.includes(kind)) result.push(kind);
  };

  add("inPersonEvent", (
    /\b(?:BLOXcon|conference|convention)\b[^.!?]{0,220}\b(?:attendees?|ticket buyers?)\b/i.test(text) ||
    /\b(?:attendees?|ticket buyers?)\b[^.!?]{0,220}\b(?:BLOXcon|conference|convention)\b/i.test(text)
  ));
  add("selectUsers", (
    /\b(?:awarded|granted|given)\s+to\s+(?:only\s+)?(?:a\s+)?(?:select|specific|few|certain)\s+(?:users|players|members)\b/i.test(text) ||
    /\bonly\s+\d[\d, ]*\s+(?:users|players|members)\s+(?:received|obtained|were awarded)\b/i.test(text)
  ));
  add("contestPrize", (
    /\b(?:contest|competition)\s+(?:prize|winner)\b/i.test(text) ||
    /\b(?:awarded|granted|given)\s+to\s+[^.!?]{0,100}\b(?:contest|competition)\s+winners?\b/i.test(text)
  ));
  add("eventPrize", (
    /\b(?:obtained|received|earned|awarded)\s+as\s+(?:an?\s+)?prize\b[^.!?]{0,180}\b(?:event|in-game|game)\b/i.test(text) ||
    /\bCategory:Event prizes?\b/i.test(text) ||
    /\bevent prize\b/i.test(text)
  ));
  add("promoCode", (
    /\b(?:promo(?:tional)?|toy|merchandise)\s+(?:item\s+)?codes?\b/i.test(text) ||
    /\bgift cards?\b/i.test(text) ||
    /\bredeem(?:ed|able|ing)?\b[^.!?]{0,100}\bcodes?\b/i.test(text)
  ));
  add("giveaway", /\b(?:giveaway|given away)\b/i.test(text));
  return result;
}

function distributionLabel(verb: string): string {
  switch (verb.toLocaleLowerCase()) {
    case "redeemed":
      return "redemptions";
    case "distributed":
    case "given out":
      return "distributed copies";
    default:
      return "awards";
  }
}

/** Parses typed item history while preserving the meaning of every count. */
export function parseFandomItemWikitext(content: string): ParsedFandomItem | undefined {
  const ids = [...content.matchAll(/\|\s*id\s*=\s*(\d+)/gi)].map((match) => match[1]!);
  if (!ids.length) return undefined;

  const text = normalizeWikitext(content);
  const purchase = selectCountStatement(text, /\bpurchased\s+([\d][\d, ]*)\s+times\b/gi);
  const favorite = selectCountStatement(text, /\bfavorited\s+([\d][\d, ]*)\s+times\b/gi);

  const distributionMatches: Array<CountStatement & { label: string }> = [];
  const distributionPattern = /\b(obtained|awarded|redeemed|distributed|given out)\s+([\d][\d, ]*)\s+times\b/gi;
  for (let match = distributionPattern.exec(text); match; match = distributionPattern.exec(text)) {
    const count = Number(match[2]!.replace(/[, ]/g, ""));
    if (!Number.isSafeInteger(count) || count <= 0) continue;
    const asOf = nearestAsOf(text, match.index);
    const parsedDate = asOf ? Date.parse(asOf) : Number.NaN;
    distributionMatches.push({
      count,
      label: distributionLabel(match[1]!),
      asOf,
      timestamp: Number.isFinite(parsedDate) ? parsedDate : undefined,
    });
  }
  distributionMatches.sort((a, b) => {
    if (a.timestamp !== undefined && b.timestamp !== undefined && a.timestamp !== b.timestamp) {
      return b.timestamp - a.timestamp;
    }
    if (a.timestamp !== undefined && b.timestamp === undefined) return -1;
    if (a.timestamp === undefined && b.timestamp !== undefined) return 1;
    return b.count - a.count;
  });
  const distribution = distributionMatches[0];

  return {
    ids: [...new Set(ids)],
    purchaseCount: purchase?.count,
    purchaseAsOf: purchase?.asOf,
    favoriteCount: favorite?.count,
    favoriteAsOf: favorite?.asOf,
    distributionCount: distribution?.count,
    distributionLabel: distribution?.label,
    distributionAsOf: distribution?.asOf,
    publishedAt: publishedDate(text),
    acquisitionKinds: acquisitionKinds(text),
  };
}

/**
 * Extracts only explicit "purchased N times" statements. Price prose such as
 * "could have been purchased for 150 Robux" cannot match this grammar.
 */
export function parseFandomPurchaseWikitext(content: string): ParsedFandomPurchase | undefined {
  const parsed = parseFandomItemWikitext(content);
  if (!parsed || parsed.purchaseCount === undefined) return undefined;
  return { ids: parsed.ids, count: parsed.purchaseCount, asOf: parsed.purchaseAsOf };
}

function superscriptToCaret(name: string): string {
  const digits: Record<string, string> = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  };
  let result = "";
  let inSuperscript = false;
  for (const character of name) {
    const digit = digits[character];
    if (digit !== undefined) {
      if (!inSuperscript) result += "^";
      result += digit;
      inSuperscript = true;
    } else {
      inSuperscript = false;
      result += character;
    }
  }
  return result;
}

export function fandomTitleCandidates(name: string): string[] {
  const cleanName = name.trim().replace(/^Catalog:/i, "");
  if (!cleanName) return [];
  const variants = [cleanName, superscriptToCaret(cleanName)];
  const seen = new Set<string>();
  return variants.flatMap((variant) => {
    const title = `Catalog:${variant}`;
    const canonical = title.toLocaleLowerCase();
    if (seen.has(canonical)) return [];
    seen.add(canonical);
    return [title];
  });
}

export function fandomItemRequestsForRecords(
  records: readonly NormalizedInventoryRecord[],
  catalog: ReadonlyMap<string, CatalogItemMetadata>,
): FandomItemRequest[] {
  const result = new Map<string, FandomItemRequest>();
  for (const record of records) {
    if (record.kind !== "asset" && record.kind !== "bundle") continue;
    const name = catalog.get(record.key)?.name || record.name;
    if (!name || result.has(record.key)) continue;
    result.set(record.key, { key: record.key, kind: record.kind, id: record.id, name });
  }
  return [...result.values()];
}

/** @deprecated Use fandomItemRequestsForRecords. */
export const fandomRequestsForRecords = fandomItemRequestsForRecords;

function pageUrl(title: string): string {
  return fandomArticleUrl(title);
}

function requestBatches(requests: readonly FandomItemRequest[]): FandomItemRequest[][] {
  const batches: FandomItemRequest[][] = [];
  let current: FandomItemRequest[] = [];
  let titles = new Set<string>();
  for (const request of requests) {
    const candidates = fandomTitleCandidates(request.name);
    const nextTitles = new Set([...titles, ...candidates]);
    const nextBatch = [...current, request];
    if (
      current.length &&
      (nextTitles.size > MAX_TITLES_PER_REQUEST || apiUrl(nextBatch).toString().length > MAX_REQUEST_URL_LENGTH)
    ) {
      batches.push(current);
      current = [];
      titles = new Set();
    }
    current.push(request);
    for (const candidate of candidates) titles.add(candidate);
  }
  if (current.length) batches.push(current);
  return batches;
}

function apiUrl(requests: readonly FandomItemRequest[]): URL {
  const titles = [...new Set(requests.flatMap(({ name }) => fandomTitleCandidates(name)))];
  const url = endpointUrl("fandom", "/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("titles", titles.join("|"));
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("origin", "*");
  url.searchParams.set("maxlag", "5");
  return url;
}

async function queryBatch(
  requests: readonly FandomItemRequest[],
  options: FandomEnrichmentOptions,
): Promise<ParsedPage[] | undefined> {
  const fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = options.sleep ?? abortableSleep;
  const url = apiUrl(requests);

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    throwIfAborted(options.signal);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        credentials: "omit",
        headers: { Accept: "application/json" },
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throwIfAborted(options.signal);
      }
      options.onWarning?.("Roblox Wiki item history was temporarily unavailable.");
      return undefined;
    }

    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      await sleep(Math.min(retryDelay(response, attempt), MAX_OPTIONAL_RETRY_DELAY_MS), options.signal);
      continue;
    }
    if (!response.ok) {
      options.onWarning?.(`Roblox Wiki item history was unavailable (${response.status}).`);
      return undefined;
    }

    let body: FandomQueryResponse;
    try {
      body = (await response.json()) as FandomQueryResponse;
    } catch {
      options.onWarning?.("Roblox Wiki returned unreadable item history data.");
      return undefined;
    }
    if (body.error) {
      if (body.error.code === "maxlag" && attempt < MAX_RATE_LIMIT_RETRIES) {
        const delayMs = Number.isFinite(body.error.lag) ? Math.max(1_000, body.error.lag! * 1_000) : 5_000;
        await sleep(delayMs, options.signal);
        continue;
      }
      options.onWarning?.("Roblox Wiki could not resolve item history for one batch.");
      return undefined;
    }

    return (body.query?.pages ?? []).flatMap((page): ParsedPage[] => {
      const title = page.title;
      const content = page.revisions?.[0]?.slots?.main?.content;
      if (page.missing || !title || !content) return [];
      const parsed = parseFandomItemWikitext(content);
      return parsed ? [{ ...parsed, pageTitle: title, sourceUrl: pageUrl(title) }] : [];
    });
  }
  return undefined;
}

function pageEvidenceScore(page: ParsedPage): number {
  return (page.purchaseCount !== undefined ? 4 : 0) +
    (page.distributionCount !== undefined ? 4 : 0) +
    page.acquisitionKinds.length * 3 +
    (page.publishedAt !== undefined ? 2 : 0) +
    (page.favoriteCount !== undefined ? 1 : 0);
}

/**
 * Resolves exact Catalog pages in MediaWiki batches, validates each page's
 * item ID, and returns typed community-maintained history. Missing/mismatched
 * pages are negatively cached for this dashboard session; transport failures
 * remain retryable on a later scan.
 */
export async function fetchFandomItemMetadata(
  requests: readonly FandomItemRequest[],
  options: FandomEnrichmentOptions = {},
): Promise<Map<string, FandomItemMetadata>> {
  const unique = new Map(requests.map((request) => [request.key, request]));
  const result = new Map<string, FandomItemMetadata>();
  const uncached: FandomItemRequest[] = [];
  for (const request of unique.values()) {
    const cached = fandomCache.get(request.key);
    if (cached) result.set(request.key, cached);
    if (cached === undefined) uncached.push(request);
  }

  const batches = requestBatches(uncached);
  let completed = unique.size - uncached.length;
  const sleep = options.sleep ?? abortableSleep;
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    throwIfAborted(options.signal);
    await options.waitIfPaused?.();
    throwIfAborted(options.signal);
    if (batchIndex > 0 && throttleMs > 0) await sleep(throttleMs, options.signal);

    const batch = batches[batchIndex]!;
    const pages = await queryBatch(batch, options);
    if (!pages) {
      completed += batch.length;
      await options.onBatch?.(completed, unique.size);
      break;
    }
    for (const request of batch) {
      const page = pages
        .filter(({ ids }) => ids.includes(request.id))
        .sort((a, b) => pageEvidenceScore(b) - pageEvidenceScore(a))[0];
      const metadata: FandomItemMetadata | null = page
        ? {
            key: request.key,
            id: request.id,
            pageTitle: page.pageTitle,
            sourceUrl: page.sourceUrl,
            purchaseCount: page.purchaseCount,
            purchaseAsOf: page.purchaseAsOf,
            favoriteCount: page.favoriteCount,
            favoriteAsOf: page.favoriteAsOf,
            distributionCount: page.distributionCount,
            distributionLabel: page.distributionLabel,
            distributionAsOf: page.distributionAsOf,
            publishedAt: page.publishedAt,
            acquisitionKinds: page.acquisitionKinds,
          }
        : null;
      fandomCache.set(request.key, metadata);
      if (metadata) result.set(request.key, metadata);
    }
    completed += batch.length;
    await options.onBatch?.(completed, unique.size);
  }
  return result;
}

/**
 * Backward-compatible purchase-only view. New code should consume
 * fetchFandomItemMetadata so event and giveaway items are not discarded.
 */
export async function fetchFandomPurchaseMetadata(
  requests: readonly FandomPurchaseRequest[],
  options: FandomEnrichmentOptions = {},
): Promise<Map<string, FandomPurchaseMetadata>> {
  const items = await fetchFandomItemMetadata(requests, options);
  const purchases = new Map<string, FandomPurchaseMetadata>();
  for (const [key, item] of items) {
    if (item.purchaseCount === undefined) continue;
    purchases.set(key, {
      key,
      id: item.id,
      count: item.purchaseCount,
      pageTitle: item.pageTitle,
      sourceUrl: item.sourceUrl,
      asOf: item.purchaseAsOf,
    });
  }
  return purchases;
}
