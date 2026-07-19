import {
  MAX_PROXY_REQUEST_BYTES,
  MAX_PROXY_RESPONSE_BYTES,
  ProxyPolicyError,
  sanitizedProxyRequestHeaders,
  sanitizedProxyResponseHeaders,
  validateProxyJsonBody,
  validateProxyTarget,
} from "../server/proxy-policy.js";

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const UPSTREAM_TIMEOUT_MS = 25_000;

function jsonError(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function validateCaller(request: Request): void {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) {
    throw new ProxyPolicyError(403, "cross_origin_denied", "Cross-origin proxy requests are not allowed.");
  }
  if (request.headers.get("sec-fetch-site")?.toLocaleLowerCase() === "cross-site") {
    throw new ProxyPolicyError(403, "cross_origin_denied", "Cross-site proxy requests are not allowed.");
  }
}

function onlyTargetParameter(routeUrl: URL): string {
  for (const key of routeUrl.searchParams.keys()) {
    if (key !== "url") throw new ProxyPolicyError(400, "invalid_parameter", "Unexpected proxy parameter.");
  }
  const targets = routeUrl.searchParams.getAll("url");
  if (targets.length !== 1 || !targets[0]) {
    throw new ProxyPolicyError(400, "invalid_parameter", "Exactly one target URL is required.");
  }
  return targets[0];
}

async function boundedRequestBody(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROXY_REQUEST_BYTES) {
    throw new ProxyPolicyError(413, "request_too_large", "The request body is too large.");
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase();
  if (contentType !== "application/json") {
    throw new ProxyPolicyError(415, "unsupported_media_type", "POST requests must use application/json.");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_PROXY_REQUEST_BYTES) {
    throw new ProxyPolicyError(413, "request_too_large", "The request body is too large.");
  }
  return body;
}

async function boundedResponseBody(response: Response): Promise<ArrayBuffer> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROXY_RESPONSE_BYTES) {
    throw new ProxyPolicyError(502, "upstream_too_large", "The upstream response was too large.");
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_PROXY_RESPONSE_BYTES) {
    throw new ProxyPolicyError(502, "upstream_too_large", "The upstream response was too large.");
  }
  return body;
}

/** Stateless, allowlisted proxy used only by the hosted browser build. */
export async function handleProxyRequest(
  request: Request,
  fetchImpl: FetchImplementation = globalThis.fetch.bind(globalThis),
): Promise<Response> {
  try {
    validateCaller(request);
    const method = request.method.toUpperCase();
    const routeUrl = new URL(request.url);
    const target = validateProxyTarget(onlyTargetParameter(routeUrl), method);
    const bodyText = method === "POST" ? await boundedRequestBody(request) : "";
    const body = validateProxyJsonBody(target, bodyText);
    const headers = sanitizedProxyRequestHeaders(request.headers);
    if (target.method === "GET") headers.delete("content-type");

    let upstream: Response;
    const timeoutSignal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
    const upstreamSignal = AbortSignal.any([request.signal, timeoutSignal]);
    try {
      upstream = await fetchImpl(target.url, {
        method: target.method,
        headers,
        body,
        credentials: "omit",
        redirect: "manual",
        signal: upstreamSignal,
      });
    } catch (error) {
      if (timeoutSignal.aborted && !request.signal.aborted) {
        return jsonError(504, "upstream_timeout", "The public data provider took too long to respond.");
      }
      if (request.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return jsonError(499, "request_cancelled", "The request was cancelled.");
      }
      return jsonError(502, "upstream_unavailable", "The public data provider could not be reached.");
    }

    if (upstream.status >= 300 && upstream.status < 400) {
      return jsonError(502, "upstream_redirect", "An unexpected upstream redirect was blocked.");
    }
    const upstreamContentType = upstream.headers.get("content-type")?.toLocaleLowerCase() ?? "";
    const isAnonymousCsrfChallenge = upstream.status === 403 && upstream.headers.has("x-csrf-token");
    if (
      upstream.status !== 204 &&
      !isAnonymousCsrfChallenge &&
      !upstreamContentType.startsWith("application/json")
    ) {
      return jsonError(502, "upstream_content_type", "The public data provider returned an unexpected response type.");
    }
    const responseHeaders = sanitizedProxyResponseHeaders(upstream.headers);
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    const responseBody = isAnonymousCsrfChallenge
      ? new TextEncoder().encode("{}").buffer
      : await boundedResponseBody(upstream);
    if (isAnonymousCsrfChallenge) responseHeaders.set("Content-Type", "application/json; charset=utf-8");
    return new Response(responseBody.byteLength ? responseBody : null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof ProxyPolicyError) return jsonError(error.status, error.code, error.message);
    return jsonError(500, "proxy_error", "The proxy could not complete the request.");
  }
}

/** Vercel's Web-standard Node.js Function entry point. */
export default {
  fetch(request: Request): Promise<Response> {
    return handleProxyRequest(request);
  },
};
