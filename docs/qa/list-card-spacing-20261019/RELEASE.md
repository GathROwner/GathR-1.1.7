# iOS Preview list spacing release

- Published October19,2026 at11:52:07UTC.
- Source d501108677b39b2308436b940921ff9bb36a70bf; branch codex/feed-optimization-20261018, owned carousel-boundaries checkout.
- Previous live iOS Preview source65ec56ad11e80ec8a0116a559f037fafc5168ac2 / OTA01a153f1 verified ancestor.
- Target ios / preview / runtime1.1.10, existing compatible Preview1.1.10(78).
- OTA01a15401-33f7-701b-a71a-b8c68d68b128; Profile short ID01a15401.
- Group28b44740-f94d-447b-9cb1-feb78f4f5605.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/28b44740-f94d-447b-9cb1-feb78f4f5605).

Event/special cards and grouped venue rows use the existing full list width. Ad media side inset is4pt instead of9pt; ad text/CTA remain inset9pt. Events' duplicate ad wrapper border removed. Shared callout ads inherit media framing with their original mount gate unchanged. Logo outline and all prior accepted feed/save/ad behavior retained.

TypeScript passed; lint0errors/215existing warnings. Five suites/45tests pass across initial run and the corrected callout width-expectation rerun, detailed in README. Independently reviewed rendered actual-component/style evidence demonstrates narrower margins, proportional portrait media, disclosure/CTA spacing and aligned grouped cards; eleven fixture measurements have no horizontal overflow. Native iOS appearance/playback and device adoption await Craig's phone check.

Clean worktree, ancestry, runtime, account/auth continuity, both social flags and Mapbox preflights passed. Clear-cache iOS export2512modules/2468source-map sources, 5745916-byte bundle, SHA256d140cb5ec7bffdfac0c05c81dcb2526c25f55e3fb663cf4c3a79d7e31238fb39. Nineteen unique critical bundled sources matched checkout, including both list screens, VenueEventRow, shared/wrapper/fallback ad cards, layout helper, saved-ranking code, logo/backdrop and social config. No QA runtime sources. All108unique asset files unchanged byte-for-byte; EAS112iOS assets, no new assets uploaded.

Independent update:view confirms exact source/platform/runtime/update; update:list confirms newest iOS Preview group. Fingerprint9ee0b973a2f53ed5647ccafe1599ef64f1580ffb remains unchanged; compatible-build advisory is separate from runtime compatibility/adoption.

No new native build/dependency/config/runtime change, Android/Production publication, backend write, device/emulator manipulation or GathR map operation. Production remains held.

Close/reopen Preview twice if needed; Profile should show Runtime1.1.10 / OTA01a15401. Check Events and Specials outer edges, ad media frame and portrait layout with real creatives; native appearance/adoption remain pending. Prior split portrait callout acceptance remains open.

Evidence and raw readbacks: ignored artifacts/list-card-spacing-20261019/.
