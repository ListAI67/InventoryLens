# Changelog

All notable changes to Inventory Lens are recorded here.

The format is based on Keep a Changelog. Release dates and comparison links are placeholders because this workspace contains no authoritative release tags or public repository URL.

## [Unreleased]

No changes recorded.

## [3.0.1] - 2026-07-19

### Fixed

- Fixed the hosted Vercel proxy failing during Function startup before it could contact Roblox.
- Replaced Vercel-incompatible TypeScript project references with one deployable root configuration.
- Made server-side ESM imports explicit and used Vercel's documented Web-standard default `fetch` entry point.

## [3.0.0] - 2026-07-19

### Added

- Added a dedicated Vite web target in `dist-web` and a Vercel single-page-app configuration.
- Added a stateless same-origin Function with exact Roblox/Fandom origin, route, method, query, header, body, redirect, timeout, and response-size boundaries.
- Added runtime transport selection so the hosted app uses `/api/proxy` while the extension keeps its direct anonymous requests.
- Added Vercel deployment, privacy, security, build-verification, and proxy regression coverage.

### Changed

- Roblox user resolution and the inventory-visibility check are reused across category stages in one run instead of being repeated for each stage.
- Hosted About/privacy wording now accurately distinguishes browser-memory analysis from transient Vercel request handling.

### Security and privacy

- The hosted proxy strips cookies, Authorization, API-key, forwarding, redirect, and unrelated response headers; it sends no Roblox credentials and stores no application-level scan state.
- The production web bundle excludes the extension manifest, popup, background worker, content script, Chrome storage code, source maps, and remote executable scripts.

## [2.3.0] - 2026-07-19

### Added

- Added seven local Graphic Builder backgrounds: **Midnight Texture** (the existing default), **Neon Grid**, **Royal Purple**, **Sunset Ember**, **Arctic Blue**, **Emerald Matrix**, and **Clean Black**.
- Added a background selector whose choice is applied consistently to the live preview and downloaded PNG.

### Security and privacy

- Backgrounds are deterministic Canvas 2D designs bundled with the extension. They do not upload content, download remote background images, add hosts or permissions, load remote code, introduce tracking, or transmit the user's selection.
- The selected background remains only in the Graphic Builder's in-memory draft and clears with the rest of that draft on dashboard reload or closure.

## [2.2.0] - 2026-07-19

### Added

- Added selectable Graphic Builder bottom-bar blocks instead of a fixed four-cell footer.
- Added separate editable **Value** and **Label** fields for the custom-text block, including the previously fixed `CUSTOM TEXT` label.
- Added off-sale blocks for confirmed unique items or exact owned copies across the categories currently selected in the inventory sidebar, plus graphic-only and manual-number choices.
- Added optional display-only currency text for USD, a user-entered cryptocurrency name/ticker, or custom wording.

### Changed

- **Selected items** and **Owned copies** bottom-bar cells can now be shown or hidden independently.
- Graphic Builder bottom-bar settings remain in the tab-local draft and are rendered directly into the local PNG. The currency block does not process payments, connect wallets, collect payment credentials, or perform transactions.

## [2.1.1] - 2026-07-19

### Added

- Added a saved **Show player name below avatar** Graphic Builder toggle. Turning it off removes both the display name and `@username` from the avatar panel and gives the avatar the reclaimed space.

## [2.1.0] - 2026-07-19

### Added

- Added a dashboard **Graphic Builder** that uses the scanned player's full-body avatar and up to 18 selected inventory items.
- Added editable headline, subtitle, footer, and per-item captions, plus item search, suggestion, ordering, and removal controls.
- Added automatic bordered landscape, square, and portrait compositions rendered at 1920×1080, 1080×1080, or 1080×1350.
- Added local PNG export without a backend or the browser `downloads` permission.

### Changed

- Automatic graphic captions keep official supply, historical purchases, source-gift purchases, historical awards, and player-owned copies explicitly distinct.
- Graphic drafts remain in page memory while switching between the inventory and builder views and reset when the scanned player changes.

## [2.0.0] - 2026-07-18

### Changed

- Redesigned the project for public release under the **Inventory Lens** name and **Public Roblox inventory analyzer** subtitle.
- Standardized the public disclaimer: **Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.**
- Added a compact toolbar popup that detects a canonical active Roblox profile before opening or focusing the reusable dashboard.
- Reworked release documentation around the current anonymous, browser-local architecture with no API key, login, telemetry, or developer backend.
- Added factual privacy, security, permission, contribution, licensing, and Chrome/Edge store-submission materials.
- Clarified exact copy counts, official supply, Fandom purchases, source-gift purchases, badge awards, and collector context as separate measurements.
- Clarified private-inventory, unsupported-category, third-party-data, unknown-sale-state, and in-memory-resume limitations.
- Added bounded module-memory caches: catalog and Fandom entries expire after 60 minutes, thumbnail entries after 30 minutes, with fixed entry limits and least-recently-used eviction.
- Added **Clear local data** to reset the dashboard and remove bounded module caches and known extension storage keys.

### Added

- Added an **All creators / Roblox only** result filter. Roblox-only matching uses the catalog's exact Roblox user identity (user target ID 1), so similarly named third-party creators, groups, and unknown creators are excluded.

### Security

- Documented credential omission, restricted request headers, packaged executable code, narrow hosts, bounded pagination/retries, and minimal profile-page messages.
- Restricted accepted thumbnail response URLs to HTTPS `rbxcdn.com` hosts and added idempotent cleanup of deprecated API-key-era storage keys.

### Release blockers

- Replace the contact, repository, support, privacy-policy URL, release-date, browser-minimum, store-account, and supported-version placeholders before submission.
- Review final store screenshot and promotional-asset requirements; the original MIT-licensed icon source is recorded in `branding/inventory-lens-icon.svg`.
- Confirm the external-contribution policy and include the MIT License in the release package.

## [1.4.3] - `[RELEASE_DATE_NOT_RECORDED]`

### Added

- Selected off-sale category totals in the navigation.

## [1.4.2] - `[RELEASE_DATE_NOT_RECORDED]`

### Changed

- Kept validated gift families adjacent in result ordering.

## [1.4.1] - `[RELEASE_DATE_NOT_RECORDED]`

### Changed

- Prioritized scan category order for faster access to common avatar inventory results.

## [1.4.0] - `[RELEASE_DATE_NOT_RECORDED]`

### Added

- Gift provenance based on strict reward-description evidence.
- Source-gift purchase context as a metric distinct from reward copies and current ownership.

## [1.3.0] - `[RELEASE_DATE_NOT_RECORDED]`

### Added

- Collector-context scoring and filters for publicly supported age, sale-state, event, promotion, gift, creator, and limited signals.

## [1.2.0] - `[RELEASE_DATE_NOT_RECORDED]`

### Changed

- Replaced the API-key workflow with anonymous public Roblox requests.
- Kept credentials and Roblox cookies out of inventory requests.

## [1.1.1] - `[RELEASE_DATE_NOT_RECORDED]`

### Added

- Off-sale-only filtering with unknown sale state kept separate.

## [1.1.0] - `[RELEASE_DATE_NOT_RECORDED]`

### Added

- Validated Roblox Fandom catalog lookups for historical purchase context.

## Earlier versions

Authoritative release notes for versions before 1.1.0 were not present in this workspace. They are intentionally not reconstructed from assumptions.

[Unreleased]: [REPOSITORY_URL]/compare/v3.0.0...HEAD
[3.0.0]: [REPOSITORY_URL]/compare/v2.3.0...v3.0.0
[2.3.0]: [REPOSITORY_URL]/compare/v2.2.0...v2.3.0
[2.2.0]: [REPOSITORY_URL]/compare/v2.1.1...v2.2.0
[2.1.1]: [REPOSITORY_URL]/compare/v2.1.0...v2.1.1
[2.1.0]: [REPOSITORY_URL]/releases/tag/v2.1.0
[2.0.0]: [REPOSITORY_URL]/releases/tag/v2.0.0
[1.4.3]: [REPOSITORY_URL]/releases/tag/v1.4.3
[1.4.2]: [REPOSITORY_URL]/releases/tag/v1.4.2
[1.4.1]: [REPOSITORY_URL]/releases/tag/v1.4.1
[1.4.0]: [REPOSITORY_URL]/releases/tag/v1.4.0
[1.3.0]: [REPOSITORY_URL]/releases/tag/v1.3.0
[1.2.0]: [REPOSITORY_URL]/releases/tag/v1.2.0
[1.1.1]: [REPOSITORY_URL]/releases/tag/v1.1.1
[1.1.0]: [REPOSITORY_URL]/releases/tag/v1.1.0
