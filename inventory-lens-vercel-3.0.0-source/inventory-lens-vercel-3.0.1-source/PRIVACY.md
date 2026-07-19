# Inventory Lens Privacy Notice

Public Roblox inventory analyzer

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

**Effective date:** `[EFFECTIVE_DATE]`

**Privacy contact:** `[PRIVACY_CONTACT]`

This notice describes the current Inventory Lens 3.0.0 extension and Vercel-hosted web-build behavior. It should be reviewed by the project owner before public distribution or web deployment and updated whenever data handling changes.

## Summary

Inventory Lens has no application account system, database, durable scan storage, advertising, analytics, or telemetry. It uses no application secrets or Roblox credentials.

The browser extension sends supported public-data requests directly to Roblox and Fandom. The Vercel-hosted web build instead sends those requests through stateless, same-origin, allowlisted Vercel Functions. In both builds, RBXCDN images load directly from the visitor's browser.

The hosted path means Vercel processes request data and ordinary network metadata even though Inventory Lens does not store it at the application level. Roblox, Fandom, RBXCDN, Vercel, browser vendors, and network intermediaries may independently retain operational records under their own policies.

## Deployment modes and request paths

### Manifest V3 extension

The extension sends supported requests from the user's browser directly to the documented Roblox and Fandom hosts with browser credentials omitted. Roblox and Fandom receive the request data plus ordinary browser-network metadata such as IP address, time, and user agent. Validated RBXCDN images also load directly.

The extension has no developer-operated request proxy. It stores only the extension state described below.

### Vercel-hosted web build

The web application sends public-data requests to same-origin `/api/*` endpoints. A Vercel Function validates the method, route, and query against a fixed allowlist before making the corresponding request to Roblox or Fandom. It is not an arbitrary open proxy.

The following data transits through the Vercel Function when needed to perform the user's request:

- Entered Roblox username, resolved numeric user ID, or the relevant portion of a profile target
- Endpoint query data such as selected inventory category, pagination cursor, and public asset or bundle identifiers
- Inventory-derived Fandom page-title candidates used for catalog-page lookup

The Function also receives ordinary request metadata supplied to Vercel, which can include IP address, time, requested URL, request headers, and user agent. Roblox and Fandom receive the Function's outbound request and ordinary server-request metadata. Inventory Lens does not add an application database, telemetry event, analytics identifier, or durable proxy log.

Avatar and item-image requests do not pass through the Function. The browser loads validated HTTPS image URLs directly from `rbxcdn.com` or its subdomains, so RBXCDN receives the visitor's ordinary browser-request metadata.

## Data the user provides

The dashboard accepts one of the following:

- Roblox username or `@username`
- Numeric Roblox user ID
- Roblox profile URL

Inventory Lens uses that value to resolve and scan the selected player's public inventory. In the extension it is sent directly to the applicable Roblox endpoint; in the hosted web build it transits through the same-origin Vercel Function before the allowlisted Roblox request. Inventory Lens does not ask for a real name, email address, password, Roblox cookie, API key, payment information, or application account.

## Data processed in the browser

Depending on the selected categories and available public records, Inventory Lens processes:

- Roblox user ID, username, display name, and avatar thumbnail
- Public inventory asset records and distinct `userAssetId` values
- Public bundle and created-place records
- Public catalog metadata, creator data, sale state, limited state, quantities, descriptions, and dates
- Public thumbnail URLs
- Public Roblox Fandom catalog-page metadata and validated historical purchase figures
- Derived copy groups, filters, sort order, gift relationships, and collector-context signals
- User-entered graphic headlines, subtitles, bottom-bar values and labels, optional currency wording, selected-item order, item captions, and selected built-in background while the dashboard tab remains open

Inventory and catalog data is displayed in the dashboard and held in that tab's memory. The extension does not transmit it to a developer server. In the hosted web build, the request inputs and upstream response necessarily transit through the Vercel Function, but Inventory Lens does not write the response to an application database or other durable application storage.

The Graphic Builder requests the selected player's current public full-body avatar thumbnail, combines it with selected item thumbnails on a local browser canvas, and downloads the finished PNG directly from that canvas. The user can turn off the avatar identity label; this removes both the display name and `@username` from the avatar panel, uses a neutral PNG filename, and removes the player name from the canvas accessibility label. User-editable headline, subtitle, custom bottom-bar value, and custom bottom-bar label are not rewritten and can still contain a name or other user-entered content.

The seven background choices (**Midnight Texture**, **Neon Grid**, **Royal Purple**, **Sunset Ember**, **Arctic Blue**, **Emerald Matrix**, and **Clean Black**) are deterministic Canvas 2D designs bundled with the application. Choosing one updates the local preview and PNG without uploading content, requesting a remote background image, contacting a new host, adding a permission, enabling tracking, or transmitting the choice. The selection is kept only in the same in-memory Graphic Builder draft as the other controls.

The optional currency block is display text only. It can show `USD`, a cryptocurrency name/ticker, or custom currency wording in the local graphic. Inventory Lens does not process payments, connect a wallet, request or validate a wallet address or financial account number, quote prices or exchange rates, or perform transactions. The currency wording is handled like the other graphic text and is not sent to a payment provider or any developer service. Users should not enter sensitive payment credentials, wallet recovery phrases, private keys, or account information into any custom text field.

The draft and rendered pixels are not uploaded by Inventory Lens and are not written to extension storage, web application storage, or the Vercel Function. The downloaded PNG remains in the location selected by the browser until the user deletes it, and the browser may retain its own download-history entry.

## Data stored by Inventory Lens

### Extension storage

Inventory Lens stores only `dashboardTabId`, a numeric browser tab identifier, in `chrome.storage.session`. It is used to reuse one dashboard tab and is removed when that tab closes or when a stale value is detected. Session storage also clears with the browser session.

The extension does not place inventory results, usernames, filters, API keys, cookies, or access tokens in extension storage.

Enrichment caches are held only in JavaScript module memory and are bounded by entry count and time:

- Catalog metadata: at most 4,000 entries for up to 60 minutes
- Thumbnail URLs: at most 8,000 entries for up to 30 minutes
- Positive and negative Fandom lookups: at most 4,000 entries for up to 60 minutes

Least-recently-used entries are evicted when a bound is reached. Entries expire based on their most recent write, and a read does not extend their lifetime. Transport failures are not retained as permanent negative results. The caches also clear when the dashboard extension context reloads or closes or when the user selects **Clear local data**.

On extension startup, an idempotent migration removes invalid dashboard tab IDs and deprecated API-key-era credential key names from extension session and local storage. It does not read, log, or retain a deprecated credential value, and it stores no schema marker.

### Hosted web-build storage

The web build does not use `chrome.storage` and does not add an application database, server-side session, durable cache, analytics store, or telemetry system. Scan results, filters, bounded enrichment caches, and the Graphic Builder draft remain in the active page's JavaScript memory and clear when that page context is discarded or when the user invokes the available clearing control.

The Vercel proxy is stateless at the application level and needs no environment variables or secrets. “No application storage” does not mean no infrastructure records exist: Vercel can retain deployment, security, access, and Function logs under its platform settings and policies, and upstream services may retain their own request records. Those records are not controlled by the Inventory Lens clearing control.

## Browser history

Opening the extension dashboard from a Roblox profile can place the numeric `userId` and `profileUrl` in its URL query. A hosted URL may likewise contain a prefill query when the user or another page constructs one. The browser may retain a visited URL in local history according to browser settings. Users can clear browser history through the browser's own controls.

## Third-party requests

### Roblox

Inventory Lens sends the selected username or user ID, requested category, pagination cursor, and public item or bundle IDs to the relevant Roblox API hosts. In the extension, Roblox receives these requests directly from the user's browser. In the hosted web build, those values first transit through the Vercel Function and Roblox receives the Function's allowlisted outbound request.

Requests use no Roblox login credentials. Neither target attaches the user's Roblox cookies, Authorization header, or API key. The extension request wrapper and hosted proxy allow only the headers and anonymous catalog CSRF challenge behavior needed by the supported public endpoints.

### RBXCDN image servers

The dashboard displays avatar and item images using Roblox-provided HTTPS URLs accepted only on `rbxcdn.com` or its subdomains. In both delivery targets, loading an image causes the browser to contact that RBXCDN image server directly, which receives ordinary network metadata. The hosted proxy does not fetch or retain the image bytes.

### Roblox Fandom

Inventory Lens derives catalog page-title candidates from item names in the scanned public inventory and sends those titles, in batches, to `roblox.fandom.com/api.php` to retrieve public page metadata. It does not include the scanned player's username, user ID, copy counts, full inventory payload, browser cookies, or Roblox credentials in Fandom requests.

In the extension, Fandom receives the request directly from the browser. In the hosted web build, the page-title candidates transit through the Vercel Function and Fandom receives the Function's allowlisted outbound request. Fandom and, for the hosted path, Vercel receive ordinary request metadata appropriate to their position in that request path.

Fandom is a third-party service. Its reported purchase figures may be incomplete, stale, or inaccurate.

### Vercel

Vercel serves the hosted web application's static files and runs its same-origin Functions. Vercel therefore receives the hosted visitor's static-site and Function requests, the proxy query data described above, upstream responses returned through the Function, and ordinary platform request metadata. Inventory Lens does not intentionally send Graphic Builder text, rendered graphics, or RBXCDN image bytes through the Function.

The hosted build has no Inventory Lens environment variables, application secrets, database, account identifier, analytics integration, or telemetry endpoint. Vercel may still provide and retain platform logs, deployment records, firewall or abuse-prevention records, and other operational data under the operator's Vercel configuration and Vercel's own terms and policies.

## Credentials and account access

Inventory Lens does not use a Roblox API key, OAuth token, login, or browser cookie. It cannot modify a Roblox account, inventory, trade, purchase, privacy setting, or other account state.

## Sharing, sale, and advertising

Neither delivery target contains code that sells personal data, shares data with advertisers, serves ads, or builds a cross-site user profile. The direct extension requests and hosted proxy requests described above are necessary to provide the requested scan.

## Retention and deletion

Select **Clear local data** in the dashboard to stop the current scan, reset the report, Graphic Builder draft, and dashboard controls, clear all three in-memory enrichment caches, and remove the current dashboard prefill query from the visible URL. In the extension, it also removes the current `dashboardTabId` and deprecated API-key-era credential key names from extension session and local storage. The web build has no corresponding extension-storage values.

This control does not delete an exported PNG or its browser download-history entry, and it does not clear Roblox cookies, browser history, Roblox site data, third-party records, or storage belonging to websites or other extensions. Reloading or closing the dashboard clears the report, Graphic Builder draft, controls, and module-memory caches. Closing the dashboard also removes its stored tab identifier. Ending the browser session clears `chrome.storage.session`.

If a profile-prefill URL remains in browser history, delete it through the browser's history controls.

Inventory Lens cannot delete records held independently by Roblox, Fandom, RBXCDN, Vercel, the browser vendor, an internet provider, or other network intermediaries. A hosted-project operator must use the applicable Vercel controls for deployment and log retention; the in-app clearing control does not operate those platform controls.

## Public profiles and other people

Either delivery target can analyze another person's inventory only when Roblox reports it as public. Users should handle public profile data responsibly and follow applicable platform terms and laws. Inventory Lens does not bypass private inventory settings.

## Children

Inventory Lens is not designed to create profiles of children or collect their information into an application database. The hosted build does use Vercel infrastructure for the transient request flow disclosed above. Roblox users and guardians should use the browser and Roblox privacy controls appropriate to their circumstances. Public extension release or web deployment requires the project owner to review applicable store, hosting-platform, and legal requirements for the intended audience.

## Changes to this notice

Any release or deployment that changes hosts, proxy routes, stored fields, telemetry, authentication, or data handling should update this notice and, where applicable, the extension's store disclosures before distribution.

## Contact

Privacy questions require a project-owned contact method. Replace `[PRIVACY_CONTACT]` above with a monitored address or support URL before publishing, and replace `[EFFECTIVE_DATE]` with the notice's real effective date. No contact address has been invented in this draft.
