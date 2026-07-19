# Store Privacy Disclosure

Public Roblox inventory analyzer

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

**Release under review:** Inventory Lens 3.0.0 extension

This worksheet records facts about the current extension. Store questionnaire language and legal classifications can change, so the project owner must map these facts to the exact portal questions at submission time. This is not legal advice and is not a substitute for the hosted privacy policy.

## Processing and transmission matrix

| Data or activity | Source | Used for | Where it goes | Retention by Inventory Lens |
| --- | --- | --- | --- | --- |
| Entered Roblox username | User | Resolve the selected public profile | Directly to `users.roblox.com` | Dashboard memory only |
| Numeric Roblox user ID | User, profile URL, or Roblox lookup | Profile, visibility, inventory, bundle, place, avatar requests | Directly to relevant Roblox API hosts; may appear in the dashboard URL after profile prefill | Dashboard memory; prefill URL may remain in browser history |
| Roblox profile URL | User or active profile tab | Parse and prefill a numeric user ID | Minimal profile message remains inside the extension; the URL may be placed in the dashboard query | Dashboard memory and possible browser history |
| Public profile and inventory records | Roblox | Display and analyze the requested inventory | Browser dashboard only after Roblox response | Dashboard memory only |
| Distinct `userAssetId` values | Roblox | Count exact asset instances and show copy details | Browser dashboard only after Roblox response | Dashboard memory only |
| Asset, bundle, and place IDs | Roblox | Catalog metadata and thumbnails | Directly to Roblox catalog and thumbnail APIs | Catalog metadata: at most 4,000 entries for 60 minutes; thumbnail URLs: at most 8,000 entries for 30 minutes; module memory only |
| Catalog page-title candidates | Derived from item names in the scanned public inventory | Request public Fandom catalog metadata | Directly to `roblox.fandom.com/api.php` | Positive and negative lookups: at most 4,000 entries for 60 minutes; module memory only |
| Historical purchase figures | Fandom | Display typed catalog or source-gift context | Browser dashboard only after Fandom response | Module/dashboard memory only |
| Thumbnail image URLs | Roblox | Display avatars and items | Browser contacts the applicable Roblox or RBXCDN image host | URL cached in module memory; normal browser image caching may apply |
| Dashboard tab ID | Browser | Reuse one dashboard tab | `chrome.storage.session` only | Until tab closure, stale cleanup, or browser-session end |
| Filter and sort choices | User | Update the current display | Browser dashboard only | React memory until reload or tab closure |
| Graphic text, bottom-bar values/labels, optional currency wording, selected item order, and captions | User | Render and download a custom local graphic | Browser dashboard canvas and the user's downloaded PNG only | Draft/pixels remain in React/canvas memory until reload or tab closure; the downloaded file remains until the user deletes it |
| Selected built-in graphic background | User | Apply the same bundled Canvas 2D design to preview and PNG | Browser dashboard canvas and the user's downloaded PNG only; no selection transmission or remote background request | In-memory draft until reload or tab closure; rendered pixels remain in the downloaded file until the user deletes it |

Inventory Lens has no developer endpoint, so the developer does not receive these fields through the extension.

Graphic Builder can omit the display name and `@username` from the avatar panel, canvas accessibility label, and PNG filename. Custom headline and subtitle text are not rewritten and may still contain a player name if the user leaves or enters one.

Graphic Builder provides **Midnight Texture**, **Neon Grid**, **Royal Purple**, **Sunset Ember**, **Arctic Blue**, **Emerald Matrix**, and **Clean Black** as deterministic Canvas 2D designs packaged with the extension. Selecting a background does not upload an image, download a remote background, contact a generator or tracking service, add a host or permission, or transmit the selection. The same local selection is used for preview and PNG export.

Graphic Builder can also display `USD`, a user-entered cryptocurrency name/ticker, or other custom currency wording. This is ordinary canvas text, not payment processing. Inventory Lens does not connect a wallet, request or validate a wallet address or financial account number, quote a price or exchange rate, or perform a transaction. The wording is not sent to a payment provider or developer service. Users should not place payment credentials, wallet recovery phrases, private keys, or account information in any custom text field.

## Credentials

- Roblox password: not requested or processed
- Roblox cookie: not read or transmitted
- Roblox API key: not requested or processed
- OAuth token: not requested or processed
- Payment or financial credentials/account information: not requested or processed; optional generic currency wording is rendered as local display text only
- Extension account credentials: no extension account exists

Roblox and Fandom requests use `credentials: "omit"`.

## Store data-category review

The portal reviewer should evaluate these potential categories using the store's current definitions:

- **Identifiers or personally identifiable information:** A user can enter a Roblox username or user ID, including another public player's identifier. It is sent to Roblox to provide the requested scan but not to the developer.
- **Website content:** The extension handles public profile and inventory content requested by the user. It remains in the browser after direct retrieval from Roblox.
- **Web history or browsing activity:** The extension does not build or transmit browsing history. On a toolbar click it can inspect the active tab URL, and its narrow content script runs only on numeric Roblox profile paths. A prefill URL can remain in local browser history.
- **User activity:** Category, filter, and sort choices are used only in the open dashboard and are not transmitted to the developer.
- **Authentication information:** None.
- **Location, communications, health, financial-account, or payment-credential data:** None requested by the extension. A generic currency label entered for the graphic is user-authored display text, not a transaction or account record.

Do not answer a portal's “data collection” question solely from the absence of a developer backend. Some stores classify direct transmission to a service provider or public API as data handling that must be disclosed.

## Purpose limitation

Data is used only to provide the user-requested public inventory analysis and presentation, display public item metadata, compose a selected-results graphic locally (including user-chosen bottom-bar wording), maintain the reusable dashboard tab, and protect request integrity.

The current extension does not use data for:

- Personalized advertising or advertising measurement
- Sale to data brokers or other parties
- Credit, lending, insurance, employment, or eligibility decisions
- Cross-site tracking or creation of a browsing profile
- Unrelated analytics or product telemetry
- Training a developer-operated machine-learning system

## Third parties

| Party | Purpose | Credential behavior |
| --- | --- | --- |
| Roblox | Resolve users; check inventory visibility; retrieve selected public inventory, bundle, place, catalog, and thumbnail data | Requests omit browser credentials |
| Roblox / RBXCDN image hosts | Serve the selected public avatar and item images | Ordinary image requests; no extension-added authentication |
| Roblox Fandom | Return public catalog-page metadata used for exact-ID-validated historical purchase context | Requests omit browser credentials and do not include the player's identifier or inventory payload |

Each service can receive ordinary network metadata such as IP address and user agent. Their own policies and retention practices apply.

## Storage and deletion

Scan records, filters, derived gift relationships, and collector signals clear when the dashboard reloads or closes. Module-memory enrichment caches use least-recently-used eviction at their entry bounds and expire based on the most recent write; reads do not extend the lifetime. The session-stored dashboard tab ID clears when the tab closes, stale cleanup runs, or the browser session ends.

The **Clear local data** control stops the current scan, resets the report, Graphic Builder draft, and controls, clears the three enrichment caches, removes `dashboardTabId`, removes deprecated API-key-era credential key names from extension session/local storage, and removes the current dashboard prefill query from the visible URL. It does not delete an exported PNG or its browser download-history entry, and it does not clear Roblox cookies, browser history, Roblox site data, third-party records, or storage belonging to websites or other extensions.

The browser can independently retain the dashboard prefill URL in history, a PNG download entry, and remote images in its HTTP cache. Exported PNG files remain in the chosen download location until the user deletes them. Users control those records through browser and operating-system settings.

## Security and remote code

- No remote executable code
- No dynamic script download or evaluation
- Packaged Manifest V3 scripts only
- Restricted extension content security policy
- Restricted request headers and credential omission
- Minimal validated profile-page messages
- Bounded pagination, batching, delays, and retries

## Portal statements requiring owner confirmation

- `[PRIVACY_POLICY_URL]` is published and matches the final binary.
- `[SUPPORT_CONTACT]` and `[SECURITY_CONTACT]` are monitored.
- Store pricing and any future monetization are accurately declared.
- Intended audience and any child-directed classification are reviewed.
- Distribution regions and applicable legal bases are reviewed.
- The final portal answers use the store's current definitions.
- The final ZIP matches this worksheet and `PERMISSIONS.md`.
