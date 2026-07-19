# Inventory Lens Security Policy

Public Roblox inventory analyzer

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

## Reporting a vulnerability

Send security reports to `[SECURITY_CONTACT]`.

This contact must be replaced with a monitored private reporting channel before public release. Do not publish sensitive vulnerability details in a public issue while a report is being investigated.

Include, when possible:

- A description of the issue and its impact
- The affected Inventory Lens version and browser version
- Reproduction steps or a minimal proof of concept
- Whether credentials, private data, or account state could be affected
- Suggested remediation, if known

Acknowledgement and remediation timelines are not promised until the project owner publishes a response policy. There is currently no bug-bounty program.

## Supported versions

| Version | Security support |
| --- | --- |
| `3.0.x` | Supported |
| Earlier versions | Not supported; upgrade to the latest `3.0.x` release |

The current dual-target release is version 3.0.0. The owner must state whether only the newest release or additional release lines receive security fixes.

## Deployment targets and trust boundaries

Inventory Lens can run as either:

- A Manifest V3 extension whose supported Roblox and Fandom requests leave the browser directly
- A Vercel-hosted web application whose browser data requests go to same-origin `/api/*` Functions before allowlisted outbound Roblox or Fandom requests

The web proxy is a narrow compatibility boundary, not a general-purpose backend. It is stateless at the application level, uses no application secrets or environment variables, creates no user account or durable scan record, and must reject unsupported upstream hosts, paths, methods, and query shapes. RBXCDN images remain direct browser requests in both targets.

Vercel and upstream providers still have their own infrastructure, request logs, abuse-prevention controls, and retention behavior. “No Inventory Lens telemetry” does not mean those providers receive no operational metadata. See [PRIVACY.md](PRIVACY.md) and [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md).

## Current security design

Inventory Lens is designed to minimize credential and account risk:

- It does not request a Roblox API key, OAuth token, password, or extension account.
- Extension Roblox and Fandom requests use `credentials: "omit"`; the hosted path sends no Roblox browser credentials through the proxy.
- It does not read or transmit the user's Roblox cookies.
- Roblox request headers are restricted to `Accept`, `Content-Type`, and the anonymous catalog CSRF challenge token.
- It has no account backend, application database, telemetry, analytics, or advertising endpoint. The web build's Vercel Functions are limited to the documented stateless, allowlisted proxy behavior.
- The web application calls the proxy through same-origin `/api/*` URLs. The publicly reachable Function accepts only destinations that pass an exact origin, path, method, query, and body allowlist; it must not forward an unvalidated destination, cookies, Authorization headers, or arbitrary request headers.
- The web build needs no environment variables or application secrets.
- The profile content script sends only a validated numeric user ID and profile URL and never receives inventory results.
- Cross-context messages are checked for expected type and source values.
- Executable JavaScript is packaged into the extension or hosted static build; neither target loads remote scripts at runtime.
- The Manifest V3 content security policy restricts scripts to the extension package and blocks objects, base rewriting, and framing.
- Host access is restricted to the Roblox and Fandom services documented in [PERMISSIONS.md](PERMISSIONS.md).
- Cursor repetition, empty pages, batch sizes, retries, response delays, and Fandom URL length are bounded.
- Fandom purchase figures are accepted only for catalog pages whose Roblox asset ID matches the requested item.
- Inventory results remain in dashboard memory, while extension session storage contains only the dashboard tab ID.
- Catalog, thumbnail, and Fandom caches have fixed entry bounds and 30- or 60-minute expiration limits.
- Roblox thumbnail response URLs are accepted only when they use HTTPS on `rbxcdn.com` or one of its subdomains.
- In the hosted web build, RBXCDN image bytes load directly in the browser and do not transit through the Vercel proxy.
- Graphic Builder avatar and item images use only validated Roblox CDN URLs, are loaded anonymously, and are drawn as image data to an Inventory Lens-owned browser canvas.
- Graphic Builder backgrounds are deterministic Canvas 2D drawing routines packaged with the application. They do not fetch remote background images, upload content, contact a generator or tracking service, add a host or permission, or transmit the selected background.
- Custom graphic text, including editable bottom-bar labels and display-only currency wording, is rendered with Canvas 2D text APIs rather than inserted as HTML, and text lengths, manual counts, selection size, and output dimensions are bounded.
- The currency block has no payment, wallet, exchange, price-quote, or transaction integration and requests no payment credentials. It is ordinary user-authored canvas text.
- PNG export is created locally through a temporary object URL and user-initiated browser download; it does not require the `downloads` permission or an upload service.
- Startup storage migration removes invalid tab IDs and deprecated API-key-era key names without reading or logging credential values.
- The dashboard provides **Clear local data** to reset the report and remove bounded module caches and known extension storage keys.

## Security boundaries

Inventory Lens retrieves public data from external services. It cannot guarantee the availability, accuracy, or safety of data returned by Roblox, Fandom, Roblox CDN, RBXCDN, or—in the hosted path—Vercel infrastructure. Remote text is rendered as data, remote image URLs are loaded anonymously as images, and no response is treated as executable application code. A failed or cross-origin-blocked Graphic Builder image is replaced by a local placeholder instead of weakening the canvas or script policy.

The hosted proxy reduces browser cross-origin exposure but is still publicly reachable infrastructure. Its allowlist, query validation, request-size bounds, response-size bounds, timeout, and no-server-retry policy are security controls, not merely input conveniences. It must fail closed for unknown routes and must never become an arbitrary proxy or credential relay. Scan progress cannot rely on Function-process memory surviving another request.

The extension cannot access a private inventory through its supported public scan path. It does not attempt legacy privacy workarounds or account-authenticated fallbacks.

Inventory Lens controls do not protect data already present in browser history, operating-system logs, network infrastructure, Vercel platform logs, or third-party service logs. A profile-prefill URL can remain in local browser history until the user clears it. Hosted operators must separately manage Vercel access, deployment, security, and retention settings.

## Dependency and build security

- Install dependencies from the committed `pnpm-lock.yaml` with `pnpm install --frozen-lockfile`.
- Build locally with `pnpm build` and inspect the resulting `dist` directory.
- Build the hosted target with `pnpm run build:web` and inspect `dist-web`; do not treat `dist-web` as an extension package.
- Do not package `.env` files, source maps, cookies, keys, test fixtures containing personal data, or development servers.
- The hosted build requires no environment variables. Treat any future request to add one as a security and privacy review trigger.
- Confirm `manifest.json` is at the root of the distributed ZIP.
- Review dependency audit output before each public release. No automated CI or dependency-scanning policy is currently configured.
- Review both bundled outputs and the Vercel Function source for remote code, unexpected hosts, secrets, unsafe proxy destinations, and unintended logging.

## Release verification

Before publishing version 3.0.0 or a later release:

1. Run the full unit suite and type check.
2. Produce a clean production build.
3. Load `dist` unpacked in current Chrome, Edge, and Brave releases.
4. Test public, private, empty, missing-user, cancellation, rate-limit, and resume behavior.
5. Verify the profile button is idempotent during Roblox single-page navigation.
6. Inspect extension storage and network requests for unintended data or credentials.
7. Test cache expiration, entry bounds, startup migration, and **Clear local data** without affecting browser cookies or history.
8. Inspect the release ZIP and compare its permissions with [PERMISSIONS.md](PERMISSIONS.md).
9. Update the privacy notice and store disclosures if any data flow changed.
10. Test every Graphic Builder layout, all seven built-in backgrounds, and each bottom-bar combination, including an editable custom label, selected-category off-sale totals, a manual number, display-only currency wording, and every-block-hidden mode; verify preview/export background parity and confirm that the PNG is created locally without adding permissions or persisting the draft.
11. Run `pnpm run build:web`, inspect `dist-web`, and confirm no extension-only entry point or credential is exposed in the hosted bundle.
12. Deploy a Vercel preview with no environment variables and verify that browser data calls use same-origin `/api/*` while RBXCDN images load directly.
13. Verify every unsupported proxy route, upstream destination, method, and malformed query fails closed, and inspect Vercel logs for unintended usernames, inventory payloads, Fandom titles, response bodies, or custom graphic text.
14. Review [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md), Vercel project access, deployment protection, log retention, and platform settings before assigning a public domain.

## Coordinated disclosure

After `[SECURITY_CONTACT]` and the supported-version policy are supplied, the owner should add acknowledgement targets, update targets, disclosure coordination, credit preferences, and a safe-harbor statement reviewed for the applicable jurisdiction. These terms are intentionally not invented here.
