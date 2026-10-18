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

- Latest iOS feed comparison: Craig confirmed OTA01a150eb adoption but flashing persisted; clipping-off did not resolve it. He approved restoring clipping and deferred saved-first movement. Implemented source a5caa593d4a8d5a4311b7c8fc11081caf392a60f, iOS Preview OTA01a150fc, retaining all previous optimizations. Save/star and existing Saved badge react immediately; current browsing order remains until return/filter change/pull refresh, when pending saved ranking starts at the top with fresh measurements. This UX direction is implemented, with physical phone adoption and jitter results still pending. See [current release evidence](qa/feed-save-ranking-20261018/RELEASE.md).
- Frontend optimization follow-up was explicitly approved and implemented October18: per-card like/interest subscriptions and reuse of filtered venue grouping during pagination. Source d540ae98a223ad67053f8f5f8254fd6675416172, branch codex/feed-optimization-20261018 in this same checkout; iOS Preview OTA01a15005. Craig did not notice an obvious speed benefit and reported iOS save-triggered feed flashing/jumping; contribution from the optimization is unconfirmed. He authorized an isolated iOS clipping-off Preview comparison, retaining both optimizations and current save ranking; see [comparison scope and checks](qa/ios-save-clipping-20261018/README.md). He also liked immediate Saved feedback with promotion deferred until returning/refreshing, as a separate future UX direction, not part of this clipping test. See [optimization implementation and release evidence](qa/feed-optimization-20261018/RELEASE.md); do not propose these as unimplemented or silently omit them from later additive work. Original accepted checkpoint above remains separately identified.
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
