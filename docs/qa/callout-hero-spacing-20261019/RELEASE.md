# iOS Preview callout hero framing release

- Published October19,2026 at12:03:03UTC.
- Source c2bfb2b555f4a8f1c26f0ec1315370b107c79726 on codex/feed-optimization-20261018 in the owned carousel-boundaries checkout.
- Previous live iOS Preview source d501108677b39b2308436b940921ff9bb36a70bf / OTA01a15401 verified ancestor.
- Target ios / preview / runtime1.1.10, existing Preview1.1.10(78).
- Update01a1540b-36af-7135-b589-2ac4db01d2a9; Profile short ID01a1540b.
- Group39ed890a-9752-4ad7-8277-ce8f544f1477.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/39ed890a-9752-4ad7-8277-ce8f544f1477).

Only runtime change: six style values in EventCallout.tsx. Shared event/special card margin0/radius16, hero container padding0 and hero radius12/3pt solid-white border match accepted list framing. Hero height200pt retained. All non-style callout source verified identical; ads, lists and accepted logo unchanged.

TypeScript passes after isolating the previous task's ignored render fixture (README records initial failure). Lint0errors/215existing warnings. Three suites/11tests pass: interaction safety, modal dock touch layer and ad mount/identity/cancellation guards. Before/after actual-style rendering independently reviewed; all seven geometry cases have zero horizontal overflow,4pt photo inset matching list, with actual native iOS appearance/adoption pending. Corrected the saved comparison capture's browser wrapping in an evidence-only follow-up; no runtime changes required.

Clean worktree, live ancestry, runtime, account/auth continuity, both social flags and Mapbox preflights pass. Clear-cache export2512modules/2468source-map sources;5745928-byte Hermes bundle; SHA2560fa761765b3f2b9d670fd64011160c3f522bde68eda40c4507d45a35194ee91c. Nineteen unique critical bundled sources matched checkout, including callout, both list screens, shared ad layout/gates, saved ranking and logo/backdrop. No QA runtime sources.108unique assets unchanged byte-for-byte; EAS112iOS assets and no new uploads.

Independent update:view confirms source/runtime/platform/update; update:list confirms newest iOS Preview. Existing fingerprint9ee0b973a2f53ed5647ccafe1599ef64f1580ffb advisory persists separately from runtime compatibility/device adoption. No GathR map/device/emulator operations, native/dependency/config/runtime changes, backend mutations, Android/Production publication or additional build. Production stays held.

Close/reopen Preview twice if needed. Profile should show Runtime1.1.10 / OTA01a1540b. Craig should check thin photo borders and card width in Events and Specials callout tabs. Native appearance/adoption pending; previous split portrait callout acceptance remains open. Raw logs, renderer, source checks, export verification and EAS readbacks: ignored artifacts/callout-hero-spacing-20261019/.
