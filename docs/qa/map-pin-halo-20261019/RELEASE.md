# iOS Preview pin outline release

- Published October 19, 2026 at 11:34:40 UTC, following Craig's mockup approval and explicit iOS Preview request.
- Source: 65ec56ad11e80ec8a0116a559f037fafc5168ac2, branch codex/feed-optimization-20261018, owned carousel-boundaries checkout.
- Previous iOS Preview source: 948c34900353d9022af41ae3c1a930928f059e00; verified ancestor. Only runtime file changed since live baseline: components/map/MapBrandWordmark.tsx.
- Target: ios / preview / runtime 1.1.10, existing Preview 1.1.10(78).
- OTA: 01a153f1-3a2f-7e69-b8a7-0d8511d17247; Profile short ID 01a153f1.
- Group: b02aecbd-93db-485c-bb70-62d802c77391.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/b02aecbd-93db-485c-bb70-62d802c77391).

The white exterior edge matches the approved isolated SVG comparison. Original blue and combined red contour geometry verified identical. Pin counter remains transparent; arcs, dimensions and fading backdrop unchanged. Actual native iOS appearance awaits Craig's phone check.

TypeScript passed. Lint exited zero with 0 errors / 215 existing warnings. Clean-worktree, ancestry, runtime, auth/account continuity, both social flags and Mapbox preflights passed. No additional behavior tests were needed for the path decoration alone.

Clear-cache export: 2,512 modules / 2,468 source-map sources, 5,745,680-byte Hermes bundle, SHA256 f224b84c0b41264f8f049e7f8c21e08036684c30c6316fef4006eaba78107bd3. Nineteen critical bundled sources matched checkout, including the logo/backdrop and accepted ad/feed/save code. No QA runtime sources. All 108 unique asset files were unchanged byte-for-byte; EAS reported 112 iOS assets and no new assets to upload.

Independent update:view confirmed exact source/platform/runtime/update; update:list confirmed newest iOS Preview group. Existing fingerprint 9ee0b973a2f53ed5647ccafe1599ef64f1580ffb advisory persists; it does not establish device adoption. No native build, Android/Production publish, backend write, emulator/device manipulation or GathR map operation occurred. Production remains held.

Close and reopen iOS Preview twice if needed. Profile should show Runtime 1.1.10 / OTA 01a153f1. Device adoption and native appearance remain pending; EAS publication alone does not prove either. Split portrait callout ad acceptance also remains pending from the preceding iteration.

Raw checks, renderer, source-map verification and EAS readbacks: ignored artifacts/map-pin-halo-20261019/.
