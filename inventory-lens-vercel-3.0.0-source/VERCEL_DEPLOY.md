# Deploy Inventory Lens on Vercel

Inventory Lens can be deployed as a Vite single-page web application with a small set of stateless Vercel Functions. This is a separate delivery target from the Manifest V3 browser extension: deploying the web build does not install an extension or grant browser-extension permissions.

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

## What Vercel deploys

- `pnpm run build:web` creates the browser application in `dist-web`.
- Root-level `api/*.ts` files are deployed by Vercel as same-origin Functions under `/api/*`.
- The web application calls only the proxy's allowlisted routes. The proxy is not a general-purpose URL forwarder.
- RBXCDN avatar and item images load directly in the visitor's browser from validated HTTPS URLs on `rbxcdn.com` or its subdomains.
- The deployment needs no environment variables, Roblox credentials, API keys, database, account system, or persistent application storage.

The Functions exist to make the same public Roblox and Fandom requests that the extension can make directly. They process each request transiently and return the upstream response; they do not create a durable inventory record or user profile.

## Data-flow difference from the extension

The two builds have different network paths:

| Build | Public data requests | Image requests |
| --- | --- | --- |
| Browser extension | The browser sends supported requests directly to Roblox and Fandom with credentials omitted. | The browser loads validated RBXCDN URLs directly. |
| Vercel web build | The browser sends the username or user ID and endpoint query data to same-origin `/api/*` Functions. The Function sends an allowlisted request to Roblox. Fandom page-title candidates also transit through the Function before the allowlisted Fandom request. | The browser loads validated RBXCDN URLs directly; images do not pass through the application proxy. |

Inventory Lens adds no telemetry or analytics and stores no scan at the application level. Vercel still receives ordinary request metadata for Function and static-site requests, such as IP address, time, URL, user agent, and operational logs. Roblox and Fandom receive the proxy's outbound requests and their ordinary server-request metadata. RBXCDN receives ordinary browser-request metadata because images load directly. Those providers apply their own policies and retention practices. See [PRIVACY.md](PRIVACY.md) for the full disclosure.

## Prerequisites

- A Vercel account.
- Node.js satisfying the repository's `engines` requirement.
- `pnpm` through Corepack or a local installation.
- Either a GitHub, GitLab, or Bitbucket repository connected to Vercel, or the Vercel CLI.

Vercel supports Vite projects and discovers root-level TypeScript Functions automatically. See Vercel's official [Vite guide](https://vercel.com/docs/frameworks/frontend/vite) and [Node.js Functions documentation](https://vercel.com/docs/functions/runtimes/node-js).

## Deploy from the Vercel dashboard

1. Push the repository to GitHub, GitLab, or Bitbucket.
2. In Vercel, select **Add New → Project** and import that repository.
3. Set the project **Root Directory** to the repository root containing `package.json` and `vercel.json`. Do not select `dist`, `dist-web`, or the extension release folder.
4. Confirm the **Framework Preset** is **Vite**.
5. Set the **Build Command** to:

   ```text
   pnpm run build:web
   ```

6. Set the **Output Directory** to:

   ```text
   dist-web
   ```

7. Leave environment variables empty. Inventory Lens does not require any for this deployment.
8. Select **Deploy**.

The repository configuration should provide the same build and output settings. The dashboard values are listed here so the deployment can be audited before publishing.

Every connected-branch push can produce a Vercel preview deployment, while pushes to the configured production branch update production. Review preview deployments before promoting changes that affect proxy routing or privacy disclosures.

## Deploy with the Vercel CLI

From the repository root:

```powershell
corepack pnpm install --frozen-lockfile
pnpm run build:web
npm install --global vercel
vercel
```

The first `vercel` command links or creates the project and creates a preview deployment. Confirm the detected project root and committed configuration. Do not add environment variables when prompted.

After testing the preview, deploy the same source to production:

```powershell
vercel --prod
```

Vercel documents both preview and production CLI deployment in its [CLI deployment guide](https://vercel.com/docs/cli/deploying-from-cli).

## Local verification before deployment

Run the ordinary checks plus the dedicated web build:

```powershell
corepack pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm run verify:web
```

Confirm that `dist-web` contains the web entry point and static assets. `dist-web` is not the extension package: it should not be loaded through `chrome://extensions`, `edge://extensions`, or `brave://extensions`.

`pnpm run dev:web` serves the Vite interface for frontend work, but it does not emulate Vercel Functions. To exercise real `/api/*` routing locally after linking the project, use the Vercel CLI's `vercel dev`; otherwise use a Vercel preview deployment for the end-to-end scan smoke test.

## Post-deployment smoke test

After Vercel reports a successful deployment:

1. Open the deployment URL and confirm the dashboard loads on a fresh browser profile.
2. Resolve a public Roblox username and numeric user ID.
3. Scan a small category, then a broader set of categories.
4. Confirm private inventories fail closed and are not retried through an alternate privacy path.
5. Confirm catalog, Fandom, gift, collector-context, filtering, and Graphic Builder behavior.
6. In browser developer tools, confirm public data calls use same-origin `/api/*` URLs in the web build.
7. Confirm item and avatar images load directly from validated RBXCDN hosts.
8. Confirm the proxy rejects an unsupported path, host, method, or malformed query rather than forwarding it.
9. Check Vercel Function logs for errors, but do not add logging of response bodies, inventory payloads, usernames, Fandom titles, or custom graphic text.
10. Confirm the Vercel project has no application environment variables or secrets configured for Inventory Lens.

## Operational notes

- The proxy is stateless. Do not rely on Function memory, a temporary filesystem, or a warm instance to preserve scan progress between requests.
- Inventory scan state, filters, and Graphic Builder drafts remain in the current browser tab's memory. Reloading the page clears that application state.
- Roblox and Fandom rate limits and outages still apply. Vercel hosting does not make unavailable or private data accessible.
- A hosted deployment's visitors share the deployment's outbound Function infrastructure, so a public multi-user deployment can encounter Roblox rate limits sooner than separate direct extension users. The current design is intended for personal or light use, not unbounded public scale.
- Keep results paginated and bounded. Vercel currently limits a Function request or response payload to 4.5 MB; consult the current [Function limits](https://vercel.com/docs/functions/limitations) before changing batching behavior.
- Keep `/api/*` reserved for the Functions when changing SPA rewrites. A catch-all rewrite must not turn an API request into `index.html`.
- Do not add arbitrary destination URLs, credential forwarding, cookies, Authorization headers, or a user-controlled upstream host to the proxy allowlist.
- A public operator must complete the privacy and security contact placeholders and review Vercel's current platform, legal, logging, abuse-prevention, and retention settings before launch.

## Updating or removing the deployment

A new production deployment replaces the currently served application code but does not erase records held independently in Vercel operational systems or third-party service logs. Manage deployment retention, logs, domains, and project deletion from the Vercel dashboard according to the operator's account and plan.

Removing the hosted project does not affect an independently installed Inventory Lens extension. Likewise, uninstalling the extension does not remove a Vercel deployment.
