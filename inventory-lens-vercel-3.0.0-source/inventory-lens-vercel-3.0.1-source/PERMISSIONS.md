# Inventory Lens Permissions

Public Roblox inventory analyzer

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

This document explains every permission and host declared by Inventory Lens 2.3.0. If `manifest.json` changes, update this document and the store disclosures in the same release.

## Browser permissions

### `storage`

- **Why it is required:** remember one numeric dashboard tab ID for the current browser session and remove obsolete credential-key names left by pre-release builds.
- **Exact feature:** dashboard-tab reuse, stale-tab cleanup, migration, and **Clear local data**.
- **Data it can access:** Inventory Lens's own extension storage areas. The current value is only `dashboardTabId`; inventory records, player searches, filters, cookies, and credentials are not stored.
- **Developer transmission:** none. Storage is accessed locally and is never sent to the developer.
- **Why narrower is not sufficient:** there is no tab-scoped alternative that survives a Manifest V3 service worker sleeping and can be cleared/migrated through the extension storage API. `storage.session` is used for the live value rather than persistent or synced storage.

### `activeTab`

- **Why it is required:** determine whether the tab visible when the user opens the toolbar popup is a supported numeric Roblox profile.
- **Exact feature:** conditionally show **Scan current Roblox profile** and prefill that numeric profile in the dashboard.
- **Data it can access:** the active tab's URL only during the user-invoked toolbar interaction. The popup does not read page contents or browsing history.
- **Developer transmission:** none. The URL check and profile-ID parsing occur locally.
- **Why narrower is not sufficient:** the browser must expose the current tab URL to offer the optional shortcut. `activeTab` is narrower than unrestricted `tabs` because access is temporary and user initiated.

Selecting the toolbar icon opens a compact popup. **Open Inventory Lens** works on any page; **Scan current Roblox profile** appears only for a supported canonical profile.

Inventory Lens does not request `cookies`, `webRequest`, `<all_urls>`, unrestricted `tabs`, `scripting`, `identity`, `downloads`, or Roblox Open Cloud access.

Graphic Builder's configurable bottom-bar values, labels, selected-category off-sale totals, and optional currency wording require no additional browser permission or host access. They are combined from the in-memory report and user-entered text, then drawn on the local canvas. The currency block is display-only and does not contact a payment processor, wallet, exchange, pricing service, or developer endpoint.

Graphic Builder's seven selectable backgrounds also require no additional browser permission or host access. **Midnight Texture**, **Neon Grid**, **Royal Purple**, **Sunset Ember**, **Arctic Blue**, **Emerald Matrix**, and **Clean Black** are deterministic Canvas 2D designs bundled with Inventory Lens. The extension does not upload a background, request a remote background image, contact a generator or tracking service, or transmit the selected background. The selection remains in the current dashboard's in-memory draft and is applied equally to preview and PNG export.

## Host permissions

### `https://users.roblox.com/*`

- **Why it is required:** resolve a username and retrieve public profile details.
- **Exact feature:** scanner input resolution and owner summary.
- **Data it can access:** entered username or numeric user ID and the matching public user record.
- **Developer transmission:** none; requests go directly from the browser to Roblox.
- **Why narrower is not sufficient:** username lookup and user-detail routes share this origin, and Manifest V3 host permissions are origin/path-pattern based.

### `https://catalog.roblox.com/*`

- **Why it is required:** enumerate public bundles and retrieve public catalog metadata.
- **Exact feature:** bundle scanning, sale/limited status, supply, creator, description, dates, favorites, and gift/collector context.
- **Data it can access:** selected user ID for public bundle pages and batches of public asset or bundle IDs for metadata.
- **Developer transmission:** none; requests go directly from the browser to Roblox.
- **Why narrower is not sufficient:** the bundle and catalog-detail routes use the same origin; the declared pattern is already restricted to that origin.

### `https://inventory.roblox.com/*`

- **Why it is required:** check inventory visibility and enumerate selected public categories.
- **Exact feature:** public asset scanning, exact `userAssetId` copy counts, public created places, pagination, and category progress.
- **Data it can access:** selected user ID, asset-type/category parameters, and pagination cursors, plus Roblox's public response records.
- **Developer transmission:** none; requests go directly from the browser to Roblox.
- **Why narrower is not sufficient:** visibility, asset inventory, and created-place routes share this origin, and category paths are constructed dynamically from the user's selection.

### `https://thumbnails.roblox.com/*`

- **Why it is required:** request public avatar and item thumbnail URLs.
- **Exact feature:** owner headshot, Graphic Builder full-body avatar, asset cards, bundle cards, and local graphic composition.
- **Data it can access:** user ID or batches of public item IDs, asset type, and requested image dimensions.
- **Developer transmission:** none; requests go directly from the browser to Roblox.
- **Why narrower is not sufficient:** user, asset, and bundle thumbnail routes share this origin. Returned image URLs are separately restricted to HTTPS RBXCDN hosts.

### `https://roblox.fandom.com/*`

- **Why it is required:** request public MediaWiki catalog-page content used by existing historical-purchase, gift, event, and collector-context features.
- **Exact feature:** validated Fandom history enrichment and source links.
- **Data it can access:** batched item-title candidates derived from the scanned public inventory and the returned public article content. Player identity, copy counts, and the full inventory payload are not included.
- **Developer transmission:** none; requests go directly from the browser to Fandom, which still receives normal request metadata under its own policies.
- **Why narrower is not sufficient:** Chromium grants programmatic cross-origin access at host-pattern scope; code itself fixes requests to `/api.php`, uses `GET`, and validates catalog IDs before displaying metrics.

Roblox and Fandom requests use `credentials: "omit"`. The extension does not attach browser cookies or authentication credentials.

## Profile-page content-script access

- **Permission names:** `https://www.roblox.com/users/*/profile*` and `https://roblox.com/users/*/profile*` in `content_scripts.matches`.
- **Why it is required:** place the small **Scan Inventory** helper on supported Roblox profiles.
- **Exact feature:** profile prefill and idempotent single-page-navigation handling.
- **Data it can access:** the current profile URL and numeric ID. It does not inspect inventory page data.
- **Developer transmission:** none. It sends only a validated internal message to the extension background worker and never receives scan results.
- **Why narrower is not sufficient:** both Roblox hostname forms are valid; the path patterns exclude non-profile pages, and runtime validation further requires an HTTPS canonical positive-numeric profile URL.

## Network behavior without a host permission

Roblox thumbnail APIs return image URLs hosted by RBXCDN. Inventory Lens accepts only HTTPS URLs on `rbxcdn.com` or its subdomains, then places an accepted URL in an ordinary image element. Graphic export loads selected images with anonymous cross-origin mode before drawing them to the local canvas. The resulting browser image request can contact that image host even though the extension does not make a programmatic API request to it and does not declare an additional programmatic host permission for it.

## Public API operations

The current implementation uses these public operations:

- `GET /v1/users/<id>` and `POST /v1/usernames/users`
- `GET /v1/users/<id>/can-view-inventory`
- `GET /v2/users/<id>/inventory/<assetTypeId>` with 100-item cursor pages
- `GET /v1/users/<id>/bundles` with 100-item cursor pages
- `GET /v1/users/<id>/places/inventory` for publicly created places
- `POST /v1/catalog/items/details` in batches of at most 120
- Thumbnail lookups in batches of at most 100, plus one full-body avatar lookup when Graphic Builder opens
- `GET /api.php` on Roblox Fandom for catalog titles in batches of at most 20

The anonymous Roblox catalog-details endpoint may issue a CSRF challenge. Inventory Lens accepts the challenge token for that request flow without sending cookies or account credentials.

## Rate limits and request bounds

Inventory Lens scans selected category segments sequentially, stops on empty pages or repeated cursors, and bounds batch sizes. It honors Roblox rate-limit and retry headers with bounded delays and at most one scanner retry. Fandom requests are throttled, URL-length bounded, and retried once within a capped delay.

## Content Security Policy

The extension permits only packaged scripts and blocks plugin objects, base-URL rewriting, and framing. It does not load executable code from Roblox, Fandom, or any other remote host.

## Review checklist for permission changes

Before adding or widening a permission:

1. Confirm it is necessary for the extension's single purpose.
2. Prefer a narrower host or user-triggered permission.
3. Document the exact data sent and retained.
4. Add tests for message validation and credential handling.
5. Update `PRIVACY.md`, this file, and both store disclosure drafts.
6. Reinspect the release package for remote code, secrets, environment files, and undeclared hosts.
