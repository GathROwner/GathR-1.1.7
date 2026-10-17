# Fading logo blur and palette E — iOS Preview

- Source `1416f83882fd4c111d590727f954885c8d518e0e`, branch `codex/carousel-boundaries-20261017`.
- Baseline `4484ccae1f1768a049f5dc3b7199f388b9e358b8`, accepted OTA `01a14ad9`.
- Target iOS / Preview / runtime `1.1.10`.
- Update `01a14b4f-9f31-7e59-9002-7564147d1252` (Profile `01a14b4f`).
- Group `14c93e61-7c95-4601-8316-cd89f9af0b42`.
- Published October17,2026 at19:21:11UTC.
- [EAS dashboard](https://expo.dev/accounts/craigb/projects/gathr/updates/14c93e61-7c95-4601-8316-cd89f9af0b42).

Three runtime files change: new MapLogoBackdrop, its idle-header mount in FloatingMapSearchHeader, and MapBrandWordmark lettering switched to selected E `#1B5C9F`. Red remains `#96232B`; accepted70x26size and geometry retained. A native55intensity light blur is masked by a radial alpha fade to zero at every outer edge. No plate, border, radius or shadow. Foreground wordmark remains sharp, decorative subtree ignores touches, query/search states unmount it. Reduce Transparency uses a feathered pale fill and preference listener cleanup.

TypeScript passes;3focused suites/7tests pass; lint0errors/215existing warnings. Guarded publisher passes clean ancestry, iOS auth continuity, both social flags and Mapbox. Clear-cache export2507modules/2463source-map sources. Nine bundled source checks match checkout, all111image/font asset bytes preserved, no QA runtime imports. EAS112iOS assets include launch bundle; no new image/font uploads.

Checked bundle5,744,416bytes, SHA256 `55fb1fc5f91e0594925d83b82627700102e8126d9857039f73bd06c7d7e5c470`. Independent EAS view/list/channel readbacks confirm exact update/group/source/platform/runtime, newest Preview position and active channel mapping. Authenticated manifest launch-asset hash matches checked export. No independent remote-byte download is claimed. Sanitized checks retained in `export-check.json` and `published-readback.json`.

Unchanged native fingerprint `9ee0b973a2f53ed5647ccafe1599ef64f1580ffb` emits the existing compatible-build advisory; all native modules were already installed, no dependency/config change. Independently reviewed isolated actual-path/mask render against conflicting labels and pale/blue backgrounds. Browser blur is an approximation of UIKit material. **Native compositing, final iPhone appearance and device adoption remain pending.** Existing status-bar implementation supplies the proven native approach; standing confidence-based iOS Preview release authority applies. Reopen twice if needed and confirm Profile OTA `01a14b4f`.

No map interaction, emulator reconnect, Production/Android release, native build, backend deployment or data mutation. Following commit contains release evidence only.

## Post-publication acceptance — October 17, 2026

Craig subsequently confirmed “That is perfectly it . Love it” and requested a committed/documented baseline. Treat palette E, the fading blur and current logo size as accepted. This user-reported native appearance feedback supersedes the earlier pending-appearance statement above. No assistant-operated iPhone inspection or independent Profile-ID capture is claimed. See [accepted baseline](../../ACCEPTED_BASELINE_20261017.md) for resume location, retained work and parked follow-ups. No new OTA was published for this documentation checkpoint.
