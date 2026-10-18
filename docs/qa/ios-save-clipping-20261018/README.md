# iOS feed save/reorder clipping comparison

Craig authorized this isolated iOS Preview experiment after reporting repeated card flashing/jumping when saving an event several screens down in Events or Specials, particularly in larger Upcoming lists. The intended behavior is to prioritize saved venue cards; the repeated flashing is unintended. Android tablet observations did not reproduce it, with limited confidence because the tablet loads slowly. Emulator QA was inconclusive: Android System UI stalled before testing, and the restarted emulator crashed with Windows exception0xc0000005 before any save action. No event was saved by the agent.

## Scope

Both feed FlatLists now use removeClippedSubviews={Platform.OS !== 'ios'}. iOS leaves native views attached; Android and web retain the previous true setting. Existing FlatList virtualization remains active. Save order, live updates, grouping optimization, per-card selectors, ad ownership/placements, card layout and rendering batch/window settings are unchanged. No native configuration, dependencies, runtime/version, backend or data changes.

Live iOS Preview baseline independently reread: source d540ae98a223ad67053f8f5f8254fd6675416172, update01a15005-2566-7fe9-8bbc-3a1828a0a209, group894308bd-16ed-4ae7-a749-e0fb1154dd69, runtime1.1.10. This patch is additive on branch codex/feed-optimization-20261018 after documentation checkpointb78c45b; all accepted changes remain.

## Checks and limits

- Independent diff review: exactly two runtime property changes, one per feed. No JSX structure or styling changes. Both files already import Platform.
- TypeScript passed. Existing relevant grouping/list-builder/venue-pager/per-card preference tests:4suites/20tests passed. Full lint passed with0errors/215existing warnings. git diff check passed. Native/config/dependency files match the live Preview source.
- Source and framework investigation: save handler/ranking/pagination/keys predate the optimization; actual RN0.81.5 metrics probe confirms moved rows require new-position measurements. This is synthetic framework evidence, not an iOS reproduction. Official documentation warns of iOS missing-content problems with clipping: https://reactnative.dev/docs/0.81/optimizing-flatlist-configuration#removeclippedsubviews .
- User explicitly approved the Preview experiment. No successful physical-iOS reproduction or rendered verification exists yet. Publication is not proof of a fix. Leaving more views attached may increase native drawing work; evaluate both flashing and responsiveness.
- Publication IDs and guarded export/readback are recorded in RELEASE.md after completion. No Android/Production OTA or paid build is part of this experiment.

## Phone comparison

Confirm the new iOS Preview OTA in Profile after reopening as needed. Events -> Upcoming (other time filters also reported), scroll roughly ten screens, tap an unsaved star, then continue scrolling. Assess repeated flashing/jumping separately from the intended one-time promotion. Repeat for Specials if useful. Keep filters and starting saved state as comparable as practical; one smooth attempt cannot exclude an intermittent issue. If unchanged, restore clipping in a separately recorded comparison rather than broadening the patch blindly.

## Separate accepted UX direction

Craig noted that a card disappearing immediately after saving looks like a bug even when promotion succeeds. He liked the proposed direction: acknowledge Saved immediately, keep the card in place during active browsing, and apply saved-first order on returning to/refreshing the list. A duplicate saved section was considered. This UX change is not implemented in the clipping experiment; preserve the isolated comparison first.
