# Feature inventory

This document records the behavior preserved in Inventory Lens through version **2.3.0**. It is a preservation baseline: changes should not silently remove or reinterpret anything listed here.

## Product boundary

- Open-source Manifest V3 extension for Chrome, Edge, and Brave; the same production folder can be loaded unpacked for development and review.
- React 19 + TypeScript dashboard built by Vite.
- Entirely browser-local. There is no hosted backend, telemetry, login flow, API-key flow, OAuth flow, cookie access, or account-changing action.
- Public Roblox and Roblox Wiki/Fandom APIs are called with `credentials: "omit"`.
- The product analyzes public inventory records; it does not bypass Roblox inventory privacy.
- Exact player-owned asset copies come only from distinct Roblox `userAssetId` values. Catalog sales, wiki purchases, favorites, distribution counts, and source-gift history never become the player's copy count.

## Extension entry points

### Toolbar popup

- Clicking the toolbar action opens a compact popup with a primary **Open Inventory Lens** action.
- When the active tab is a canonical numeric Roblox profile URL, the popup also offers **Scan current Roblox profile**.
- Either action opens or focuses the full dashboard; the profile action prefills that user ID/profile.
- A previously opened dashboard tab is reused and focused instead of opening duplicates.
- A prefilled open navigates the reused dashboard tab to `index.html?userId=...&profileUrl=...`; an unprefilled open leaves the existing dashboard URL unchanged.

### Roblox profile-page button

- A content script runs at `document_idle` only on `https://www.roblox.com/users/*/profile*` and the equivalent naked `roblox.com` host.
- It injects one **Scan Inventory** button on canonical positive-numeric profile paths.
- The button prefers known Roblox profile header/action containers and falls back to a fixed top-right button on `document.body`.
- Clicking it sends only a validated numeric user ID and canonical profile URL to the background worker, briefly changes the label to **Opening...**, then restores it after 900 ms.
- Injection is idempotent. The script patches `history.pushState` and `history.replaceState`, listens for `popstate`, `hashchange`, and `pageshow`, and observes DOM mutations so Roblox SPA navigation updates/removes/repositions the button safely.
- Navigating away from a numeric profile removes the button.
- If the extension was reloaded while a Roblox tab remained open, message-send failure is swallowed rather than breaking the page.

### Dashboard prefill

- Initial input is read from query parameters in this priority order: `userId`, `user`, `username`, `player`, `profileUrl`.
- The dashboard does not auto-scan a prefilled player; the user starts the scan.

## User input and player resolution

- Accepts a username, `@username`, all-digit user ID, or Roblox profile URL.
- Profile URLs must be on `roblox.com` or a Roblox subdomain and match `/users/<digits>/profile` (an optional trailing slash and ordinary query data are accepted by dashboard parsing).
- Usernames are 3–20 characters, must start/end alphanumeric, may contain alphanumerics and at most one underscore.
- Numeric IDs use `GET https://users.roblox.com/v1/users/<id>`.
- Usernames use `POST https://users.roblox.com/v1/usernames/users` with `excludeBannedUsers: false`.
- A completed 150x150 avatar headshot is loaded from the thumbnails API when available. Missing/moderated headshots do not fail a scan.
- Resolved display name, username, numeric ID, verified badge, and optional headshot are shown in the profile summary.

## Category navigation

All 54 leaf categories are selected initially. Each group is expanded, has an all/indeterminate checkbox, shows `selected/total`, and each leaf can show its loaded unique-item count.

The visible group order is intentionally:

1. Accessories
2. Hair
3. Heads
4. Bundles
5. Animations
6. Avatar Animations
7. Audio
8. Badges
9. Bottoms
10. Classic Clothing
11. Decals
12. Emotes
13. Makeup
14. Meshes
15. Models & Packages
16. Passes
17. Places
18. Plugins
19. Private Servers
20. Shoes
21. Tops
22. Video

Leaf categories and numeric public AssetType coverage:

| Group | Leaf | Category ID | Public adapter/type |
|---|---|---|---|
| Accessories | Head | `accessories.head` | Hat 8 |
| Accessories | Face | `accessories.face` | Face accessory 42, ear 57, eye 58 |
| Accessories | Neck | `accessories.neck` | Neck accessory 43 |
| Accessories | Shoulder | `accessories.shoulder` | Shoulder accessory 44 |
| Accessories | Front | `accessories.front` | Front accessory 45 |
| Accessories | Back | `accessories.back` | Back accessory 46 |
| Accessories | Waist | `accessories.waist` | Waist accessory 47 |
| Accessories | Gear | `accessories.gear` | Gear 19 |
| Hair | Hair | `hair` | Hair accessory 41 |
| Heads | Classic heads & faces | `heads.classic` | Classic head 17, face 18 |
| Heads | Dynamic heads | `heads.dynamic` | Dynamic head 79 |
| Heads | Body parts | `heads.bodyParts` | Torso 27, arms 28/29, legs 30/31 |
| Heads | Eyebrows | `heads.eyebrows` | Eyebrow accessory 76 |
| Heads | Eyelashes | `heads.eyelashes` | Eyelash accessory 77 |
| Bundles | Bundles | `bundles` | Separate public bundle adapter |
| Animations | Animations | `animations.generic` | Animation 24 |
| Avatar Animations | Climb, Death, Fall, Idle, Jump, Run, Swim, Walk, Pose, Mood | `avatarAnimations.*` | 48–56 and 78 |
| Audio | Audio | `audio` | Audio 3 |
| Badges | Badges | `badges` | Unsupported anonymously |
| Bottoms | Pants, Shorts, Dresses & skirts | `bottoms.*` | Layered accessories 66, 69, 72 |
| Classic Clothing | T-shirts, Shirts, Pants | `classicClothing.*` | 2, 11, 12 |
| Decals | Decals | `decals` | Decal 13 |
| Emotes | Emotes | `emotes` | Emote animation 61 |
| Makeup | Face, Lip, Eye makeup | `makeup.*` | Compatibility types 88, 89, 90 |
| Meshes | Meshes & mesh parts | `meshes` | Mesh 4, mesh part 40 |
| Models & Packages | Models, Packages | `modelsPackages.*` | Model 10, package 32 |
| Passes | Passes | `passes` | Unsupported anonymously |
| Places | Created places | `places.created` | Separate public Created-tab adapter |
| Places | Purchased places | `places.purchased` | Unsupported anonymously |
| Plugins | Plugins | `plugins` | Plugin 38 |
| Private Servers | Private servers | `privateServers` | Unsupported anonymously |
| Shoes | Left, Right shoes | `shoes.*` | 70, 71 |
| Tops | T-shirts, Shirts, Jackets, Sweaters | `tops.*` | 64, 65, 67, 68 |
| Video | Video | `video` | Video 62 |

Presets:

- **All**: all 54 leaves, including leaves that will be reported unsupported in public no-key mode.
- **Avatar only**: every leaf marked as an avatar category.
- **No classic clothing**: everything except the three classic-clothing leaves.
- **Clear**: selects nothing; a scan requires at least one category.

## Scan planning and lifecycle

- A broad request is divided into sequential stages, never fanned out concurrently:
  - primary inventory items;
  - bundles (optional);
  - makeup compatibility (optional);
  - badges (optional and currently unsupported);
  - private servers (optional and currently unsupported).
- Bundles, badges, private servers, and makeup are isolated so failure in one optional stage does not erase successful public results.
- A public inventory-visibility preflight runs before every segment.
- A clearly private inventory stops the request. An unclear visibility value produces a warning and adapters are attempted normally.
- Same-target scans are incremental: only selected categories not recorded as completed are requested, then results are merged into the current inventory.
- Changing the target input resets items, user, warnings, and completed-category state.
- Selecting only already-loaded categories reports **All selected categories are already loaded** without scanning.
- Completed and explicitly unsupported categories are considered handled. Partial categories remain unfinished and can be retried.
- Retry/load button labels distinguish **Scan inventory**, **Scan selected categories**, **Load N new categories**, and **Retry N unfinished categories**.
- Pause and resume operate at safe page/metadata-batch boundaries through in-memory waiters.
- Stop aborts active requests and retains already committed results.
- Progress shows phase, sequential stage number when applicable, pages, records, current message, Pause/Resume, and Stop. Results are committed when each segment completes rather than card-by-card during a segment.
- Checkpoint data tracks adapter, cursor, and current AssetType for progress/rate-limit context; it is not persisted across a browser restart.
- Retrying an unfinished category may re-enumerate it, but exact-copy deduplication and incremental merge prevent duplicate copies in the display.

## Public scan adapters

### Visibility

- `GET https://inventory.roblox.com/v1/users/<userId>/can-view-inventory`.
- Accepts either `canView` or legacy `canViewInventory` response fields.

### Exact asset copies

- One numeric AssetType at a time through `GET https://inventory.roblox.com/v2/users/<userId>/inventory/<assetTypeId>`.
- Uses `limit=100`, `sortOrder=Asc`, and cursor pagination.
- Stops on no next cursor, an empty page, or a repeated cursor.
- A repeated cursor preserves completed data, marks that type partial, and warns.
- Unsupported/invalid individual types returning 400/404 are isolated and warned about rather than terminating all types.
- Persistent 429/network interruption preserves completed pages/types and stops before hammering later types.
- Each record retains `userAssetId`, `assetId`, name, acquisition timestamp, and serial number when Roblox supplies them.

### Bundles

- `GET https://catalog.roblox.com/v1/users/<userId>/bundles`.
- Uses `limit=100`, `sortOrder=1`, and cursor pagination.
- Bundle ownership is represented once with synthetic instance ID `bundle:<id>`; it is not treated as per-copy enumeration.

### Created places

- `GET https://inventory.roblox.com/v1/users/<userId>/places/inventory`.
- Uses `itemsPerPage=100`, `placesTab=Created`, and cursor pagination.
- Each place is represented once with synthetic instance ID `place:<id>`.
- Purchased/My Games/Other Games place inventory is not attempted anonymously.

### Protected/unsupported leaves

- Badges, passes, purchased places, and private servers are reported as unavailable through Roblox's public no-login inventory APIs and skipped.
- No legacy privacy bypass or logged-in-cookie fallback exists.
- Badge/game-pass types remain in shared model/thumbnail/rarity code for compatibility, but the current anonymous scanner does not enumerate them.

## HTTP behavior and rate limiting

- The shared Roblox client always forces `credentials: "omit"`.
- It forwards only `Accept`, `Content-Type`, and `x-csrf-token`; caller-supplied authorization/cookie headers cannot ride along.
- Network failures become a friendly `network` scan error; unreadable JSON is also treated as network failure.
- Status mapping distinguishes authentication/permission denial, explicitly private inventory, not found, rate limited, network/server failure, and unknown failure.
- Roblox `Retry-After`, `x-ratelimit-reset-after`, and `x-ratelimit-reset` headers are honored. Combined numeric headers use the longest delay.
- Waits are conservative: at least one second, at most two minutes for Roblox headers; exponential fallback is capped at 30 seconds.
- A shared per-origin cooldown prevents simultaneous requests from immediately hitting the same exhausted quota.
- The scanner configures one 429 retry per public scan request, then preserves partial data and exposes retryable unfinished categories.
- Abort cancels page requests, metadata batches, cooldown waits, and pause waits.

## Normalization, grouping, and incremental merge

- Stable keys include item kind (`asset:`, `bundle:`, `badge:`, `gamePass:`, `privateServer:`) so numeric IDs from different domains cannot collide.
- Malformed public asset rows without both `assetId` and `userAssetId` are skipped.
- Replayed/overlapping asset rows collapse by exact `userAssetId`; a duplicate row that adds an acquisition timestamp replaces the poorer row.
- Grouping combines records with the same stable key and counts distinct exact instances.
- Copies sort by known acquisition date newest first, then unknown dates, then numeric-aware instance ID.
- Incremental merging unions exact copies, keeps richer names/metadata/thumbnails, reconciles sale-status conflicts, preserves the richer rarity/history/collector evidence, and recomputes gift links.
- Conflicting explicit on/off-sale evidence across merges becomes `unknown`; an `unknown` segment does not erase an already confirmed status by itself.

## Official metadata and thumbnails

### Catalog details

- Assets and bundles are enriched through anonymous `POST https://catalog.roblox.com/v1/catalog/items/details` in batches of at most 120.
- The one-time anonymous CSRF challenge is handled by reading `x-csrf-token` from the first 403 and retrying; repeated rejection is a network error.
- Preserved fields include name, asset/bundle type, creator, statuses/restrictions, collectible ID, total quantity, price/status, off-sale flag, informational sales, favorite count, created timestamp, and public description.
- Missing metadata does not remove an inventory record; fallback names are kind plus numeric ID.

### Thumbnails

- Thumbnails are fetched in batches of at most 100, grouped by item kind.
- Asset route uses 420x420 PNG with placeholders allowed; bundle route uses 420x420; badge/game-pass compatibility routes use 150x150.
- Only `Completed` thumbnails with URLs are displayed.
- Thumbnail batch failures warn and leave a visual placeholder; cancellation and exhausted rate limits still propagate.
- Card images use lazy loading.

## Sale-status behavior

- Sale status is `offSale`, `onSale`, or `unknown` and is derived only from official catalog fields.
- Recognized off-sale signals: `isOffSale: true` or normalized `priceStatus: Off Sale`.
- Recognized on-sale signals: `isOffSale: false`, normalized `On Sale`/`For Sale`/`Free`, or item status `Sale`.
- Conflicting on/off signals are `unknown`.
- If status fields are absent, a positive current official price is accepted as on-sale; zero price is not enough.
- Missing/unrecognized fields remain unknown.
- **Only off-sale** includes only explicitly confirmed off-sale items; unknown is excluded.
- Off-sale badges appear only for confirmed off-sale items.
- Selected-category off-sale summaries count unique grouped items and exact owned copies separately. They respond to sidebar category selection but intentionally ignore text/result toggles; pending selected categories are labeled **load pending**.

## Rarity and count semantics

The primary metric is a typed union with strict precedence:

1. A badge's nonnegative award count is **Badge awards** (compatibility behavior; badges are not currently enumerated anonymously).
2. Assets/bundles are limited when restrictions contain Limited, LimitedUnique, or Collectible, or when `totalQuantity` is positive.
3. A limited item with positive `totalQuantity` shows **Official supply**.
4. Otherwise, a positive ID-validated wiki purchase statement can show **Wiki purchases / Historical purchases**.
5. Everything else shows **Public count unavailable**, never zero.

Additional invariants:

- Roblox catalog `sales`/`purchaseCount`, including `Sales: 0`, is informational only and never becomes supply, owners, or a normal item's global count.
- `collectibleItemId` alone does not make zero quantity a known supply.
- Official limited supply stays primary even when wiki purchase history exists.
- Direct wiki history is retained separately for provenance/gift linking even when official supply wins.
- Badge awards, official supply, direct purchases, historical distribution, favorites, source-gift purchases, player copies, and current owners are never merged into one claimed fact.

## Roblox Wiki/Fandom enrichment

- Uses anonymous `GET https://roblox.fandom.com/api.php`, not rendered-page scraping.
- Requests MediaWiki revision wikitext for `Catalog:<item name>` with redirects, `origin=*`, and `maxlag=5`.
- Superscript digits also generate caret-title candidates (for example, Sinister² → Sinister^2).
- Batches contain at most 20 distinct titles and an encoded URL no longer than 6,000 characters.
- Batches are normally spaced by 200 ms.
- One Fandom 429/maxlag retry is allowed; optional rate-limit waiting is capped at 10 seconds. A failed batch stops later optional wiki batches while official Roblox results remain.
- A page is accepted for an inventory item only when its parsed `| id =` includes that exact Roblox item ID. If multiple matching pages exist, the page with richer typed evidence wins.
- Missing/mismatched pages are negatively cached for the current dashboard module session. Transport failures remain retryable.
- Parsed facts remain separate:
  - explicit `purchased N times` and nearest applicable **As of** date;
  - explicit `favorited N times` and date;
  - explicit obtained/awarded/redeemed/distributed/given-out count and typed label;
  - publication date;
  - acquisition evidence for in-person events, event/game prizes, select users, contests, promo/toy/gift-card codes, and giveaways.
- Price prose such as “could have been purchased for 150 Robux” does not match a purchase-count statement.
- An ID-matched history page can be retained without any purchase number so event/collector evidence is not lost.
- Wiki source links are displayed beside the fact they support; there is no generic Wiki Search button.

## Collector rating

- Collector profiles exist only for items Roblox explicitly confirms are off sale and for which catalog/wiki evidence exists.
- The score is deterministic, clamped to 0–100, and shown as an estimate rather than supply/owners.
- Only the strongest overlapping acquisition signal is counted:
  - in-person event exclusive: +40;
  - awarded to select users: +40;
  - contest prize: +32;
  - officially described gift reward: +24;
  - event/game prize: +22;
  - code/merchandise promotion: +16;
  - limited-time giveaway: +14.
- Age signal: 12+ years +20, 10+ +18, 7+ +13, 4+ +8.
- Confirmed off-sale adds +10.
- Favorites prefer current official Roblox catalog favorites; wiki favorites are fallback. Thresholds add +2 at 100, +5 at 500, +8 at 2,500, +11 at 10,000, +13 at 25,000, +15 at 100,000.
- Typed historical distribution adds +30 at ≤10, +28 at ≤100, +24 at ≤1,000, +20 at ≤3,000, +14 at ≤10,000, +6 at ≤50,000, 0 at ≤75,000, and −12 above 75,000 as broadly distributed.
- A collector pick requires explicit restricted-acquisition evidence or historical distribution ≤10,000; age/popularity/off-sale alone cannot qualify.
- Tiers: Exceptional ≥80, Rare ≥60, Notable ≥35, otherwise unrated.
- Confidence is high for acquisition evidence plus a distribution count, medium for acquisition evidence or publication+favorites, otherwise low.
- The card shows a collector badge, score, up to five evidence chips, negative evidence styling, a source link, and **Estimated collector rarity — not an owner count**.
- Source-gift purchase proxy counts do not enter the collector score; the gift relationship itself may be an acquisition signal.

## Gift/reward provenance

- Official catalog descriptions are conservatively parsed for explicit reward-side phrases such as “This item came out of/from… Gift…”, “contained in… Gift…”, or “given to owners of… Gift…”. Dates, including dotted month abbreviations, are stripped from the captured source name.
- A source item whose name contains “Gift” can provide a strict single-reward statement shaped exactly like `Inside you find... the <reward>!`.
- Generic gift prose, gift shops, unnamed gifts, generic surprises, and source descriptions naming multiple/random alternatives with punctuation/and/or are rejected rather than guessed.
- Canonical matching is case/diacritic/punctuation insensitive and treats a leading `Opened`/`The` as an alias, but display names are never rewritten.
- Relationships link only when the relevant owned name has one unambiguous match. Multiple normalized source or reward candidates leave the relation unresolved.
- Raw description evidence is preserved separately from derived links. Every grouping/merge pass clears and rebuilds derived origins/reverse links, so later incremental ambiguity removes a formerly inferred link.
- The reward card shows **Gift reward**, **Came from**, source name/link, and exact copies of the source gift owned by the scanned player when linked.
- The source gift card shows **Gift contents**, linked reward Roblox links, and the scanned player's exact owned copy count for each reward.
- When an owned source gift has positive direct ID-validated wiki purchase history, the reward may display a distinct **Source gift purchases** metric only when the reward's own primary rarity is unavailable.
- The source metric remains `sourceGiftHistoricalPurchases`; it is not the reward's direct wiki purchases, current copies, owners, or official supply, and it is excluded from direct-wiki sorting and Known Supply.
- UI caveat explicitly warns that random, multi-item, free, or separate releases may differ from the source-gift purchase basis.
- If source history is absent, the relationship can still display without inventing a count. If the source item is absent or ambiguous, the captured gift name can display without a link/count.
- After normal filtering/sorting, any visible source gift is kept immediately before all visible linked rewards. This adjacency is presentation only and does not change metric semantics.

## Dashboard result controls

- Search includes item names, linked source-gift names, and linked reward names.
- Sidebar selection filters already loaded results immediately; newly enabled unscanned leaves can be loaded and merged.
- Item type select: Limited & non-limited, Limited only, Non-limited only.
- Creator select: All creators or Roblox only. Roblox only requires Roblox's catalog creator identity (`creatorType: User`, `creatorTargetId: 1`); similarly named creators, groups, and records with missing identity metadata are excluded.
- Toggles:
  - Only duplicates (two or more exact owned copies);
  - Collector picks (rated tiers only);
  - Only off-sale (confirmed only);
  - Known official supply (positive official supply only).
- Sorts:
  - Rarest official supply (ascending; unknown last);
  - Collector rarity estimate (descending; unrated last);
  - Fewest direct item wiki purchases (ascending; source-gift proxy and non-wiki metrics last);
  - Most copies owned;
  - Fewest copies owned;
  - Newest acquired (unknown dates last);
  - Oldest acquired (unknown dates last);
  - Name A–Z.
- Sort ties are numeric-aware, case-insensitive name order before gift-family adjacency is applied.
- Result meta shows displayed/total items, selected-category confirmed off-sale unique items/copies, load-pending state, and context-sensitive semantic guidance.
- **Reset filters** clears text and all toggles, resets item type and creator to all, and reselects the All category preset. Sort mode is intentionally not reset by that button.

## Profile summary and cards

Profile summary statistics:

- total grouped unique items;
- total exact/synthetic owned copies represented;
- number of grouped items with duplicate exact copies;
- number with positive official supply;
- number of rated collector picks;
- confirmed off-sale unique items and owned copies for currently selected sidebar categories.

Each item card can show:

- lazy thumbnail or placeholder;
- exact owned-copy pill;
- Limited, Off sale, and Collector tier badges;
- asset subtype/category and creator;
- item name;
- gift origin/contents blocks;
- official, direct wiki, source-gift, badge, or unavailable metric with a nearby source link and semantic note;
- collector score/evidence/source;
- direct Roblox item link.

Cards with more than one exact copy have an expandable table showing instance ID, serial (or dash), and localized acquisition date/time (or **Not provided**).

Empty states distinguish:

- ready/no scan yet;
- completed scan with no items in selected categories;
- loaded items but no matches for current filters, with Reset filters.

The interface is dark, responsive at desktop/tablet/mobile breakpoints, and disables animation for `prefers-reduced-motion`.

## Errors, warnings, and partial results

User-facing error classes:

- invalid input or no categories selected;
- private inventory;
- permission denial for protected public requests;
- user not found;
- persistent rate limiting with unfinished-category retry guidance;
- cancelled/stopped scan with preserved-results guidance;
- network/unreadable API response;
- unknown server error.

Behavioral details:

- Error notices can be dismissed.
- Rate-limit errors expose **Retry unfinished**.
- Optional segment privacy/permission denial after another success becomes a warning, not a destructive whole-scan error.
- Warnings are deduplicated and displayed as a note list.
- Warnings cover unclear visibility, anonymous unsupported categories/types, partial/repeated-cursor enumeration, unavailable places/bundles, missing catalog details, unavailable Fandom history, and thumbnail failures.
- If a later sequential stage fails, earlier committed items/categories remain available.

## Background, messaging, and storage

- The background service worker validates `OPEN_DASHBOARD` messages, sender extension ID, source marker, positive-decimal user ID, allowed Roblox host, exact profile path, and matching ID.
- Valid message shape contains only `type`, `source`, `userId`, and `profileUrl`.
- Responses are `{ok:true}`, `{ok:false,error:"invalid-message"}`, or `{ok:false,error:"open-failed"}`.
- The background opens/focuses/reuses one dashboard tab and focuses its browser window.
- `chrome.storage.session` stores only numeric key `dashboardTabId` for dashboard-tab reuse.
- A stale/closed stored tab ID is removed; closing the remembered tab clears it.
- No scanned player, inventory, filter, key, token, cookie, or credential is written to extension storage.
- Dashboard scan state, completed categories, pause waiters, and inventory results exist only in React/page memory and disappear on dashboard reload/close.

## In-memory caches

- Catalog metadata cache: positive results by stable item key, bounded to 4,000 entries with a 60-minute expiration.
- Thumbnail cache: completed URL by stable item key, bounded to 8,000 entries with a 30-minute expiration.
- Fandom cache: positive metadata or a negative `null` for an ID-missing/mismatched page, bounded to 4,000 entries with a 60-minute expiration.
- Caches are module-memory only, non-sensitive, and are cleared by the visible **Clear local data** control and exported test helpers.
- Missing catalog/thumbnail results are not negatively cached.
- Fandom transport failures are not negatively cached and can retry later.

## Graphic Builder

- The dashboard header switches between the inventory report and Graphic Builder without reloading the tab or copying the scan into extension storage.
- The builder uses the selected player's current public full-body avatar render and up to 18 selected scanned items.
- The background selector offers exactly seven built-in choices: **Midnight Texture** (default), **Neon Grid**, **Royal Purple**, **Sunset Ember**, **Arctic Blue**, **Emerald Matrix**, and **Clean Black**. The selected background is used by both the live preview and downloaded PNG.
- All seven backgrounds are deterministic Canvas 2D drawing routines packaged with the extension. They do not use uploaded or remote background images, add a network host or browser permission, track selection, or transmit selection data.
- The user can edit the headline, subtitle, every item caption, and configurable bottom-bar content; search items; apply suggestions; remove items; and move them earlier or later.
- The user can hide both the display name and `@username` beneath the avatar. Hidden mode expands the avatar into the freed label space and uses a neutral PNG filename and canvas accessibility label; it does not rewrite custom headline or subtitle text.
- The bottom bar is composed from independently enabled blocks. If every block is disabled, the bar is omitted and the composition uses the reclaimed space.
- The custom block has separate bounded **Value** and **Label** fields. Both are user-editable; `CUSTOM TEXT` is only the default label.
- The off-sale block can show confirmed unique off-sale items or exact owned off-sale copies across all categories currently selected in the sidebar, confirmed off-sale items among the items placed in the graphic, or a bounded manual number. Selected-category totals intentionally do not shrink to the graphic's selected-item subset, and the controls warn when a selected category is still pending.
- Optional **Selected items** and **Owned copies** blocks count only the items placed in the current graphic and can be hidden independently.
- An optional display-only currency block supports `USD`, a bounded user-entered cryptocurrency name/ticker, or custom currency wording. It is rendered as canvas text only; the extension does not process a payment, connect a wallet, collect a wallet address or account number, quote an exchange rate, or perform a transaction.
- Automatic captions name official supply, historical purchases, source-gift purchases, historical awards, and player-owned copies as different metrics.
- Automatic white rounded borders and the selected built-in background are rendered directly on a local canvas.
- Landscape, square, and portrait outputs use fixed 1920×1080, 1080×1080, and 1080×1350 pixel canvases.
- PNG export uses the canvas and a temporary object URL; no developer backend or `downloads` permission is used.
- Roblox CDN URLs are revalidated and loaded anonymously before drawing. Failed images become placeholders rather than blocking the graphic.
- Draft state, including the selected background, remains only in current page memory, survives switching dashboard views, resets for a different scanned player, and disappears on reload/close.

## Manifest permissions and security boundary

- `manifest_version: 3`.
- Extension permissions: only `storage` and `activeTab`.
- Host permissions:
  - `https://users.roblox.com/*`;
  - `https://catalog.roblox.com/*`;
  - `https://inventory.roblox.com/*`;
  - `https://thumbnails.roblox.com/*`;
  - `https://roblox.fandom.com/*`.
- No cookies, webRequest, all-sites, scripting, identity/OAuth, downloads, or Open Cloud origin permission.
- Strict extension CSP: local scripts only, objects/base/frame ancestors disabled.
- All executable extension code is packaged locally; no remote scripts or source maps are shipped.
- Content-script messages never contain inventory data or credentials, and the content script never receives scan results.

## Build and release artifacts

- Package and manifest versions are aligned at 2.3.0.
- Scripts cover development, type checking, tests, production builds, security checks, secret scanning, and clean release packaging.
- Vite emits a clean `dist/` containing:
  - root `manifest.json`, `index.html`, `popup.html`, `background.js`, `content.js`;
  - hashed dashboard JS/CSS under `assets/`;
  - 16/32/48/128 PNG icons.
- Background/content filenames are stable because the manifest references them; dashboard assets are hashed.
- Clean release outputs are named `inventory-lens-unpacked/`, `inventory-lens.zip`, and `inventory-lens-source.zip`; the install archive keeps `manifest.json` at its root.
- Generated archives, browser profiles, local smoke-test data, build output, and dependencies are excluded from source control and source packages.

## Automated and smoke-test coverage

The release verification report records the exact test, typecheck, build, package-audit, archive-inspection, and unpacked-browser results for each release candidate.

Test suites preserve:

- `core.test.ts`: input parsing; category order/taxonomy/presets/type mapping; exact normalization/grouping; rarity and sale-status rules; collector scoring examples and exclusions; gift parsing/linking/ambiguity/incremental recomputation/proxy separation; sorting and merge behavior.
- `graphic-builder.test.ts` and `graphic-export.test.ts`: bounded selection, ordering, editable captions, draft validation, selectable built-in backgrounds, preview/export background parity, configurable bottom-bar blocks and metric sources, export presets, metric-typed defaults, suggestion priority, CDN URL validation, anonymous image mode, filename safety, and local PNG download.
- `api.test.ts`: credential stripping; rate-limit headers/cooldowns/errors; user lookup/headshots; per-type pagination, repeated cursors, pause/cancel, partial 429 behavior, visibility; makeup/bundle/place adapters; Fandom parsing, ID validation, batching, throttling, URL limits, caching; catalog CSRF/batch mapping; thumbnail routes; full Sinister² and Ghost Tie scan orchestration.
- `ui-filters.test.tsx`: selected off-sale totals and Graphic Builder total handoff; every filter/sort family, strict Roblox-creator matching, and unknown-last semantics; linked-name search; gift-family adjacency; collector/gift/wiki/off-sale card language; scan-stage planning/coverage/error copy; no-key public-access guidance.
- `content.test.ts`: strict profile URL parsing, idempotent SPA button, minimal message payload, and removal after navigation.
- `manifest.test.ts`: version alignment, minimal permissions/origins, profile-only injection, and strict CSP.
- Brave smoke verification covers unpacked load, service worker, group priority, profile injection, no-key UI, a real public inventory scan, off-sale totals, gift adjacency/provenance, collector filtering/sorting, and live Sinister²/Roblox Wiki checks.

## Known limits that must stay explicit

- Private inventories cannot be bypassed.
- Public APIs may omit records or reject individual asset types; omitted copies cannot be inferred.
- Badges, passes, purchased places, and private servers are present in navigation but unavailable in anonymous mode.
- Bundle/place synthetic identities are ownership presence, not exact multi-copy enumeration.
- Wiki history is community-maintained and may be missing, stale, or incorrect despite exact ID validation.
- Ordinary non-limited global owners/purchases are unavailable from Roblox; zero is not inferred.
- Collector ratings are heuristic discovery aids.
- Source-gift purchase history is historical context, not direct reward copies or owners, especially for random, multi-item, free, or separately released rewards.
- Unknown sale status never qualifies as off sale.
- Pause/progress/checkpoints and scan results are not persisted across dashboard restarts.

## Preservation risks

- Do not replace `userAssetId` copy counting with catalog sales, wiki counts, asset IDs, or array length before deduplication.
- Do not make unsupported authenticated categories silently appear empty or imply privacy bypass.
- Do not broaden credentials, manifest hosts, content-script matches, storage payloads, or message fields.
- Do not combine official supply, direct wiki purchases, source-gift purchases, badge awards, distribution, favorites, owners, and player copies in filters, sorts, labels, or collector scoring.
- Do not let unknown/conflicting sale metadata pass the off-sale filter or totals.
- Do not make the Graphic Builder's selected-category off-sale total depend on the smaller set of items placed in the graphic, and do not present a manual total as an automatically verified inventory result.
- Do not turn the Graphic Builder currency label into payment processing, wallet/account collection, pricing, or transaction functionality.
- Do not replace a built-in Graphic Builder background with a remote image, upload, external generator, tracking call, new host, or new permission; preview and PNG export must use the same selected deterministic Canvas 2D design.
- Do not remove ID validation, bounded Fandom batching, rate-limit guards, cursor-repeat guards, partial-result preservation, or incremental copy deduplication.
- Do not make gift name matching fuzzy or retain stale derived links after incremental ambiguity; always recompute from raw description evidence.
- Do not sort source-gift proxy counts as direct item wiki purchases or let family adjacency imply equal quantities.
- Do not lose the priority group order, presets, newly enabled category merge path, selected-category off-sale totals, duplicate detail table, or profile-button SPA idempotence.
- Keep package/manifest/docs/output versions aligned and keep `manifest.json` at the install ZIP root.
