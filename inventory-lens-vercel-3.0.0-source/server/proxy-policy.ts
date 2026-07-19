import {
  ENDPOINT_ORIGINS,
  ROBLOX_HTTP_ALLOWED_ORIGINS,
} from "../src/lib/endpoints";

export const MAX_PROXY_URL_LENGTH = 8_192;
export const MAX_PROXY_REQUEST_BYTES = 128 * 1_024;
export const MAX_PROXY_RESPONSE_BYTES = 4 * 1024 * 1024;

const ALLOWED_ORIGINS = new Set<string>([
  ...ROBLOX_HTTP_ALLOWED_ORIGINS,
  ENDPOINT_ORIGINS.fandom,
]);

const ALLOWED_REQUEST_HEADERS = Object.freeze([
  "accept",
  "content-type",
  "x-csrf-token",
]);

export const ALLOWED_PROXY_RESPONSE_HEADERS = Object.freeze([
  "content-type",
  "retry-after",
  "x-csrf-token",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-ratelimit-reset-after",
]);

export type ProxyTargetKind =
  | "user"
  | "inventory"
  | "catalog"
  | "thumbnail"
  | "fandom";

export interface ValidatedProxyTarget {
  kind: ProxyTargetKind;
  method: "GET" | "POST";
  url: URL;
}

export class ProxyPolicyError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ProxyPolicyError";
    this.status = status;
    this.code = code;
  }
}

interface RouteRule {
  origin: string;
  method: "GET" | "POST";
  path: RegExp;
  query: ReadonlySet<string>;
  kind: ProxyTargetKind;
}

const ROUTES: readonly RouteRule[] = [
  {
    origin: ENDPOINT_ORIGINS.users,
    method: "GET",
    path: /^\/v1\/users\/\d+$/,
    query: new Set(),
    kind: "user",
  },
  {
    origin: ENDPOINT_ORIGINS.users,
    method: "POST",
    path: /^\/v1\/usernames\/users$/,
    query: new Set(),
    kind: "user",
  },
  {
    origin: ENDPOINT_ORIGINS.catalog,
    method: "POST",
    path: /^\/v1\/catalog\/items\/details$/,
    query: new Set(),
    kind: "catalog",
  },
  {
    origin: ENDPOINT_ORIGINS.catalog,
    method: "GET",
    path: /^\/v1\/users\/\d+\/bundles$/,
    query: new Set(["limit", "sortOrder", "cursor"]),
    kind: "inventory",
  },
  {
    origin: ENDPOINT_ORIGINS.inventory,
    method: "GET",
    path: /^\/v1\/users\/\d+\/can-view-inventory$/,
    query: new Set(),
    kind: "inventory",
  },
  {
    origin: ENDPOINT_ORIGINS.inventory,
    method: "GET",
    path: /^\/v2\/users\/\d+\/inventory\/\d+$/,
    query: new Set(["limit", "sortOrder", "cursor"]),
    kind: "inventory",
  },
  {
    origin: ENDPOINT_ORIGINS.inventory,
    method: "GET",
    path: /^\/v1\/users\/\d+\/places\/inventory$/,
    query: new Set(["itemsPerPage", "placesTab", "cursor"]),
    kind: "inventory",
  },
  {
    origin: ENDPOINT_ORIGINS.thumbnails,
    method: "GET",
    path: /^\/v1\/users\/(?:avatar|avatar-headshot)$/,
    query: new Set(["userIds", "size", "format", "isCircular"]),
    kind: "thumbnail",
  },
  {
    origin: ENDPOINT_ORIGINS.thumbnails,
    method: "GET",
    path: /^\/v1\/assets$/,
    query: new Set(["assetIds", "returnPolicy", "size", "format", "isCircular"]),
    kind: "thumbnail",
  },
  {
    origin: ENDPOINT_ORIGINS.thumbnails,
    method: "GET",
    path: /^\/v1\/bundles\/thumbnails$/,
    query: new Set(["bundleIds", "size", "format", "isCircular"]),
    kind: "thumbnail",
  },
  {
    origin: ENDPOINT_ORIGINS.thumbnails,
    method: "GET",
    path: /^\/v1\/(?:badges\/icons|game-passes)$/,
    query: new Set(["badgeIds", "gamePassIds", "size", "format", "isCircular"]),
    kind: "thumbnail",
  },
  {
    origin: ENDPOINT_ORIGINS.fandom,
    method: "GET",
    path: /^\/api\.php$/,
    query: new Set([
      "action",
      "prop",
      "rvprop",
      "rvslots",
      "redirects",
      "titles",
      "format",
      "formatversion",
      "origin",
      "maxlag",
    ]),
    kind: "fandom",
  },
];

function policyError(message: string, code = "target_not_allowed"): never {
  throw new ProxyPolicyError(400, code, message);
}

function singleValue(url: URL, key: string): string | undefined {
  const values = url.searchParams.getAll(key);
  if (values.length > 1) policyError(`Duplicate query parameter: ${key}.`, "duplicate_parameter");
  return values[0];
}

function validateIdList(value: string | undefined, key: string, maximum = 100): void {
  if (!value) policyError(`Missing query parameter: ${key}.`, "invalid_query");
  const ids = value.split(",");
  if (ids.length > maximum || ids.some((id) => !/^\d+$/.test(id))) {
    policyError(`Invalid ${key} value.`, "invalid_query");
  }
}

function validateCommonPagination(url: URL): void {
  const limit = singleValue(url, "limit");
  if (limit !== undefined && (!/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)) {
    policyError("Invalid pagination limit.", "invalid_query");
  }
  const sortOrder = singleValue(url, "sortOrder");
  if (sortOrder !== undefined && !/^(?:Asc|Desc|1|2)$/i.test(sortOrder)) {
    policyError("Invalid sort order.", "invalid_query");
  }
  const cursor = singleValue(url, "cursor");
  if (cursor !== undefined && (!cursor || cursor.length > 2_048 || /[\u0000-\u001f\u007f]/.test(cursor))) {
    policyError("Invalid cursor.", "invalid_query");
  }
}

function validateThumbnailQuery(url: URL): void {
  const idKey = ["userIds", "assetIds", "bundleIds", "badgeIds", "gamePassIds"]
    .find((key) => url.searchParams.has(key));
  if (!idKey) policyError("A thumbnail ID list is required.", "invalid_query");
  validateIdList(singleValue(url, idKey), idKey);
  const size = singleValue(url, "size");
  if (!size || !/^\d{2,4}x\d{2,4}$/.test(size)) policyError("Invalid thumbnail size.", "invalid_query");
  const format = singleValue(url, "format");
  if (!format || !/^(?:Png|Jpeg|Webp)$/i.test(format)) policyError("Invalid thumbnail format.", "invalid_query");
  const circular = singleValue(url, "isCircular");
  if (circular !== undefined && !/^(?:true|false)$/i.test(circular)) {
    policyError("Invalid circular-thumbnail flag.", "invalid_query");
  }
  const returnPolicy = singleValue(url, "returnPolicy");
  if (returnPolicy !== undefined && returnPolicy !== "PlaceHolder") {
    policyError("Invalid thumbnail return policy.", "invalid_query");
  }
}

function validateFandomQuery(url: URL): void {
  const exact: Readonly<Record<string, string>> = {
    action: "query",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    redirects: "1",
    format: "json",
    formatversion: "2",
    origin: "*",
    maxlag: "5",
  };
  for (const [key, expected] of Object.entries(exact)) {
    if (singleValue(url, key) !== expected) policyError(`Invalid Fandom ${key} parameter.`, "invalid_query");
  }
  const titles = singleValue(url, "titles");
  if (!titles || titles.length > 5_500 || titles.split("|").length > 20 || /[\u0000-\u001f\u007f]/.test(titles)) {
    policyError("Invalid Fandom titles parameter.", "invalid_query");
  }
}

function validateRouteQuery(target: ValidatedProxyTarget, allowed: ReadonlySet<string>): void {
  for (const key of target.url.searchParams.keys()) {
    if (!allowed.has(key)) policyError(`Unexpected query parameter: ${key}.`, "invalid_query");
    singleValue(target.url, key);
  }
  if (target.kind === "thumbnail") validateThumbnailQuery(target.url);
  if (target.kind === "fandom") validateFandomQuery(target.url);
  if (target.kind === "inventory") {
    validateCommonPagination(target.url);
    const itemsPerPage = singleValue(target.url, "itemsPerPage");
    if (itemsPerPage !== undefined && (!/^\d{1,3}$/.test(itemsPerPage) || Number(itemsPerPage) < 1 || Number(itemsPerPage) > 100)) {
      policyError("Invalid items-per-page value.", "invalid_query");
    }
    const placesTab = singleValue(target.url, "placesTab");
    if (placesTab !== undefined && placesTab !== "Created") policyError("Invalid places tab.", "invalid_query");
  }
}

/** Validates the entire upstream destination against the app's exact API surface. */
export function validateProxyTarget(rawTarget: string | URL, rawMethod: string): ValidatedProxyTarget {
  const serialized = rawTarget.toString();
  if (!serialized || serialized.length > MAX_PROXY_URL_LENGTH) policyError("Invalid target URL.");

  let url: URL;
  try {
    url = new URL(serialized);
  } catch {
    policyError("Invalid target URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.hash ||
    !ALLOWED_ORIGINS.has(url.origin)
  ) {
    policyError("That destination is not allowed.");
  }

  const method = rawMethod.toUpperCase();
  if (method !== "GET" && method !== "POST") {
    throw new ProxyPolicyError(405, "method_not_allowed", "Only GET and POST are supported.");
  }
  const rule = ROUTES.find((candidate) =>
    candidate.origin === url.origin && candidate.method === method && candidate.path.test(url.pathname),
  );
  if (!rule) policyError("That API route or method is not allowed.");

  const target: ValidatedProxyTarget = { kind: rule.kind, method, url };
  validateRouteQuery(target, rule.query);
  return target;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Validates and canonicalizes the two supported anonymous JSON request bodies. */
export function validateProxyJsonBody(target: ValidatedProxyTarget, bodyText: string): string | undefined {
  if (target.method === "GET") {
    if (bodyText) policyError("GET requests cannot include a body.", "invalid_body");
    return undefined;
  }
  if (new TextEncoder().encode(bodyText).byteLength > MAX_PROXY_REQUEST_BYTES) {
    throw new ProxyPolicyError(413, "request_too_large", "The request body is too large.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    policyError("The request body must be valid JSON.", "invalid_body");
  }
  const object = record(parsed);
  if (!object) policyError("The request body must be a JSON object.", "invalid_body");

  if (target.url.origin === ENDPOINT_ORIGINS.users) {
    const keys = Object.keys(object);
    if (keys.some((key) => key !== "usernames" && key !== "excludeBannedUsers")) {
      policyError("Unexpected username lookup field.", "invalid_body");
    }
    const usernames = object.usernames;
    if (
      !Array.isArray(usernames) ||
      usernames.length !== 1 ||
      typeof usernames[0] !== "string" ||
      !/^[A-Za-z0-9_]{3,20}$/.test(usernames[0]) ||
      typeof object.excludeBannedUsers !== "boolean"
    ) {
      policyError("Invalid username lookup body.", "invalid_body");
    }
    return JSON.stringify({ usernames: [usernames[0]], excludeBannedUsers: object.excludeBannedUsers });
  }

  const keys = Object.keys(object);
  if (keys.length !== 1 || keys[0] !== "items" || !Array.isArray(object.items) || object.items.length < 1 || object.items.length > 120) {
    policyError("Invalid catalog item request body.", "invalid_body");
  }
  const items = object.items.map((value) => {
    const item = record(value);
    if (!item || Object.keys(item).some((key) => key !== "id" && key !== "itemType")) {
      policyError("Invalid catalog item entry.", "invalid_body");
    }
    if (!Number.isSafeInteger(item.id) || Number(item.id) <= 0 || (item.itemType !== "Asset" && item.itemType !== "Bundle")) {
      policyError("Invalid catalog item entry.", "invalid_body");
    }
    return { id: item.id as number, itemType: item.itemType as "Asset" | "Bundle" };
  });
  return JSON.stringify({ items });
}

export function sanitizedProxyRequestHeaders(headers: Headers): Headers {
  const result = new Headers();
  for (const name of ALLOWED_REQUEST_HEADERS) {
    const value = headers.get(name);
    if (value !== null) result.set(name, value);
  }
  return result;
}

export function sanitizedProxyResponseHeaders(headers: Headers): Headers {
  const result = new Headers({ "Cache-Control": "no-store" });
  for (const name of ALLOWED_PROXY_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value !== null) result.set(name, value);
  }
  return result;
}
