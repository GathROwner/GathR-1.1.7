# iOS Preview date-only capability candidate

Not published. Direct descendant of fresh serving iOS Preview commit 3d2f4f729242b0a306a1917b053a6576a22deaed, group 1957e06c-b340-4601-b573-bc55e256cf20, update 01a14050-6df8-7a58-8190-591bfa23002c, runtime 1.1.10. Latest list and view were independently refreshed before and after preparation; no publication or device adoption is inferred.

Two runtime files change. Commit a1d268ea5d914696262444ce66972dfdba5bfcad adds exactly dateOnlyActivities=v1 to paginated event feed and single/batch detail URLs in lib/api/firestoreEvents.ts. Version-only and venue-metadata-only requests are unchanged; this frontend has no venue-with-events request path. The query is a compatibility declaration, not auth or source approval. This baseline already contains the reviewed date-only summary/badge/disclosure/calendar safeguard and No/Yes normalization.

Commit 8df8c2595b73a121c4255d8294f9b71dcd7b1c36 partitions lib/queryKeys.ts: feed ['events-minimal','original-source-v3','date-only-activities-v1']; detail schema original-source-v2-date-only-activities-v1. It neither reuses/migrates old query payloads nor clears auth/user storage. Real QueryClient dehydrate/hydrate tests prove upgrade and rollback separation; real store feed/detail tests prove new-generation reads and writes. AST audit checks all root/bootstrap/store cache selectors resolve to the central constants. Older bundles cannot read supported responses under their former keys.

No app/component/hook/service/asset/native/dependency/configuration file changes. Every accepted iOS UI remains present. Current owned iOS source checkout 9513 is untouched. This isolated candidate uses its own ordinary npm-ci dependencies and ignored local environment; no emulator/map interaction was performed in this iOS checkout.

## Validation

Five suites: 38 pass, one existing opt-in detail benchmark skip. TypeScript passes; lint exits zero with 0 errors / 213 existing warnings. Clean iOS Preview auth/account continuity, staging native shell, App Check compatibility override, both Social flags, Mapbox, runtime and ancestry preflights pass. Preflight publisher ran without Publish and explicitly reports no OTA.

Final iOS-only clean-cache local export: 2495 Metro modules, 2451 mapped sources, 5680484-byte Hermes bundle and 111 local asset metadata entries. export-proof.json checks 11 required files match the working source, normal root/index/map included, zero runtime fixture/test sources and no Android fixture marker. Counts are local export metadata, not EAS publication. Android native shared-component screenshots are in the sibling Android candidate; the iOS changes add no presentation code. No new iPhone rendering or adoption is claimed.

## Next gate

Coordinator independently reviews both candidates and their rendered evidence, then obtains the exact Preview OTA/backend/data approval. Backend suppression for clients omitting the exact capability must precede marked public-data publication. Newly marked activities are temporarily omitted for unsupported clients rather than rendered with invented clocks. Production compatibility and actual device adoption remain separate work. No OTA, backend deployment or live-data write occurred here.
