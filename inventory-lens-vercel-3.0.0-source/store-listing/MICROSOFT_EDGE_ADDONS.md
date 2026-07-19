# Microsoft Edge Add-ons Draft

Public Roblox inventory analyzer

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

**Release:** Inventory Lens 3.0.0 extension

All bracketed fields must be completed and current Microsoft Edge Add-ons requirements must be verified before submission.

## Product fields

| Field | Draft |
| --- | --- |
| Extension name | Inventory Lens |
| Short description | Analyze public Roblox inventories, count exact asset copies, and review catalog, gift, and collector context. |
| Category | `[EDGE_CATEGORY]` |
| Language | English |
| Website | `[HOMEPAGE_URL]` |
| Support URL | `[SUPPORT_URL]` |
| Privacy policy URL | `[PRIVACY_POLICY_URL]` |
| Markets | `[EDGE_MARKETS]` |
| Pricing | `[CONFIRM_STORE_PRICING]` |

## Full description

Inventory Lens provides an in-browser dashboard for a selected player's public Roblox inventory.

Enter a Roblox username, numeric user ID, or profile URL. You can also open the dashboard from a numeric Roblox profile with the Scan Inventory button. Choose public inventory categories, then search, filter, sort, and inspect the returned records.

Inventory Lens can:

- Count distinct public asset instances and group duplicate copies
- Show public catalog details, thumbnails, instance IDs, serials, and acquisition dates when Roblox supplies them
- Filter by category, item name, copy count, sale state, limited status, known metrics, and collector context
- Sort by known official supply, copies owned by the selected player, acquisition date, collector score, or name
- Keep official limited supply, historical Fandom purchases, gift-source purchases, and player copy counts clearly separated
- Identify a gift reward's source only when its public description provides strict matching evidence
- Explain public collector signals for age, off-sale state, event or promotion distribution, gift history, creator, and limited status
- Build a shareable bordered graphic using the player's full-body avatar and up to 18 selected inventory items
- Edit every text label, reorder items, choose landscape/square/portrait, and export the PNG locally
- Choose Midnight Texture, Neon Grid, Royal Purple, Sunset Ember, Arctic Blue, Emerald Matrix, or Clean Black for the preview and PNG background
- Choose bottom-bar blocks for an editable custom value/label, selected-category or manual off-sale totals, selected items, owned copies, and display-only USD/crypto/custom currency wording
- Hide both the display name and `@username` beneath the avatar and use a neutral PNG filename

The Inventory Lens extension does not require a Roblox API key, extension account, or Roblox login. It does not read Roblox cookies, change account settings, automate trades or purchases, or bypass a private inventory. Its optional currency wording is display text in the exported image, not payment processing, wallet connectivity, credential collection, pricing, or transaction functionality. Graphic backgrounds are deterministic Canvas 2D designs bundled locally; selecting one does not upload content, request a remote background image, add a host or permission, enable tracking, or transmit the choice. The extension uses no developer-operated backend, analytics, telemetry, or advertising; the separately documented Vercel web target is not included in the extension package.

The dashboard makes direct credential-free requests to Roblox for selected public profile, inventory, catalog, and thumbnail data. It sends item-title candidates derived from the scanned public inventory to Roblox Fandom when public catalog-page metadata is needed. A Fandom purchase number is not a verified current-owner count, and a source gift's purchase number is not the reward's supply.

Inventory data and controls remain in the dashboard tab's memory. Enrichment caches have fixed entry limits, expire after 30 or 60 minutes, and can be removed with **Clear local data**.

Roblox generally does not publish current owner counts for ordinary non-limited items. When there is no comparable public count, Inventory Lens says so instead of displaying zero owners. Collector context is an explainable heuristic, not a market appraisal or verified rarity measurement.

Private inventories cannot be scanned. Anonymous badge, pass, purchased-place, and private-server inventory categories are currently unsupported. External services may omit data, return stale metadata, or rate-limit requests.

Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation. Roblox is a trademark of Roblox Corporation. Fandom is a separate third-party service.

## Permission explanation

Inventory Lens requests only browser-session storage, temporary active-tab access, access to numeric Roblox profile pages for its button, and the Roblox/Fandom hosts required for the direct public data requests described above. It does not request cookies, all-site access, web-request interception, identity, downloads, or Open Cloud credentials.

The full permission and endpoint rationale is in `PERMISSIONS.md`.

## What's new in 3.0.0

- Reduced repeated Roblox visibility requests during multi-stage scans
- Added a separately deployable Vercel web target without changing extension permissions or direct-request boundaries
- Preserved the seven local Graphic Builder backgrounds, configurable bottom bar, avatar-identity control, and bordered landscape, square, and portrait PNG export

## Submission fields still required

- `[DEVELOPER_DISPLAY_NAME]`
- `[SUPPORT_CONTACT]`
- `[SUPPORT_URL]`
- `[HOMEPAGE_URL]`
- `[REPOSITORY_URL]`
- `[PRIVACY_POLICY_URL]`
- `[EDGE_CATEGORY]`
- `[EDGE_MARKETS]`
- `[CONFIRM_STORE_PRICING]`
- `[RELEASE_DATE]`
- Final screenshot and promotional assets with documented provenance
- Completed portal privacy, accessibility, support, and distribution declarations
