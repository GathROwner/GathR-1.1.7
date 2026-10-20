# Venue contact links: iOS Preview release

Published October 20, 2026 UTC. Retain functional commit **fb86603b7eeddd2073154f578b3a32f09b02c5a0** when assembling later frontend releases. It is based directly on accepted live iOS Preview **b2d02b54ffaf4da01511cdc6727e4181958e38e2**. The retained source branch is `codex/venue-links-ios-preview-20261019`; subsequent documentation commits are not additional OTAs.

## Exact release receipt

- Target: **ios / preview / runtime 1.1.10**, compatible established internal Preview 1.1.10 (78).
- OTA update: **01a156a0-95eb-7cb5-b8df-d93d9a37a996**; Profile short ID **01a156a0**.
- Group: **408a28d2-8ad8-4126-b616-7a0a6311b0de**.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/408a28d2-8ad8-4126-b616-7a0a6311b0de).
- Clear-cache export: **2,518 modules; 112 iOS assets**. Both social flags and established build-78 auth/account-continuity settings were retained.
- EAS update:view confirmed exact update, platform, runtime and functional commit. update:list confirmed newest iOS Preview placement.
- Expo's actual update endpoint returned HTTP 200 and this exact update ID for `expo-platform: ios`, `expo-channel-name: preview`, `expo-runtime-version: 1.1.10` at **2026-10-20T00:05:56.4001583Z**. This proves server delivery, not phone adoption.

## Two runtime files and behavior to preserve

1. `lib/api/firestoreEvents.ts`: name lookup requires a unique nonblank exact match, follows all venue pages, and returns no contact for ambiguous names or repeated cursors. The old substring matcher treated a missing title as an empty-string match and selected the first unrelated venue.
2. `components/map/EventCallout.tsx`: `VenueInfoContent` prefers the single venue ID available from its events, falls back to the safe shared name lookup, and is keyed by selected venue identity so fetched contact state and late responses cannot leak between venues. The contact effect includes `venue.events` in its dependencies.

The only active runtime caller of the shared venue-contact lookup is `VenueInfoContent`; the old `firestoreEvents - Copy.ts` is not imported by that caller. Brakish record `slug_brakishpei` has Facebook `https://www.facebook.com/BrakishPEI` and no website. The old lookup selected Buenos Island Studio and its `https://www.buenosisland.ca/` website instead.

## Bounded global lookup audit

One complete current API snapshot, captured **2026-10-19T23:51:29.1577568Z**, used **7 paginated requests / 566 records / 566 distinct IDs**. No per-venue live requests or external website crawl were used; the actual frontend resolvers were replayed against that same dataset.

- ID resolution: **566/566** returned their own stored contact fields; **0 failures**.
- Name fallback: **523/523 unique names** resolved correctly; **0 failures**.
- Ambiguities: **7/7** returned no fallback contact. They are The Alibi Bar & Grill, Rodd Charlottetown, PEI Brewing Company, Water's Edge, Blank Canvas Art Supplies, Charlottetown Christmas Festival, and Cornwall Public Library. These were recorded without merging or altering records.
- **36 unnamed records** remain resolvable by ID and have no usable name fallback.
- Old matcher replay chose a wrong record for **529/530 named venue records**; this is a replay result, not an assertion that every stored URL is externally wrong.
- Missing data: **227** without a website, **199** without Facebook, **88** without any website/Facebook/Instagram/phone action contact. No links were guessed or filled.
- Representative rendered-component sequence: Buenos Island Studio -> Pavillon de l'Est (missing contacts) -> Brakish -> Buenos Island Studio. All three switches kept button visibility and destinations tied to the selected venue.

TypeScript, all nine focused regression checks, five API capability tests, two relevant field-mapping tests, clean-worktree/ancestry, auth/social and Mapbox preflights passed. Lint exited zero with **0 errors / 215 existing warnings**. An unchanged preexisting cache-key assertion expects two key entries although the accepted live baseline already has four; the relevant mapping cases passed separately. No unrelated test/runtime workaround was included.

## QA limitation and rollback

The existing s24 / emulator-5554 debug client, native 1.1.10 (13), loaded a fresh **2,650-module Android Metro bundle from the final release source**, authenticated, fetched **855 events**, and displayed Mapbox tiles. QEMU crashed during capture with Windows exception **0xc0000005** before native Brakish taps and venue switching could be completed. Component button/switch and late-response tests passed. **iOS phone adoption remains unverified**; publication and server delivery are separate evidence. No emulator app data was cleared or APK replaced. The reusable debug checkout was restored to original commit 04dd898.

Rollback reference retained: prior iOS Preview group **6e239cf6-f155-483d-8c80-dddc7b8489c0**, update **01a1547b-c6bf-7863-87b4-5a9b2e631da5**, source **b2d02b54ffaf4da01511cdc6727e4181958e38e2**, runtime **1.1.10**. No rollback was executed.

Full receipt, audit and raw validation/readbacks remain in `C:\Users\craig\Documents\Codex\2026-10-19\task\venue-links-release-receipt.json`, `venue-links-global-audit.json`, and the neighboring logs. This release changed no backend/data records, Production or Android channel, native dependencies, or automatic-resolution architecture. Unrelated dirty frontend work was preserved.
