# Public Release Checklist

Public Roblox inventory analyzer

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

**Target:** Inventory Lens 3.0.0

No release is ready while a required placeholder or unchecked blocker remains.

## Ownership and policy

- [ ] Replace `[DEVELOPER_DISPLAY_NAME]`, `[SUPPORT_CONTACT]`, `[PRIVACY_CONTACT]`, `[SECURITY_CONTACT]`, and every other owner-contact placeholder.
- [ ] Replace `[REPOSITORY_URL]`, `[HOMEPAGE_URL]`, `[SUPPORT_URL]`, and `[PRIVACY_POLICY_URL]` with working project-owned URLs.
- [ ] Publish the privacy notice with a real effective date.
- [ ] Publish a supported-version and security-response policy.
- [ ] Confirm the intended audience, regions, pricing, support expectations, and applicable legal/store obligations.
- [ ] Include the MIT License and copyright notice in the repository and source distribution.
- [ ] Establish external-contribution terms before accepting contributions.

## Product identity

- [ ] Confirm the manifest, popup, dashboard, toolbar title, content-script button, HTML title, package metadata, README, install guide, ZIP name, and store copy all say **Inventory Lens**.
- [ ] Use the subtitle **Public Roblox inventory analyzer** where a subtitle is required.
- [ ] Include **Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.** in the README, dashboard/about surface, and each listing.
- [ ] Confirm the package and listings all use version `3.0.0`.
- [ ] Remove obsolete API-key setup and old product names from user-facing surfaces.

## Factual behavior

- [ ] Confirm exact copies are counted only from distinct public `userAssetId` values.
- [ ] Confirm bundle and created-place presence is not presented as enumerated multi-copy ownership.
- [ ] Keep copies owned, official supply, badge awards, Fandom purchases, source-gift purchases, and collector score separately typed and labeled.
- [ ] Confirm zero or missing non-limited sales is shown as unavailable, not zero owners.
- [ ] Confirm unknown sale state is not treated as off sale.
- [ ] Confirm gift provenance requires strict public-description evidence and exact source matching.
- [ ] Confirm Fandom requests contain inventory-derived item-title candidates, not player identity, copy counts, or the full inventory payload.
- [ ] Confirm private inventories stop without a privacy workaround.
- [ ] Confirm unsupported anonymous categories are not advertised as supported.
- [ ] Confirm Graphic Builder's selected-category off-sale cells use the full current sidebar selection, distinguish unique items from exact owned copies, warn about pending selected categories, and do not silently use only the items placed in the graphic.
- [ ] Confirm manual bottom-bar values remain identifiable as user-selected display content and are not presented as verified inventory facts.
- [ ] Confirm all seven named Graphic Builder backgrounds are locally bundled deterministic Canvas 2D designs and that the selected design matches between preview and PNG export.

## Privacy and security

- [ ] Confirm there is no API key, login, OAuth, cookie access, telemetry, advertising, or developer backend.
- [ ] Inspect network requests for `credentials: "omit"` and the restricted Roblox header allowlist.
- [ ] Confirm accepted thumbnail response URLs use HTTPS on `rbxcdn.com` or a subdomain.
- [ ] Test bounded cache sizes and 30-/60-minute expiration behavior.
- [ ] Test startup cleanup of invalid dashboard tab IDs and deprecated API-key-era key names.
- [ ] Test **Clear local data**: it stops a scan, resets the React report/controls, clears bounded module caches and known extension storage keys, then removes the current prefill query without clearing Roblox cookies, browser history, or Roblox site data.
- [ ] Confirm profile messages are validated and contain only type, source, numeric user ID, and profile URL.
- [ ] Confirm the profile content script never receives inventory results.
- [ ] Confirm packaged code satisfies the documented content security policy and loads no remote executable code.
- [ ] Confirm optional currency wording is local canvas text only and adds no payment provider, wallet, exchange, price-quote, account-data, or transaction request.
- [ ] Confirm background selection adds no upload, remote image or generator request, new host, browser permission, tracking, or data transmission and remains only in the in-memory draft.
- [ ] Reconcile `PRIVACY.md`, `SECURITY.md`, `PERMISSIONS.md`, [privacy-disclosure.md](privacy-disclosure.md), and [permission-justifications.md](permission-justifications.md) to the final binary.

## Automated verification

```powershell
corepack pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

- [ ] Record the real test result and date in the release record.
- [ ] Confirm the production build completes from a clean dependency install.
- [ ] Confirm no test relies on a live Roblox or Fandom response.
- [ ] Review dependency audit output and disposition findings.

## Browser verification

- [ ] Load the final `dist` directory unpacked in current Chrome.
- [ ] Load the same build unpacked in current Microsoft Edge.
- [ ] Load the same build unpacked in current Brave.
- [ ] State the tested browser versions and choose a supported minimum.
- [ ] Test toolbar/popup dashboard opening and reuse of one dashboard tab.
- [ ] Test profile prefill and button idempotence during Roblox single-page navigation.
- [ ] Test username, `@username`, numeric ID, and profile URL input.
- [ ] Test public, private, empty, and nonexistent users.
- [ ] Test category presets, incremental category loading, pause, resume, cancellation, and rate limiting.
- [ ] Test duplicate expansion, off-sale filter, collector filter, gift family display, source links, and unknown metrics.
- [ ] Test Graphic Builder text editing, all seven backgrounds, preview/export background parity, separate custom value/label fields, every bottom-bar source/toggle, all-blocks-hidden layout, selected-category pending state, 18-item limit, item search/order/removal, full-body avatar, every export aspect ratio, failed-image placeholders, and PNG download.
- [ ] Test dashboard reload, closure, browser restart, cache expiration, and local-data clearing.
- [ ] Do not claim Firefox support. Complete every blocker in [firefox-description.md](firefox-description.md) before a Firefox submission.

## Package inspection

- [ ] Package the contents of `dist`, with `manifest.json` at the ZIP root.
- [ ] Open the ZIP and confirm its manifest name, version, permissions, paths, and content security policy.
- [ ] Confirm the ZIP contains no API key, cookie, credential, `.env` file, source map, development server, test data, private screenshot, or remote executable code.
- [ ] Confirm the ZIP contains only the necessary production extension files and MIT license/notice where the chosen distribution format requires it.
- [ ] Compare the packaged hosts and API permissions with [permission-justifications.md](permission-justifications.md).
- [ ] Record the release archive checksum.

## Store assets

- [x] Record the MIT-licensed original icon source at `branding/inventory-lens-icon.svg` and retain its local raster renderer.
- [ ] Verify icon dimensions and legibility from the final files.
- [ ] Capture final screenshots using publication-safe public test data.
- [ ] Record creator, rights, source, caption, and alt text for each image.
- [ ] Verify current Chrome, Edge, and any future Firefox image requirements directly in their portals.
- [ ] Remove screenshots showing old names, API-key setup, errors, developer tools, personal accounts, or inaccurate metrics.

## Store submission

- [ ] Complete every field in [chrome-description.md](chrome-description.md) and compare it with current Chrome character limits.
- [ ] Complete every field in `MICROSOFT_EDGE_ADDONS.md` and compare it with current Edge character limits.
- [ ] Complete the portals' privacy questionnaires from [privacy-disclosure.md](privacy-disclosure.md), using their current definitions.
- [ ] Confirm no listing says data never leaves the device.
- [ ] Confirm no listing calls historical purchases current owners or calls collector context verified rarity/value.
- [ ] Confirm every listing calls currency wording display-only and makes no payment-processing or wallet-connectivity claim.
- [ ] Confirm every listing identifies backgrounds as bundled local Canvas 2D designs and makes no upload, remote-generation, tracking, or transmission claim.
- [ ] Confirm category, pricing, markets, language, support, privacy, and developer identity fields are accurate.
- [ ] Save the final submitted text and portal declarations with the release record.

## Final approval

- [ ] Update `CHANGELOG.md` with the real 3.0.0 release date.
- [ ] Replace or resolve every bracketed placeholder in public files.
- [ ] Obtain `[RELEASE_APPROVER]` approval.
- [ ] Tag and publish only the exact reviewed archive.
