# Accepted GathR frontend baseline — October 17, 2026

Craig confirmed the final fading blur treatment: “That is perfectly it . Love it”, then requested: “Okay we’re at a good baseline here. Commit / remember everything document etc”. This checkpoint records acceptance and continuity; it does not publish another update.

## Resume here

- Owned checkout: `C:\Users\craig\.codex\worktrees\carousel-boundaries\GathR-upgrade-sdk54`.
- Branch: `codex/carousel-boundaries-20261017`.
- Runtime source commit: `1416f83882fd4c111d590727f954885c8d518e0e`.
- Release evidence commit before this documentation checkpoint: `363bfdb`.
- iOS Preview update: `01a14b4f-9f31-7e59-9002-7564147d1252`; Profile short ID `01a14b4f`.
- Update group: `14c93e61-7c95-4601-8316-cd89f9af0b42`; runtime `1.1.10`.
- Published October 17, 2026 at 19:21:11 UTC. See [release evidence](qa/map-logo-fading-blur-20261017/RELEASE.md).

These release identifiers are the recorded, user-accepted baseline, not a new live EAS query during this documentation turn. Before future code or publication, re-read live iOS Preview and reconcile any later accepted work. Do not resume from the older protected `9513` checkout or drop accepted sibling changes.

## Accepted map logo

- All GathR letters, including R: blue `#1B5C9F` (palette E).
- Location marker and both radio arcs: red `#96232B`.
- Visible wordmark: 70 × 26 points, matching list-header visible logo size.
- Marker is a complete diagonal teardrop defining the R's inner opening. No pale gap around it; its small circular centre remains transparent.
- Fading localized background blur behind the sharp wordmark; no frosted pill or button silhouette, outline, shadow, or blue backplate.
- Existing logo position/search/settings behavior retained. Backdrop ignores touches, disappears during active search/submitted query, and honors Reduce Transparency.

Runtime files: `components/map/MapBrandWordmark.tsx`, `components/map/MapLogoBackdrop.tsx`, `components/map/FloatingMapSearchHeader.tsx`.

Craig's post-publication feedback is user-reported native visual acceptance. It supersedes the pre-feedback “pending” wording in the original release evidence. No assistant-operated iPhone inspection or independent Profile-ID capture is claimed.

## Earlier accepted work retained

- Compact lightbox layout, shortened venue addresses, full-height event callouts.
- Multi-venue callout paging through populated Events/Specials and onward between venues; Venue Info remains tap-only. Gesture ownership and drag/settle improvements retained.
- Interest-carousel and corresponding lightbox looping, with later caller-specific boundary fixes for Trending and area overviews retained.
- Venue-grouped chronological list rows, counters/dots, tappable hero arrows, swipe-versus-tap guard, and removal of redundant bottom navigation strip.
- Gold event-count text with limited shimmer; compact returning filter summary; Upcoming date options and centered selected date/range preview on Events/Specials and map filter panels.
- Lossless bundled-image compression, direct icon/date imports, narrowed navigation subscription, repaired observer tests and indexed event-detail matching.
- iOS push-token recursion/single-flight/deduplication repair, with previous device-adoption and quiet-log evidence retained. Historical quiet windows are not proof of current traffic.
- Lightbox callout counter and smoother horizontal paging across hero/title/description, protected vertical description scrolling, and downward dismissal from hero/title/venue header.
- Accepted intervening area/festival/hunt, programme/cache and membership work already present in this branch must also remain. This checkpoint does not roll any of it back.

Individual implementation and validation records remain under `docs/qa/`; this list summarizes continuity, not fresh testing of every feature.

## Parked work and status checks

- Accepted iOS feed baseline: Craig confirmed OTA01a150eb adoption but flashing persisted; clipping-off did not resolve it. Restored clipping and implemented deferred saved-first movement in source a5caa593d4a8d5a4311b7c8fc11081caf392a60f, iOS Preview OTA01a150fc, retaining all previous optimizations. Craig then confirmed “that fixed it with the exact intended sequence”: saving keeps the card in place, going to Map and returning promotes it, while back-to-top and tapping the selected tab icon only scroll and do not promote it. Preserve this accepted distinction. Craig additionally confirmed Specials and pull-to-refresh work; the requested phone acceptance checks are complete. Filter-change behavior also has automated coverage. See [current release and acceptance evidence](qa/feed-save-ranking-20261018/RELEASE.md).
- Frontend optimization follow-up is implemented: per-card like/interest subscriptions and reuse of filtered venue grouping during pagination, originally source d540ae98a223ad67053f8f5f8254fd6675416172/OTA01a15005. Both are retained in the accepted OTA01a150fc above. Craig did not notice an obvious speed benefit; local processing measurements are not demonstrated phone-wide speed gains. The intervening clipping test failed, and deferred saved-first movement is now implemented and user-accepted, not future work. The optimization's causal contribution to the earlier jitter was never established. See [original optimization evidence](qa/feed-optimization-20261018/RELEASE.md) and [current accepted behavior](qa/feed-save-ranking-20261018/RELEASE.md); do not repeat this work or silently omit it from later additive work. Original accepted checkpoint above remains separately identified.
- Advertisement presentation: reconcile existing ad changes before deciding what remains of media whitespace/dark styling. Ads are fragile; preserve native lifecycle and instance ownership. Do not assume the original request is wholly untouched or fully completed.
- Original Jennifer's Body hero selection, missing City Cinema fallback, stale recurrence and venue-versus-city classification: current backend/data status has not been re-audited here. Coordinate status before opening duplicate work or making repairs. The original pause during the large parse does not authorize backend work now.
- Review any older follow-up against newer commits before calling it open; some earlier notes predate subsequent membership/programme fixes.
- Parser Stage 4 cache/layout and compact-response proposals remain separately held; no restart is authorized by this checkpoint.

Nothing in this checkpoint starts new implementation or monitoring.

## Boundaries and validation

- Do not manipulate/test the GathR map directly, on emulator, or through delegation. User testing remains separate from isolated component/static visual evidence.
- Preserve protected/unrelated worktrees and concurrent changes. No messaging other chats without direct authorization; no new task/delegation requested here.
- No Production/Android release, native build, backend deployment or Firestore mutation is part of this checkpoint.
- Previous final release checks: TypeScript passed; 3 focused suites / 7 tests passed; lint zero errors / 215 existing warnings; guarded auth/social/Mapbox and clean ancestry checks passed.
- Clear-cache iOS export: 2,507 modules / 2,463 source-map sources; 111 image/font assets unchanged; nine bundled source checks matched; no QA runtime imports.
- Launch bundle: 5,744,416 bytes; SHA256 `55fb1fc5f91e0594925d83b82627700102e8126d9857039f73bd06c7d7e5c470`. Recorded authenticated EAS manifest hash matched the export. This documentation turn does not rerun those tests or publish.
- Root AGENTS.md contains historical SDK 52 guidance; actual app is SDK 54. Verify current package/config rather than treating historical version statements as current.

Use this document plus the branch's newest accepted release as the starting point for the next additive request.

## Current Preview iteration - adaptive feed ads

October 18: Craig selected portrait B and landscape H2 and requested iOS Preview. The additive implementation preserves the accepted feed/save behavior above; Production remains on hold. See [adaptive ad QA](qa/ad-layout-20261018/README.md) and its release record for the latest source and OTA identifiers. Native SDK playback and phone adoption require the Preview device check; the reviewed React Native Web fixture screenshot proves component layout only.

Latest iOS Preview publication for that iteration: source e751ef5ee4590efafc67d069567b7b3239e2aa13, OTA01a151c6 (group 10d4cedd-4365-45e6-9ffc-1d6673e648ac), runtime 1.1.10, confirmed newest by EAS readback. [Release evidence](qa/ad-layout-20261018/RELEASE.md). Phone acceptance pending; selected layouts are not yet a user-confirmed device baseline. Continue additively from this source while retaining all earlier accepted work.

October 19 additive ad refinement: Craig's six iPhone screenshots confirm the adaptive layouts are visible, with uneven right/bottom spacing still needing correction. He agreed to retain B/H2, fix spacing and investigate wide-frame portrait-looking videos. Current follow-up moves decoration off the iOS Fabric SDK view onto a regular outer card; keeps ratio/unknown fallback behavior after inspecting the available SDK metadata API. [Diagnosis and rendered visual evidence](qa/ad-spacing-20261019/README.md). Native fix acceptance pending; Production remains held.

Current iOS Preview for the spacing follow-up: source ae590bbc7a8a290dd2bd921e86089025a8c2fe9f, OTA01a153b7, group b11a2670-8ff0-4d09-b507-4232f5123783, runtime 1.1.10. EAS confirms newest; phone acceptance pending. [Release evidence](qa/ad-spacing-20261019/RELEASE.md). Continue additively from this source; do not revert to the earlier padding-on-NativeAdView implementation.

October 19: Craig confirmed the refined horizontal feed layout and supplied a portrait Tower video showing B works with the corrected margins. His next additive tweak moves Sponsored to the top of the right-hand column and lets split portrait media occupy the freed row at its original proportions. [Portrait disclosure QA](qa/ad-disclosure-20261019/README.md). Callout ad parity remains open; do not imply those components received the feed changes. Production remains held.

Latest additive iOS Preview: source 91c044bf889f46bfef23b24e98e303dc8704cd84, OTA01a153c9, group 0f404830-1ec8-4451-9faa-351a62945d0e, runtime 1.1.10. Newest confirmed by EAS; this final portrait disclosure tweak awaits phone acceptance. [Release evidence](qa/ad-disclosure-20261019/RELEASE.md). Preserve inset-free SDK root and all earlier accepted feed behavior. Callout parity remains outstanding.

October 19: Craig accepted the final feed formatting (including Sponsored beside portrait video) and requested callout parity. Normal SDK callout ads now delegate to the exact accepted shared card after their existing iOS mount safeguard; this supersedes earlier notes that normal callout parity is open. Existing non-SDK emergency fallback remains intentionally suppressed and unchanged. [Callout ad parity QA](qa/callout-ad-parity-20261019/README.md). Rendered component layout and mount tests pass; phone callout acceptance pending. Production remains held.

Latest iOS Preview callout parity release: source 948c34900353d9022af41ae3c1a930928f059e00, OTA01a153df, group 68771a44-bd1c-4474-b1eb-77005ff31fd4, runtime 1.1.10. EAS confirms newest; native phone callout acceptance pending. [Release evidence](qa/callout-ad-parity-20261019/RELEASE.md). Normal SDK callout parity is implemented, superseding earlier open notes. The accepted list card is shared unchanged, while callout native attachment remains deferred and the emergency non-SDK path remains separate. Production stays held.

Craig's October 19 follow-up accepts the observed non-split callout layouts: "those are looking good" and "the rest laid and fit nicely". Keep them in the working baseline above. He has not yet seen a split portrait callout ad, so that native layout check remains open. This is user-reported layout acceptance, not independent update-ID evidence or a blanket playback/scroll stability sign-off. No code change/new OTA for this checkpoint; Production remains held.

October 19 additive wordmark refinement: Craig approved the actual-vector before/after mockup with a very thin white edge around the red location pin, then requested iOS Preview. Source 65ec56ad11e80ec8a0116a559f037fafc5168ac2, OTA01a153f1, group b02aecbd-93db-485c-bb70-62d802c77391, runtime 1.1.10. EAS readback confirms newest iOS Preview. Preserve accepted ad/feed behavior, blue/red geometry, transparent pin centre, wordmark size and fading backdrop. [Release evidence](qa/map-pin-halo-20261019/RELEASE.md). Native phone appearance/adoption pending; Production remains held.

Craig confirmed the outline worked on his phone, remains unsure about its appearance and explicitly chose to leave it for now. Retain it as the current baseline; further logo tweaks are parked. This is user-reported appearance evidence, not a separate Profile update-ID capture.

October19 additive list spacing: Craig requested less black margin beside event cards and thinner white padding beside ad media. Source d501108677b39b2308436b940921ff9bb36a70bf removes6pt event/group outer margins, changes shared ad media inset9pt to4pt while preserving text/CTA spacing, and removes Events' redundant ad border. Latest iOS Preview OTA01a15401, group28b44740-f94d-447b-9cb1-feb78f4f5605, runtime1.1.10; newest confirmed by EAS readback. [Rendered QA and release evidence](qa/list-card-spacing-20261019/RELEASE.md). Keep earlier ad/save/logo changes. Native phone appearance/adoption pending; Production stays held.
