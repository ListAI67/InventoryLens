# Firefox Add-ons Description

Public Roblox inventory analyzer

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

**Planned public-release line:** Inventory Lens 3.0.0

## Compatibility status

**Blocked — do not submit the current Chromium package to Firefox Add-ons.**

Inventory Lens 3.0.0 is currently built as a Chromium Manifest V3 extension targeting Chrome, Edge, and Brave; its recorded browser smoke baseline is Brave. The separate Vercel web target does not establish Firefox extension compatibility. This workspace does not contain a Firefox-specific manifest, a declared Gecko extension ID, Firefox packaging, automated compatibility coverage, or a completed Firefox extension smoke test. Browser-session storage, background service-worker behavior, popup/profile integration, content security policy, canvas export, and all requested hosts must be verified in Firefox before this draft can become a listing claim.

The description below is conditional copy for a future compatible build. Replace `[FIREFOX_VERSION]` with that build's actual version; do not assume it will be 3.0.0.

## Proposed fields after compatibility work

| Field | Draft |
| --- | --- |
| Name | Inventory Lens |
| Summary | Analyze public Roblox inventories, count exact asset copies, and review catalog, gift, and collector context. |
| Version | `[FIREFOX_VERSION]` |
| Category | `[FIREFOX_CATEGORY]` |
| License | MIT |
| Homepage | `[HOMEPAGE_URL]` |
| Support URL | `[SUPPORT_URL]` |
| Privacy policy URL | `[PRIVACY_POLICY_URL]` |

## Conditional full description

Inventory Lens provides an in-browser dashboard for a selected player's public Roblox inventory.

Enter a Roblox username, numeric user ID, or profile URL. Choose public inventory categories, then search, filter, sort, and inspect the returned records.

Inventory Lens can count distinct public asset instances, group duplicate copies, show public catalog details, and explain separate official-supply, historical-purchase, gift-source, and collector-context measurements. It links a gift reward to its source only when the public description provides strict matching evidence.

Its Graphic Builder can arrange selected inventory items into a local PNG, switch among seven built-in backgrounds, and assemble the bottom bar from user-selected blocks. The background choices are Midnight Texture, Neon Grid, Royal Purple, Sunset Ember, Arctic Blue, Emerald Matrix, and Clean Black; the selection applies to preview and PNG. Each is a bundled deterministic Canvas 2D design, not an upload or remote background image, and the feature adds no host, permission, tracking, or selection-data transmission. Bottom-bar blocks can include an editable custom value and label, selected-category or manual off-sale totals, selected-item/owned-copy counts, and optional display-only USD/crypto/custom currency wording. The currency text does not process payments, connect a wallet, collect payment credentials, or perform transactions.

Inventory Lens does not require a Roblox API key, extension account, or Roblox login. It does not read Roblox cookies, change account settings, automate trades or purchases, or bypass a private inventory. It has no developer-operated backend, analytics, telemetry, or advertising.

The extension makes direct credential-free requests to Roblox for selected public profile, inventory, catalog, and thumbnail data. It sends item-title candidates derived from the scanned public inventory to Roblox Fandom when public catalog-page metadata is needed. A Fandom purchase number is not a verified current-owner count, and a source gift's purchase number is not the reward's supply.

Roblox generally does not publish current owner counts for ordinary non-limited items. Inventory Lens displays an unavailable state instead of reporting zero owners. Collector context is an explainable heuristic, not an appraisal or verified population count.

Private inventories cannot be scanned. Anonymous badge, pass, purchased-place, and private-server inventory categories are currently unsupported. External services may omit data, return stale metadata, or rate-limit requests.

Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation. Roblox is a trademark of Roblox Corporation. Fandom is a separate third-party service.

## Work required before Firefox submission

- Add and validate Firefox-specific manifest metadata and packaging.
- Verify every use of `chrome.*`, including `storage.session`, tabs, runtime messaging, and background behavior.
- Verify that the extension's Manifest V3 background model works under the targeted Firefox release.
- Test the popup, dashboard, profile helper, scan cancellation, cache clearing, and extension reload lifecycle.
- Confirm the content security policy and all host permissions pass automated review.
- Run the complete test suite and a manual public/private inventory smoke test in Firefox.
- State a tested minimum Firefox version.
- Reconcile screenshots and copy with the actual compatible build.
- Complete Firefox Add-ons data-collection and source-code submission fields using [privacy-disclosure.md](privacy-disclosure.md).

Until every item is complete, Chrome, Edge, and Brave are the only documented browser targets.
