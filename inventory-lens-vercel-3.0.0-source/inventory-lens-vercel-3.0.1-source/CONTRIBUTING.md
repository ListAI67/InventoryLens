# Contributing to Inventory Lens

Public Roblox inventory analyzer

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

Inventory Lens is prepared as an open-source browser extension. Before accepting outside contributions, the project owner must publish `[REPOSITORY_URL]` and choose contribution governance. The source and documentation are licensed under the MIT License.

## Development setup

Requirements:

- A Node.js version satisfying Vite 7's `^20.19.0 || >=22.12.0` requirement
- `pnpm`
- A current Chromium-based browser for extension testing

Install from the committed lockfile:

```powershell
corepack pnpm install --frozen-lockfile
```

Common commands:

```powershell
pnpm dev
pnpm test
pnpm test:watch
pnpm typecheck
pnpm build
```

There is no configured lint or formatting script. Keep edits consistent with nearby TypeScript, React, CSS, and Markdown until the project adopts explicit tooling.

## Architecture invariants

Changes should preserve these boundaries unless the release explicitly redesigns and documents them:

- No developer-operated backend, telemetry, advertising, or account-changing functionality.
- No Roblox password, cookie, API key, OAuth token, or authenticated privacy workaround.
- Roblox and Fandom requests use `credentials: "omit"`.
- The profile content script receives no inventory payload and sends only minimal validated prefill data.
- Exact asset copy counts come from distinct Roblox `userAssetId` values.
- Bundle and created-place presence must not be presented as enumerated multi-copy ownership.
- Official supply, badge awards, historical purchases, source-gift purchases, copy counts, and collector scores remain separate typed metrics.
- Missing or zero public sales for a non-limited item is unknown, not zero owners.
- Unknown sale state is not treated as off sale.
- Gift provenance requires explicit public-description evidence and an exact source match.
- Collector context remains an explainable heuristic, not an appraisal or verified owner count.
- Remote executable code is not permitted.
- Any new host, permission, stored field, or data transmission requires matching privacy and store-document updates.
- Enrichment caches remain module-memory-only, entry-bounded, time-bounded, and clearable through the shared local-data control.
- Remote thumbnail URLs must remain restricted to HTTPS `rbxcdn.com` hosts.

See [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md) for the recorded behavioral baseline.

## Making a change

1. Keep the change focused on one behavior or documentation goal.
2. Add or update tests for user-visible and failure-path behavior.
3. Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.
4. Load the resulting `dist` directory unpacked and test it in a Chromium-based browser.
5. Update `README.md`, `CHANGELOG.md`, and other affected documentation.
6. If permissions or data flow changed, update `PRIVACY.md`, `SECURITY.md`, `PERMISSIONS.md`, and `store-listing/privacy-disclosure.md` in the same change.

When a public repository exists, submit changes through the workflow documented at `[REPOSITORY_URL]`. No branch naming, pull-request template, issue tracker, or approval policy is currently established.

## Testing expectations

Tests should cover successful results and adverse responses. Relevant cases include:

- Username, user ID, and profile-URL parsing
- Category-to-API mappings
- Empty pages, missing cursors, and repeated cursor guards
- Duplicate grouping and distinct instance counting
- Private and empty inventories
- Invalid users and missing metadata
- Cancellation, pause, in-memory resume, and incremental category loading
- `429` responses, retry headers, and bounded retries
- Catalog CSRF challenge handling without credentials
- Official-supply precedence and unknown-last sorting
- Gift reward/source matching and mismatch rejection
- Fandom exact-ID validation, negative caching, and retryable transport failures
- Cache expiration, least-recently-used eviction, storage migration, and local-data clearing
- Collector signals for old, off-sale, event, promotion, and gift-distributed items
- Content-script idempotence and message validation during Roblox navigation

Avoid live-network dependencies in unit tests. Use representative fixtures and keep external API assumptions isolated.

## Manual browser checks

After a production build:

- Open the toolbar popup, launch the dashboard, and scan a known public inventory.
- Open a numeric Roblox profile and use **Scan Inventory**.
- Confirm private inventories stop with a clear message.
- Test all category presets and enabling a category after a completed scan.
- Verify duplicate details, off-sale filtering, gift relationships, collector signals, and external links.
- Inspect requests to confirm cookies and credentials are omitted.
- Use **Clear local data** and confirm the report, controls, caches, extension storage keys, and current prefill query reset without clearing browser cookies or history.
- Close the dashboard and confirm its session tab identifier is removed.
- Reload and confirm scan state does not persist.
- Test the same build in current Chrome, Edge, and Brave releases.

## Documentation and claims

Use precise metric names. Do not describe Fandom purchases as current owners, source-gift purchases as reward copies, or a collector score as verified rarity. Do not claim support for badges, passes, purchased places, private servers, private inventories, Firefox, or Safari unless the implementation and tests establish it.

Use the public name **Inventory Lens**, subtitle **Public Roblox inventory analyzer**, and disclaimer **Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.**

## Commit and review records

No public commit-message convention or authorship policy is configured. Preserve authorship accurately and do not add generated personal contact details. Release entries must use real dates and links; use placeholders until those facts exist.

## Licensing

The project is distributed under the MIT License. Contributors must have the right to submit their work and should expect accepted contributions to be distributed under that license unless the project publishes a separate written contribution agreement.

Copyright (c) 2026 Inventory Lens contributors.
