# Store Permission Justifications

Public Roblox inventory analyzer

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

**Release under review:** Inventory Lens 3.0.0 extension

These justifications correspond to the current Chromium `manifest.json`. Copy them into store portals only after comparing them with the final packaged manifest.

## Single purpose

Inventory Lens analyzes and presents a user-selected public Roblox inventory in-browser. It counts distinct public asset instances, organizes related public catalog and collector metadata, and lets the user arrange those same results into a locally exported collection graphic with a selected built-in background and optional user-selected bottom-bar totals and display text.

Editable bottom-bar values/labels, selected-category off-sale totals, and optional USD/crypto/custom currency wording require no new permission or external service. They use the in-memory scan report and user-entered text and are drawn to the local canvas. Currency wording is display-only; Inventory Lens does not contact a payment processor, wallet, exchange, or transaction service.

The seven Graphic Builder backgrounds also require no new permission, host, or external service. **Midnight Texture**, **Neon Grid**, **Royal Purple**, **Sunset Ember**, **Arctic Blue**, **Emerald Matrix**, and **Clean Black** are deterministic Canvas 2D routines bundled with the extension. The same selection drives preview and PNG export, stays in the in-memory draft, and is not uploaded or transmitted. No remote background image, generator, or tracking request is made.

## API permissions

### `storage`

Inventory Lens uses `chrome.storage.session` to retain only the numeric ID of the reusable dashboard tab. The value lets the toolbar, popup, and profile-page helper focus the existing dashboard instead of opening duplicates. Invalid values and deprecated API-key-era key names are removed on startup. **Clear local data** removes the current tab ID and known deprecated credential key names.

The extension does not persist a scanned inventory, username, filters, API key, cookie, token, or cache in extension storage.

### `activeTab`

After a user invokes Inventory Lens from the toolbar, it can read the active tab's URL to recognize a numeric Roblox profile and prefill that profile. Access is temporary and tied to the user's action. Inventory Lens does not use it to build browsing history or inspect arbitrary page content.

## Host permissions

### `https://users.roblox.com/*`

Resolves an entered username and retrieves the selected public user's profile details. The request contains the entered username or numeric user ID and omits browser credentials.

### `https://inventory.roblox.com/*`

Checks whether the selected inventory is public and retrieves the selected public asset categories and publicly created places. Requests contain a user ID, category or asset type, pagination cursor, and public query parameters. Private inventories are not bypassed.

### `https://catalog.roblox.com/*`

Retrieves the selected user's public bundle pages and batched public catalog metadata for displayed assets and bundles. Requests contain a user ID or public item IDs and omit browser credentials.

### `https://thumbnails.roblox.com/*`

Retrieves public headshot, Graphic Builder full-body avatar, asset, and bundle thumbnail URLs in bounded requests. Returned image URLs are accepted only when they use HTTPS on `rbxcdn.com` or a subdomain.

### `https://roblox.fandom.com/*`

Retrieves public catalog-page metadata and historical purchase context. Inventory Lens sends batched catalog page-title candidates derived from item names in the scanned public inventory. It does not send the player's username, user ID, copy counts, full inventory payload, Roblox cookies, or authentication credentials to Fandom. Exact Roblox catalog IDs are validated before a figure is attached to an item.

## Content-script match patterns

- `https://www.roblox.com/users/*/profile*`
- `https://roblox.com/users/*/profile*`

The content script adds the **Scan Inventory** helper only on a valid numeric Roblox profile and follows Roblox single-page navigation without duplicating the button. It sends only the message type, source, numeric user ID, and profile URL to the extension. It never receives inventory results, copy counts, catalog metadata, Fandom results, cookies, or credentials.

## Background service worker and popup

The packaged service worker coordinates one reusable dashboard tab, validates prefill messages, and removes invalid or deprecated extension-owned storage keys. The toolbar popup provides a small local entry point to open the dashboard, use the active numeric profile when available, and reach the dashboard's privacy controls. Neither component performs account-changing actions.

## Content Security Policy

`script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`

All executable code is packaged with the extension. Inventory Lens does not download, inject, or evaluate remote executable code.

## Permissions not requested

Inventory Lens does not request:

- `cookies`
- `webRequest`
- `<all_urls>`
- `scripting`
- `identity`
- `downloads`
- Roblox Open Cloud credentials

## Request and retention safeguards

- Roblox and Fandom API requests use `credentials: "omit"`.
- Roblox request headers are restricted to `Accept`, `Content-Type`, and the anonymous CSRF challenge token.
- Pages, batch sizes, repeated cursors, URL lengths, retries, and retry delays are bounded.
- Catalog metadata is cached in module memory for at most 60 minutes and 4,000 entries.
- Thumbnail URLs are cached in module memory for at most 30 minutes and 8,000 entries.
- Positive and negative Fandom lookups are cached in module memory for at most 60 minutes and 4,000 entries.
- **Clear local data** resets the dashboard and removes bounded module caches and known extension storage keys without clearing Roblox cookies, Roblox site data, or browser history.

## Change control

A new or widened permission requires an implementation review, tests, an updated root `PERMISSIONS.md`, an updated [privacy-disclosure.md](privacy-disclosure.md), revised store copy, and a clean-package inspection before release.
