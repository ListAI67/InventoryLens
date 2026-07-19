# Installation and use

Inventory Lens includes a Manifest V3 extension and a separate Vercel web target. This page covers the extension; Chrome, Edge, and Brave use the same generated `dist` folder. See [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md) for the hosted build.

## Version notes

### 3.0.0 - Vercel-hosted web build

Inventory Lens can now be deployed as a Vite web application on Vercel. The hosted build keeps scan results and Graphic Builder work in browser memory and uses one stateless, same-origin Function for narrowly allowlisted public Roblox and Fandom API requests that ordinary web pages cannot make directly. The extension remains available and still contacts its declared public hosts directly.

The hosted target needs no Roblox login, API key, environment variable, database, or remote executable code. See [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md) for deployment and data-flow details.

### 2.3.0 - switchable Graphic Builder backgrounds

Graphic Builder now includes seven built-in backgrounds: **Midnight Texture** (the existing default), **Neon Grid**, **Royal Purple**, **Sunset Ember**, **Arctic Blue**, **Emerald Matrix**, and **Clean Black**. Choose a background in the builder and the live preview and downloaded PNG will use the same design.

Each background is generated locally from deterministic Canvas 2D drawing instructions bundled with Inventory Lens. Background selection does not upload the graphic, request a remote background image, contact a new host, add a permission, or enable tracking. The choice remains only in the current dashboard tab's in-memory draft and clears on reload or closure.

### 2.2.0 - configurable Graphic Builder bottom bar

Graphic Builder's bottom bar is now assembled from the blocks you enable. **Custom text** has separate editable **Value** and **Label** fields, so you can replace both the main wording and the `CUSTOM TEXT` caption. The **Off-sale total** block can show confirmed unique items or exact owned copies across the categories currently selected in the inventory sidebar, use the items placed in the graphic, or show a manual number. **Selected items** and **Owned copies** are optional.

Enable **Currency accepted** to display `USD`, a cryptocurrency name/ticker you enter, or other custom currency wording. This is display text in the local PNG only. Inventory Lens does not process payments, connect a crypto wallet, request a wallet address or account number, quote a price, or carry out a transaction.

### 2.1.1 - hide the avatar username

Graphic Builder now includes **Show player name below avatar**. Turn it off to remove both the display name and `@username` from the avatar panel; the avatar expands into the freed space. Custom headline and subtitle text remain unchanged so the builder never deletes wording you entered.

### 2.1.0 - Graphic Builder

After scanning a public inventory, open **Graphic Builder** in the dashboard header. Select up to 18 hats or other loaded items, edit the headline, subtitle, footer, and item captions, reorder the board, choose landscape/square/portrait, and download the finished high-resolution PNG. The player's current full-body avatar and automatic borders are included. The draft stays in the open dashboard tab and is not uploaded or saved across reloads.

### 2.0.0 - public release preparation

The extension is now branded as **Inventory Lens** with a compact dashboard and toolbar popup, bounded local metadata caches, a visible local-data reset, stricter URL and storage validation, public security documentation, and reproducible release packaging. Existing inventory scanning, copy counting, gift relationships, collector signals, category progress, filters, and sorting remain available.

### 1.4.3 - selected off-sale totals

The profile summary and results toolbar now show confirmed off-sale totals for the categories currently selected in the sidebar. Select only **Accessories → Head** for an off-sale hat total, or combine any categories. Both unique items and exact owned copies are shown; unknown sale status is not counted as off sale.

### 1.4.2 - adjacent gift families

When a source gift and one or more linked reward items are all visible under the current filters, the dashboard now keeps them together in the grid: the source gift appears first, followed immediately by its rewards. The source gift's historical purchase figure remains release context rather than a claim that every reward has the same number of copies or current owners.

### 1.4.1 - priority category order

The category sidebar now starts with **Accessories, Hair, Heads, Bundles, and Animations** so the most useful inventory sections are immediately visible. This changes only dashboard navigation order; category selection, scanning, and filters work as before.

### 1.4.0 - gift reward provenance

Version 1.4.0 connects gift rewards using official Roblox catalog descriptions. A reward such as **Ghost Tie** is labeled **Gift reward**, names **Opened Gift of the Ghastly Ghostie** as its source, and can show the source gift's ID-validated 9,534 historical wiki purchases as a release basis. The opened gift card also lists the linked reward and how many exact reward copies the scanned player owns.

Source-gift purchases are not presented as direct reward purchases, current copies, owners, or official supply. Random and multi-item gifts, free awards, and separate releases can make the source count differ from reward issues. If the source gift is absent, ambiguous, or has no validated history, the relationship can still be shown without inventing a zero or estimate.

### 1.3.0 - collector rarity signals

Version 1.3.0 adds an explainable **Collector rating** for old event rewards, in-person exclusives, giveaways, and similar off-sale items that cannot be judged by purchase totals. Use **Collector picks** to show only rated items or sort by **Collector rarity estimate**. The score uses evidence shown on each card, including acquisition history, age, current Roblox favorites when supplied by catalog metadata, and historical distribution figures from the matching wiki article.

The rating is a discovery aid, not an owner count or official supply. A historical award count is labeled separately, and missing Roblox sales remain unknown rather than zero.

### 1.2.0 - public no-key mode

Version 1.2.0 removes the credential setup flow. Public scans now use cookie-free Roblox endpoints and require no Roblox login, Open Cloud key, or OAuth authorization. Exact asset copies are counted from distinct `userAssetId` values returned by Roblox.

Badges, passes, purchased places, and private servers are intentionally unavailable because public enumeration is authenticated or permission-gated. Created places and bundles still use their public Roblox adapters. A private inventory remains private.

### 1.1.1 - off-sale filter

Version 1.1.1 added **Only off-sale**, based on official current Roblox catalog sale status. It includes only explicit not-for-sale status and excludes unknown status.

### 1.1.0 - Fandom permission change

Version 1.1.0 added the read-only `https://roblox.fandom.com/*` host permission. The extension uses it only for batched `GET https://roblox.fandom.com/api.php` MediaWiki requests. Chromium grants host access at origin level even though the code calls only `/api.php`.

When upgrading an unpacked installation, replace or rebuild files in the same loaded folder and choose **Reload** on the browser's extensions page. Do not load a second copy from a different directory.

## 1. Build the extension

From the project directory:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm build
```

The loadable extension is the generated `dist` folder. `manifest.json` must be directly inside it, not one directory deeper.

## 2. Load it in Chrome

1. Visit `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select the generated `dist` folder.
5. Pin **Inventory Lens** if you want one-click toolbar access.

## 3. Load it in Edge

1. Visit `edge://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select the generated `dist` folder.
5. Pin **Inventory Lens** if desired.

## 4. Load it in Brave

1. Visit `brave://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select the generated `dist` folder.
5. Pin **Inventory Lens** if desired.

## 5. First use

1. Open the toolbar popup and choose **Open Inventory Lens**, or visit a URL shaped like `https://www.roblox.com/users/123/profile` and click **Scan Inventory**.
2. Enter a username, user ID, or profile URL; choose categories; then start the scan. No Roblox sign-in or API key is required.
3. Duplicate totals come from distinct `userAssetId` records exposed by Roblox, not catalog sales or wiki purchase figures.
4. Use the result controls to search item or linked gift names, select categories, show duplicates, show only off-sale items or collector picks, and sort official, direct wiki, or collector metrics.
5. Open **Graphic Builder** to select items, choose one of the seven local backgrounds, and choose which bottom-bar blocks appear. Sidebar category selection controls the selected-category off-sale total; pending categories are not silently counted as loaded.

All API fetches use `credentials: "omit"`; the extension never requests Roblox cookies or login state. The `storage` permission is used only by the background opener to remember a numeric dashboard tab ID and reuse that tab. It does not store players, inventories, or credentials.

After Roblox metadata loads, the dashboard can request typed item history from Fandom's public MediaWiki API, including historical purchase/distribution figures and event context. Request parameters contain batched catalog article titles derived from items in the scanned public inventory. They do not include the scanned player identity, copy counts, full inventory payload, cookies, or credentials. Like any requested site, Fandom can observe ordinary network metadata such as the requester's IP address. No Fandom login or key is needed.

## Troubleshooting

- **Private inventory:** The extension respects Roblox privacy and does not use login cookies or bypasses. A private inventory cannot be scanned.
- **Category unavailable:** Badges, passes, purchased places, and private servers are intentionally unsupported in no-key mode. Roblox can also reject or rate limit an individual public asset type; the extension reports partial coverage and keeps completed categories.
- **Copy count looks incomplete:** Exact copies are counted from the distinct `userAssetId` records Roblox returns publicly. Privacy settings or omitted records cannot be inferred from catalog sales or wiki history.
- **Rate limited:** Leave the scan open. The scanner follows Roblox retry/reset windows, and completed categories remain available if a later type cannot finish.
- **Wiki purchase count unavailable:** The matching catalog article may be missing, use a different title, omit a purchase figure, or Fandom may be unavailable. Roblox inventory results remain valid.
- **Expected collector item is not rated:** Collector ratings require confirmed off-sale status plus enough ID-matched history evidence. A missing or incomplete wiki article can leave a genuinely notable item unrated; the extension does not guess from its name alone.
- **Gift reward has no source count:** The source gift may not be included in the selected/scanned categories, its description may not name a unique relationship, or its ID-validated wiki article may omit purchase history. The extension leaves the count unavailable instead of guessing.
- **Expected item missing from Only off-sale:** Roblox may not have returned current sale status for that item. Unknown status is deliberately excluded.
- **Profile button missing:** The button appears only on numeric Roblox profile URLs. Reload the Roblox tab after installing or reloading the extension.
- **Changes not visible after rebuilding:** Choose **Reload** on `chrome://extensions`, `edge://extensions`, or `brave://extensions`, then reload any open Roblox profile tabs.
