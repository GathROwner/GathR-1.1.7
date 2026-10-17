# Trending looping patch — iOS Preview

Published October17,2026 to iOS Preview only, runtime1.1.10.

- Source commit: `12025d15da05f4d5832cd3ff5129c5fdbdd9b553`, branch `codex/carousel-boundaries-20261017`.
- Update group: `9fd7c64c-a8f0-4d44-b2fe-1aad06727d72`.
- iOS update: `01a14a41-5615-7df3-959a-b722370fd2c7` (Profile short ID `01a14a41`).
- [EAS dashboard](https://expo.dev/accounts/craigb/projects/gathr/updates/9fd7c64c-a8f0-4d44-b2fe-1aad06727d72).
- Retained live baseline: source `8e934a1130e817dca2d563e6f13479b42603783f`, OTA01a14a02 / groupb592824e-f83c-443e-ae28-be7eac0f1e73.

Craig's direct reply to the coordinator's exact missing-visual-check/iOSPreview publication question was **"Yep push it"**. This explicitly waived the unavailable post-fix emulator visual acceptance for this four-line correction and authorized this iOSPreview-only patch. The coordinator independently reviewed the actual source/tests and both Hermes source maps before dispatching publication. This waiver did not authorize any emulator reconnect workaround, Android/Production release, backend/data mutation or native build; none occurred.

The patch enables looping only for exact Trending manual/auto sources on their separate GlobalEventLightbox host. Category caller, finite2rail, separator, dots, event counter, destination labels, arrow alignment and gallery/swipe implementation remain byte-identical to the previous live export. Other global/callout callers retain bounded navigation. This fixes a pre-existing Trending inconsistency; it was not proven to be a newly introduced category regression.

23suites /269tests pass, with1existing optional benchmark skip. TypeScript passes; lint0errors /215existingwarnings; clean Git, ancestry, auth/account-continuity/social flags and Mapbox checks passed in the guarded publishing process. Fresh prepublication EAS list/view/channel matched the expected live baseline.

Actual publication export matches the reviewed clean export **byte-for-byte**:5,736,344bytes /SHA256 `5409d9e43b3479454e3e03e6d75579c98151bde6d2a04da81d303974dd758f70`.2505modules /2461source-map sources. Every runtime source matches the reviewed export, with eight route/component/utility hash checks. Compared with the previous live export, only the four-line map-host prop differs; bundle grows28bytes.111unchanged image/font assets; EAS reports112iOS assets including launch bundle and uploaded no new assets. No fixture/QA/test runtime source.

Independent local EAS view/list/channel readback confirms the exact update ID, group, source commit, iOS platform, runtime1.1.10 and newest Preview position; Preview channel maps to Preview branch and its newest iOS update matches. `published-export-check.json` and `published-readback-check.json` retain machine-readable evidence. Coordinator will independently inspect remote uploaded bundle/metadata.

The usual unchanged native fingerprint advisory was emitted for `9ee0b973a2f53ed5647ccafe1599ef64f1580ffb`; runtime1.1.10 remains the compatibility gate. This is not device-adoption evidence.

**iPhone adoption remains pending.** Verify Profile shows `OTA01a14a41`, then check Trending first/last navigation using arrows and swipes. No post-fix native emulator screenshot exists; prior crashes/rejected connection attempts and the permitted read-only System UI ANR capture remain documented in REJECTION.md. No additional emulator connection or manifest request was attempted during this release.

Normal root/index restored byte-for-byte; map contains only intended four-line candidate delta. Both temporary runtime fixtures/QA environment removed; Metro stopped; installed emulator app/data preserved. Protected9513and previous venue-programme checkouts untouched. Final documentation-only evidence commit follows the published source without changing runtime code.
