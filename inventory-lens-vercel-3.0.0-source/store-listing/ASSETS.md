# Store Asset Plan

Public Roblox inventory analyzer

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

**Release:** Inventory Lens 3.0.0

This file inventories current visual assets and the work still needed for public store submission. Requirements can change; verify exact dimensions, file-size limits, formats, safe areas, and screenshot counts in each official portal immediately before submission.

## Existing packaged icons

| Repository path | Size | Current use |
| --- | --- | --- |
| `public/icons/icon-16.png` | 16 × 16 expected | Extension UI |
| `public/icons/icon-32.png` | 32 × 32 expected | Extension UI |
| `public/icons/icon-48.png` | 48 × 48 expected | Extension management UI |
| `public/icons/icon-128.png` | 128 × 128 expected | Extension management/store source |

The final release process must verify pixel dimensions, transparency, sharpness at each size, visual consistency, and correct paths in the built manifest.

## Icon provenance

The Inventory Lens mark was created for this project in `branding/inventory-lens-icon.svg`; `scripts/render_icons.py` produces the 16/32/48/128 PNGs. The mark is distributed with the project under the MIT License.

Do not use the Roblox logo, Roblox app icon, Roblox wordmark, or another party's artwork as Inventory Lens branding without documented permission. Product screenshots can show the extension's factual Roblox data use, but the composition must not imply Roblox Corporation endorsement.

## Missing store assets

- Final Chrome Web Store screenshots captured from the 3.0.0 production build
- Final Microsoft Edge Add-ons screenshots captured from the same build
- Any promotional tile or marquee image currently required by either portal
- Editable source for any promotional compositions
- Asset provenance record for screenshots, fonts, and any included item imagery
- Alt text and captions for each screenshot

Two release-validation screenshots are tracked in `docs/screenshots/` for the README: the final dashboard using an intentionally public Roblox staff profile and the standalone toolbar popup. They contain no login state, cookies, credentials, or browser chrome. They are documentation assets, not automatic store-submission approval; verify current portal dimensions, rights, captions, and privacy requirements before upload.

## Recommended screenshot set

Capture the final production build at a consistent browser zoom and window size. Use a public test profile that is appropriate to display in store marketing, and remove bookmarks, account identifiers, notifications, or unrelated browser chrome.

1. **Dashboard and category selection**
   - Caption: “Choose the public inventory categories you want to analyze.”
   - Show the category tree and presets without an error banner.

2. **Copy grouping**
   - Caption: “Count distinct public asset instances and inspect duplicate copies.”
   - Show an item with `×N owned` and expanded copy details only if those records are suitable for publication.

3. **Off-sale and collector filters**
   - Caption: “Filter public items by sale state and explained collector context.”
   - Ensure unknown sale state is not represented as off sale.

4. **Gift reward and source gift**
   - Caption: “Review a validated gift relationship and its separately labeled source-gift history.”
   - Show **Source gift purchases**, not owners or reward supply.

5. **Metric explanation**
   - Caption: “Keep official supply, historical purchases, and player copy counts separate.”
   - Prefer a layout where the metric labels and caveats remain legible at store-preview size.

6. **Roblox profile helper**
   - Caption: “Open Inventory Lens from a numeric Roblox profile.”
   - Show only the extension's button and enough page context to explain its use.

7. **Graphic Builder**
   - Caption: “Turn selected public inventory items into a custom bordered PNG.”
   - Show the live canvas, seven-choice background selector, editable text, selected items, configurable bottom-bar blocks, and Download PNG control without exposing unrelated browser state.
   - Make the selected background visibly match the preview; separately verify the exported PNG uses the same design.
   - Demonstrate that the custom value and label are separately editable; if currency wording is visible, make clear that it is display-only and do not show an address, account number, price, or transaction claim.

## Capture rules

- Use **Inventory Lens** consistently in visible UI.
- Include the subtitle **Public Roblox inventory analyzer** where a subtitle is appropriate.
- Include **Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.** in listing copy; it need not obscure every screenshot.
- Do not claim current global owner counts for non-limited items.
- Do not show API keys, cookies, browser developer tools, private inventories, or personal account information.
- Do not fabricate purchase figures, copy counts, dates, serials, or collector signals.
- Do not use a Fandom purchase figure without an exact catalog-ID match.
- Do not label a gift relationship without the public-description evidence used by the extension.
- Avoid visual comparisons that could be read as a market valuation or trading recommendation.
- Do not imply that a manual off-sale value was verified from the scan or that currency wording can process a payment.
- Do not imply that backgrounds are uploaded, remotely downloaded, generated by an external service, tracked, or transmitted; they are bundled deterministic Canvas 2D designs.
- Keep text contrast and zoom sufficient for accessible review.

## Asset manifest to complete

| Asset | Source file | Creator/rightsholder | License/permission | Portal use | Status |
| --- | --- | --- | --- | --- | --- |
| Inventory Lens icon | `branding/inventory-lens-icon.svg` | Inventory Lens contributors | MIT | Package and stores | Recorded |
| Screenshot 1 | `docs/screenshots/dashboard.png` | Inventory Lens contributors | Project UI capture with intentionally public Roblox data; review before store use | README; Chrome/Edge candidate | Captured, store review pending |
| Screenshot 2 | `docs/screenshots/popup.png` | Inventory Lens contributors | Project UI capture under MIT | README; Chrome/Edge candidate | Captured, store review pending |
| Screenshot 3 | `[SCREENSHOT_3_FILE]` | `[CREATOR]` | `[PERMISSION]` | Chrome/Edge | Not captured |
| Screenshot 4 | `[SCREENSHOT_4_FILE]` | `[CREATOR]` | `[PERMISSION]` | Chrome/Edge | Not captured |
| Promotional image | `[PROMO_SOURCE_FILE]` | `[CREATOR]` | `[PERMISSION]` | `[PORTAL_FIELD]` | Not created |

## Final review

Before upload, compare every visual against the final 3.0.0 build, manifest, description, privacy disclosures, and current portal requirements. Retire any visual that reflects an older product name, API-key setup, unsupported category, inaccurate metric, or internal test state.
