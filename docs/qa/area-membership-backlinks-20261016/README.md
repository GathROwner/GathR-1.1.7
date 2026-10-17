# Membership backlink native proof

Functional source: `70d969f72c3835a27cb4c5aada72a1fb44a6c4e0`, based on accepted iOS Preview `896f6a53600ddac69f503c89d307e4d75bdf2f8c`.

These unedited 1080x2400 screenshots were captured from the existing `emulator-5554` debuggable GathR client, native/runtime 1.1.10, served by this worktree's own Metro and dependencies. The visible source marker proves the temporary fixture ran. This is shared React Native UI evidence, **not iOS device adoption**.

The synthetic in-memory fixture uses the actual exported `SpecialCard`, `VenueSelector`, `EventTabs`, membership links/provider, and standard parent `EventImageLightbox`. It substitutes only the app root/routes, fixture data and backend loaders. No map was mounted or interacted with. No account, installation, database, native build or app data reset was performed. Guest restrictions remain visible. The existing guest description contrast in parent details is outside this backlink change.

| Image | Observed result |
| --- | --- |
| 01-event-row.png | Pale-gold PART OF directly below the actual white card's time. One Today item remains; 12 future children loaded separately. |
| 02-parent-open.png | Tapping the gold row opens current Harbour Autumn Festival in one standard lightbox, rather than deliberately stale OLD STORE COPY. |
| 03-parent-return.png | X returns to same venue/Events (1), with root requests 0, generic hydration 0 and child opens 0. The nested link did not trigger child detail. |
| 04-hunt-specials-only.png | PARTICIPATING IN between actual selector and tabs; Events OFF, Specials (1), exact hunt title, dates and location-hours advice. |
| 05-hunt-parent-open.png | View hunt details opens current hunt in standard lightbox with its existing hours advice and three locations. |
| 06-hunt-return.png | Same specials-only venue and Specials (1) retained, all counters remain 0. |
| 07-long-event-title.png | Exact long parent title wraps across three lines without truncation or overlap. |
| 08-long-hunt-title.png | Exact long hunt title wraps across four lines; dates, advice, action and tab remain separate and readable. |

`fixture.tsx.txt` is the reproducible synthetic harness source, stored as documentation only and not imported by the production app.

## Restoration

After capture, the app and task-owned Metro were stopped; the emulator remains running. The fixture module and QA `.env.local` were removed. The three temporarily replaced routes were restored byte-for-byte, verified SHA256:

- `app/_layout.tsx`: `8B104231C9CBAAFF80091CC481A194E5BAC332600C967024775F22CC79DA4DD7`
- `app/index.tsx`: `FFDA86346355942C39D49B980D558F1C87CCDA3642729D83039B52B8AFC95F35`
- `app/(tabs)/map.tsx`: `AE0CE18C8092CBA590E1B5427AF5EFF06E57D352DFA442E1E8A69D6460C0BCDB`

The original 9513 checkout remains unchanged. No OTA has been published by this task.

## Final validation and release candidate

The clean source-and-QA candidate `62d09f584becf3d7ca0b56b1974396c281f3f322` passed all 139 focused tests in 12 suites, TypeScript, whitespace checking and full lint (0 errors, 215 existing warnings). The normal iOS Preview social/auth/account-continuity and Mapbox preflight passed without `-Publish`.

Fresh EAS list and view captures separated stdout JSON from CLI warnings and parsed successfully. Latest iOS Preview remains group `a2233c4b-d417-40d6-ba6c-31871f66ed44`, update `01a144ee-6772-7448-bfa8-49054339dae9`, commit `896f6a53600ddac69f503c89d307e4d75bdf2f8c`, runtime `1.1.10`. Candidate ancestry was explicitly asserted.

The clean production-mode iOS export contains 2,502 modules, 111 unchanged asset metadata entries and a 5,726,576-byte Hermes bundle. SHA256: `f2cc5596fb537f742be836e07cca13b83f3af3e00689bf71786937076ceaf850`.

`export-check.json` records exact source-map matches for all seven runtime files and all three normal entry points. No QA fixture, docs or tests enter the graph. Existing API loaders are unchanged; the membership parent loader is appended. Protected timing, calendar, expiry, area-browser/cache, store, dependency, native and release configuration files remain unchanged. The final evidence commit only adds this report and the source/export manifest, so runtime source is identical to the exported candidate.

Publication is intentionally held for independent coordinator review and a separate exact iOS Preview dispatch. Android shared-component screenshots do not establish iOS device adoption.
