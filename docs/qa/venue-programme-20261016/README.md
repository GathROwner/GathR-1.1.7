# Single-venue programme frontend proof

Base: accepted published iOS Preview `2d40cb7c7f1b69d50074fe0343a233f1c32eb787`, runtime 1.1.10. Implementation: `975ee789c6fe0e53fa2cc0f0841d39b4b79edb91`; integration repair/native-tested source: `058c90902cf30ccef6294da9886f8e3b9d8d2eab`.

This is frontend support for an optional reviewed contract, **not a live Harvest Fest data change**. The coordinator/backend owner controls the consolidated data/release batch. No OTA has been published from this task.

## Shared native screenshots

Seven unedited 1080x2400 framebuffer captures from the existing emulator-5554 debug client, native/runtime 1.1.10. The standalone Metro fixture imports the actual white card, venue selector/tabs, standard lightbox, programme adapter and existing schedule browser. Its marker identifies source 058c909. The fixture normalizes the raw metadata:data API shape, including optional programmeData, before rendering. No map is mounted or operated; the map route is a null stub during QA only.

Synthetic cards use the two reviewed canonical music IDs and existing fallback imagery. Counts are **illustrative fixture counts**, not a promise that the final approved public programme will contain only two children. The fixture's three canonical venue records are the existing parent plus two existing children; membership adds no fourth event. Calendar and Directions remain present with the existing guest locks; neither action was exercised.

| Capture | Observed result |
| --- | --- |
| 01-child-backlink.png | Actual white Salty Sailors card with PART OF Harvest Fest directly below time; venue Events (3), scope venue/exact. |
| 02-parent-actions.png | Backlink opens standard Harvest Fest detail; normal 3–8 PM timing and venue/address remain; View programme joins Calendar and Directions in the existing footer. |
| 03-programme-schedule.png | Existing schedule sheet shows linked Salty Sailors 3–5 PM and Vintage 4.0 6–8 PM immediately, with source label and refresh control. |
| 04-canonical-child-open.png | Existing standard child lightbox and Event 1/2 paging, with no second programme or recursive parent overlay. |
| 05-return-to-programme.png | Child X returns to the same schedule and two usable rows. |
| 06-return-to-parent.png | Schedule X returns to the same parent with all three footer actions. |
| 07-origin-preserved.png | Parent X returns to original venue/tab/card; Events (3), root requests 0, generic hydration 0, child-card opens 0. |

The initial native run exposed a static module cycle and a seeded-query cache notification updating mounted cards during another component's render. The final source loads the shared browser synchronously on demand and defers only query-construction notifications while invalidating the index immediately. A focused regression covers actual seeded query construction during rendering. The final native log contains neither warning. Existing guest description contrast on the standard lightbox is outside this change.

## Restoration and boundaries

Owned Metro and app were stopped; existing emulator and app data retained. QA module and environment removed; device XML removed. Three app entry points were restored byte-for-byte and SHA256 verified:

- app/_layout.tsx: `8B104231C9CBAAFF80091CC481A194E5BAC332600C967024775F22CC79DA4DD7`
- app/index.tsx: `FFDA86346355942C39D49B980D558F1C87CCDA3642729D83039B52B8AFC95F35`
- app/(tabs)/map.tsx: `AE0CE18C8092CBA590E1B5427AF5EFF06E57D352DFA442E1E8A69D6460C0BCDB`

`fixture.tsx.txt` preserves the reproducible harness as documentation only; it is not imported into the production app. No backend checkout, Firestore/schema/model, account, native dependency/build, Android/Production release or live map was changed. Android shared-component evidence does not prove iOS adoption. Publication remains held.

Contract requirements and safeguards: [CONTRACT.md](CONTRACT.md).

## Final validation and export

The clean source/native-proof candidate `70d41d172f41fa21f129550be291136970446312` passed 188 tests across 15 suites, with one existing opt-in detail-merge benchmark skipped. TypeScript passes; full lint has 0 errors and the same 215 existing warnings. The first combined run timed out at the default 5-second Jest limit while TypeScript/lint ran concurrently; the focused browser suite passed independently and final full coverage passed with a 15-second per-test limit. No assertions were removed.

Normal iOS Preview social/auth/account-continuity and Mapbox preflight passed without Publish. Fresh list/view JSON confirmed the baseline remains `2d40cb7c7f1b69d50074fe0343a233f1c32eb787`, group `3b237578-33e4-49e6-9c85-191f1815391a`, update `01a14538-c839-782f-a845-87e89f643ed9`, runtime 1.1.10; candidate ancestry was explicitly checked.

The clean iOS export has 2,504 modules, 2,460 source-map sources, unchanged 111 asset metadata entries and a 5,730,028-byte Hermes bundle. SHA256: `2aea047e837babe6bf8603d4d90ef275d3e267e1139db9cbc87806172a3f0ae4`. This is 3,452 bytes more than the accepted baseline; no new imagery/assets were added.

`export-check.json` records all 13 required runtime sources matching disk, all three restored route hashes, and zero QA/docs/test imports. The two contract declaration files are type-only and erased from the runtime graph; TypeScript validates them. Existing API loaders are byte-identical after removing the two additive programme adapter lines. Protected timing/calendar/expiry, shared child-cache hook, area/hunt presentation, callout, accepted backlink UI/navigation, auth/social/native/dependency/release configuration remain unchanged. Query-generation suffixes intentionally isolate older normalized records while preserving storage/auth/preferences.

The final evidence commit changes documentation only; its runtime tree is identical to the exported source candidate. No OTA or backend/data change has been made. Coordinator independent review and the consolidated release/data decision remain outstanding; iPhone adoption is unverified.
