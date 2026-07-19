# Inventory Lens Store Listing Kit

Public Roblox inventory analyzer

> Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation.

This directory contains draft submission materials for the Inventory Lens 3.0.0 extension. It is a preparation kit, not evidence that the extension or separate hosted web build has been submitted, approved, or published.

## Files

- [chrome-description.md](chrome-description.md) — proposed Chrome Web Store fields and detailed description
- [firefox-description.md](firefox-description.md) — conditional Firefox listing copy and explicit compatibility blockers
- [MICROSOFT_EDGE_ADDONS.md](MICROSOFT_EDGE_ADDONS.md) — proposed Microsoft Edge Add-ons fields and description
- [privacy-disclosure.md](privacy-disclosure.md) — factual data-flow matrix for portal questionnaires
- [permission-justifications.md](permission-justifications.md) — store-facing rationale for each current permission and host
- [release-checklist.md](release-checklist.md) — public-release verification and submission checklist
- [ASSETS.md](ASSETS.md) — existing assets, missing assets, captions, and provenance checks

Brave can install compatible Chrome extensions and does not require a separate Inventory Lens listing draft here.

## Release identity

| Field | Draft value |
| --- | --- |
| Product name | Inventory Lens |
| Subtitle | Public Roblox inventory analyzer |
| Version | 3.0.0 |
| License | MIT |
| Disclaimer | Inventory Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Roblox Corporation. |
| Developer name | `[DEVELOPER_DISPLAY_NAME]` |
| Support contact | `[SUPPORT_CONTACT]` |
| Support URL | `[SUPPORT_URL]` |
| Homepage | `[HOMEPAGE_URL]` |
| Repository | `[REPOSITORY_URL]` |
| Hosted privacy policy | `[PRIVACY_POLICY_URL]` |
| Release date | `[RELEASE_DATE]` |
| Pricing | `[CONFIRM_STORE_PRICING]` |
| Primary language | English |

Do not submit placeholder values. No personal data or invented URL has been added to these drafts.

## Single purpose

Inventory Lens analyzes and presents a selected player's public Roblox inventory in the browser. It counts distinct public asset instances, organizes public catalog and collector-context metadata, and lets the user arrange selected results into a locally exported collection graphic with selectable local backgrounds and an optional configurable bottom bar.

The extension does not modify Roblox accounts, bypass private inventory settings, automate trades or purchases, or provide a current owner count for ordinary non-limited assets.

## Pre-submission checklist

- [ ] Reconcile the name, subtitle, version, description, and disclaimer across the manifest, dashboard, toolbar, package metadata, install guide, and ZIP.
- [ ] Replace every bracketed release placeholder in this directory and the root documentation.
- [ ] Choose the store category, distribution regions, pricing, and support policy.
- [ ] Publish the privacy notice at a stable public URL.
- [ ] Publish a monitored support contact and private security-reporting contact.
- [ ] Confirm the MIT License is included and publish the external-contribution terms.
- [ ] Verify ownership or permission for the icon, screenshots, typefaces, and every promotional image.
- [ ] Capture clean store screenshots from the final 3.0.0 extension build, including Graphic Builder, its background selector, avatar-identity toggle, and configurable bottom bar; do not use test data that should not be public.
- [ ] Verify current image dimensions, formats, character limits, and portal fields against the official store requirements at submission time.
- [ ] Complete the privacy questionnaire using the final build and [privacy-disclosure.md](privacy-disclosure.md).
- [ ] Build from the committed lockfile and run tests, type checking, and manual Chrome/Edge/Brave smoke tests.
- [ ] Inspect the ZIP for credentials, cookies, environment files, source maps, development files, remote code, or Fandom scraping outside the documented API flow.
- [ ] Confirm `manifest.json` is at the ZIP root and every requested permission is described in `PERMISSIONS.md`.
- [ ] Confirm the store version and release notes match `CHANGELOG.md`.

## Claims that must remain precise

- Say **copies owned by this player**, not global owners.
- Say **Fandom purchases** or **source gift purchases**, not verified owners or reward supply.
- Say **collector context** or **collector score**, not guaranteed rarity or monetary value.
- Say **public inventory**; never imply private-inventory access.
- Say badges, passes, purchased places, and private servers are currently unsupported by the anonymous scan path.
- Do not describe unknown sale state as off sale.
- Describe custom/manual bottom-bar values as user-entered display text, not verified inventory facts.
- Describe currency wording as display-only; do not imply payment, wallet, exchange, price-quote, or transaction functionality.
- Describe the seven backgrounds as bundled deterministic Canvas 2D designs; do not imply uploaded imagery, remote background downloads, generators, tracking, or data transmission.
- Do not imply endorsement by Roblox Corporation or Fandom.
