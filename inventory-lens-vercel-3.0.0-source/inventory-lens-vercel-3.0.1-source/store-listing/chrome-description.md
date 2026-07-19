# Chrome Web Store Description

Public Roblox inventory analyzer

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

**Release:** Inventory Lens 3.0.0 extension

All bracketed fields must be completed and current Chrome Web Store requirements must be verified before submission.

## Product fields

| Field | Draft |
| --- | --- |
| Name | Inventory Lens |
| Summary | Analyze public Roblox inventories, count exact copies, and build collection graphics from the results. |
| Category | `[CHROME_CATEGORY]` |
| Language | English |
| Homepage | `[HOMEPAGE_URL]` |
| Support URL | `[SUPPORT_URL]` |
| Privacy policy URL | `[PRIVACY_POLICY_URL]` |
| Pricing | `[CONFIRM_STORE_PRICING]` |

## Detailed description

Inventory Lens analyzes a selected player's public Roblox inventory in a browser dashboard.

Enter a Roblox username, numeric user ID, or profile URL, or open Inventory Lens from a numeric Roblox profile. Select the inventory categories you want to scan, then search, filter, sort, and inspect the public results.

Features:

- Counts distinct public asset instances returned by Roblox and groups duplicate copies
- Provides category and subcategory controls, including avatar-focused and classic-clothing presets
- Filters by item name, copies owned, category, limited status, sale state, known metrics, and collector context
- Sorts by known official supply, player copy count, acquisition date, collector score, or name
- Shows public catalog details, thumbnails, instance IDs, serials, and acquisition dates when available
- Keeps official limited supply separate from historical purchases and other measurements
- Uses exact-ID-validated Roblox Fandom pages for historical purchase context when available
- Connects a gift reward to its source gift when the public description provides strict evidence
- Explains collector-context signals for old, off-sale, event, promotion, gift, creator, and limited items
- Adds a Scan Inventory button to numeric Roblox profile pages
- Builds a shareable bordered graphic from the player's full-body avatar and up to 18 selected inventory items
- Provides editable text and captions, item ordering, landscape/square/portrait layouts, and local high-resolution PNG export
- Switches among seven local built-in backgrounds: Midnight Texture, Neon Grid, Royal Purple, Sunset Ember, Arctic Blue, Emerald Matrix, and Clean Black
- Builds the bottom bar from selectable blocks: an editable custom value and label, selected-category or manual off-sale totals, optional selected-item/owned-copy counts, and display-only USD/crypto/custom currency wording
- Can hide the display name and `@username` beneath the avatar and use a neutral exported filename

Inventory Lens does not require a Roblox API key or extension account. It does not read Roblox cookies, change account state, automate trades or purchases, or bypass private inventory settings. The optional currency block is text in the exported image only; it does not process payments, connect wallets, collect payment credentials, quote prices, or perform transactions. The seven backgrounds are deterministic Canvas 2D designs bundled with the extension; selecting one does not upload content, request a remote background image, add a host or permission, enable tracking, or transmit the choice. Public scans depend on the records Roblox makes available anonymously.

An ordinary non-limited item's current owner count is generally not public. Inventory Lens therefore shows “Public count unavailable” rather than treating missing or zero sales as zero owners. A Fandom purchase figure is historical page data, not a current owner count. A source-gift purchase figure is context about the gift, not the reward's copy count.

Inventory data and filters remain in the dashboard tab's memory. Enrichment caches are entry-bounded, expire after 30 or 60 minutes, and can be removed with **Clear local data**. Inventory Lens has no developer-operated backend, analytics, telemetry, or advertising. Direct requests are made to Roblox for public profile, inventory, catalog, and thumbnail data and to Roblox Fandom for public catalog-page metadata. Fandom item-title candidates are derived from the scanned public inventory. These requests omit browser credentials.

Current limitations include private inventories, third-party omissions or rate limits, and unsupported anonymous badge, pass, purchased-place, and private-server inventory categories. Bundle and created-place results indicate public presence but do not enumerate multiple owned instances.

Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation. Roblox is a trademark of Roblox Corporation. Fandom data may be missing, stale, or inaccurate.

## Single-purpose statement

Inventory Lens's single purpose is to analyze and present a user-selected public Roblox inventory in-browser by counting distinct public asset instances, organizing related public item metadata, and arranging those same results into a local collection graphic with a user-selected built-in background, display text, and inventory totals.

## Permission rationale

- **storage:** Keeps only the numeric dashboard tab ID in browser-session extension storage so toolbar and profile actions reuse one dashboard.
- **activeTab:** Lets the toolbar popup recognize a canonical numeric Roblox profile and offer a prefilled dashboard action.
- **users.roblox.com:** Resolves usernames and retrieves public user details.
- **inventory.roblox.com:** Checks public visibility and retrieves selected public assets and created places.
- **catalog.roblox.com:** Retrieves public bundle pages and batched catalog details.
- **thumbnails.roblox.com:** Retrieves public avatar and item thumbnail URLs.
- **roblox.fandom.com:** Retrieves public catalog-page metadata for exact-ID-validated historical purchase context.
- **Roblox profile content script:** Adds the Scan Inventory button to numeric profile pages and sends only minimal profile prefill data.

See [permission-justifications.md](permission-justifications.md) and the root `PERMISSIONS.md` for endpoint and data-flow details.

## Privacy questionnaire notes

Use [privacy-disclosure.md](privacy-disclosure.md) to complete the portal questionnaire against the final build. Do not state that no data leaves the device: the extension directly contacts Roblox, Roblox-hosted image servers, and Fandom to provide its requested functionality.

The developer does not receive scan data because there is no developer backend. The extension does not sell data, use it for advertising, determine creditworthiness, or maintain a cross-site browsing profile.

## Version 3.0.0 release notes

Inventory Lens 3.0.0 reduces repeated Roblox visibility checks during multi-stage scans and adds a separately deployable Vercel web target. The extension remains credential-free and continues making only its declared direct public-data requests; the web target and its transient proxy are separate from the extension package. Existing Graphic Builder backgrounds, configurable bottom bar, filters, and local PNG export remain available.

## Submission fields still required

- `[DEVELOPER_DISPLAY_NAME]`
- `[SUPPORT_CONTACT]`
- `[SUPPORT_URL]`
- `[HOMEPAGE_URL]`
- `[REPOSITORY_URL]`
- `[PRIVACY_POLICY_URL]`
- `[CHROME_CATEGORY]`
- `[CONFIRM_STORE_PRICING]`
- `[RELEASE_DATE]`
- Final screenshot and promotional assets with documented provenance
- Completed portal privacy and distribution declarations
