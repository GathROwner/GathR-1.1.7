# Source-backed gallery visiting hours — minimum functional slice

Owned branch `codex/visiting-hours-production-oct21`, checkout `C:/Windows/System32/GathR-Project/vh21`. Base is public iOS build 79's exact embedded source `6c773c3a13663c950e73438fd7447b613e81ffa8`, runtime 1.1.20, Production channel. EAS build `d2567498-8749-4863-bc10-b5ff85d74e41` confirms this identity. Channel mapping points to production; a fresh iOS/runtime1.1.20/production manifest request returns 204 NO_UPDATE_AVAILABLE, so no compatible OTA supersedes that embedded source at preparation time. Runtime1.1.10 Preview is a different target and is not a substitute.

Craig authorized the smallest functional selected-weekday fix. Production OTA approval is separately pending with the coordinating chat; no publication or data apply has occurred at this checkpoint.

## Behavior and scope

One optional source-explicit `timing.visitingHours` extension holds the exact facility, activity bounds, complete weekly intervals, source IDs/URL/check time/evidence and holiday-change caveat. It reuses named weekday/segment concepts, supports split/overnight intervals, validates before use and does not invent a generic recurring parent or dated children. The API's existing timing metadata path preserves it; no API or parser release is needed for this exact source-explicit first case. No Google lookup or legacy Places-adapter change is included.

The exact Soft Internet Theory fixture retains October 3, 2026–January 24, 2027 and blank overall clocks. Source hours are Tuesday–Saturday 10–17, Sunday 13–17, Monday closed. Shared eligibility and display use the selected date; Upcoming includes future visits of this ongoing exhibit, not just records with future original starts. Monday is omitted from day-specific results, while direct details show Closed. A multi-date window shows the original bounds and Hours vary by day. Today after daily close remains discoverable under Today; Now ends at the visitor interval's close; the parent does not expire until its overall date interval ends. A closed current day does not remove a valid Tomorrow/Upcoming result from the later map projection gate. Future-only windows suppress Now badges even when today's visit hours are active.

The visitor override requires blank canonical clocks, an exact matching known venue ID, valid timing-v2/date-only bounds, complete explicit weekday intervals, and source evidence. Unknown, malformed, unsupported, other-facility, recurring and actual timed-session inputs retain their existing path. No building/venue schedule is silently substituted. Dated exceptions are not implemented in this minimum version; a contract containing them is rejected instead of silently ignoring them. The generic holiday caveat is displayed; it is not a claim that future holiday hours were verified.

Calendar action explains that visitor hours are not a months-long appointment and opens the source on explicit selection. It does not invent the user's visit start/duration. Existing ordinary unknown-time and timed calendar paths remain unchanged.

Existing source links, native configuration, dependencies, models/prompts, parser guards including e92, gates, queues, checkpoints, media and interaction behavior are preserved. This adds a consumer for verified hours, not automatic hours extraction or an unrelated-record migration.

## Verification

At the implementation checkpoint, 12 relevant suites / 117 tests pass: source/API fixture normalization and JSON cache persistence; Tue–Sat/Sunday/Monday; Today/Tomorrow/Now/Upcoming/custom windows; date bounds; DST; opening/closing/midnight cache transitions; split/overnight access; missing/wrong facility and malformed metadata; ordinary unknown/start-only/explicit/estimated/overnight controls; actual shared selected-date component renders; future-only Now suppression; existing carousel and store expiry gates. TypeScript passes; lint exits zero with the same 215 existing warnings and zero errors. Subsequent final gates and exact frozen source hashes are recorded in the review packet.

Rendered the actual shared timing summary and badge components through React Native Web using the source-backed fixture and deterministic date/filter context. The four-case screenshot checks hierarchy, spacing and the actual weekday/Sunday/closed/range text. This is isolated component evidence, not an Android screenshot or proof of iOS79 adoption. The Android emulator was not connected; no map or native device was manipulated.

Private artifacts are in `C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/visiting-hours-oct21/`. The render loader substitutes only the store selection context and RN Web runtime; it loads actual source components, hooks, date/timing helpers and styles. The changed components retain existing layout/styles. Source fixtures are explicitly distinguished from live app adoption.

## Exact first data correction and release order

Default-dry helper: Apps Script `firebase/repair-soft-internet-visiting-oct21.cjs`. Prepared plan `firebase/artifacts/soft-internet-oct21/visiting-hours-plan.json`, SHA256 `e43bf8f798d49f5a2348885c4f42312296ce9d34c250996dc5a067ca36383cea`.

Only `venues/slug_ccoagallery/events/XDJ0vlTopBBg3rEibyOj` gets `timing.visitingHours` and updatedAt. Feed marker advances 342→343 if unchanged. Two complete typed originals are archived atomically with the two canonical actions (four writes). Fresh target versions, source HTML hash, verified source capture, fixture hours, zero active parser and all three unchanged historical checkpoints guard the apply. The whole gallery venue and both separate opening-event documents are protected by exact readback. All other event/timing fields, dates, blank clocks, source/media/contact/history remain unchanged. Drift aborts.

Release sequence: independently review frozen code/tests/render and exact repair; resolve Production approval; clean Production-config export/preflight; publish only iOS Production/runtime1.1.20 and independently confirm group/platform/runtime/commit; recheck idle and exact plan; apply once; verify API metadata, bounded venue/date feed, selected-day evaluation, full typed delta/archives and recovery eligibility. Unknown commit outcomes are inspected before any retry. Existing clients without this JS fix continue their previous honest date-only display until they adopt; the legacy fields do not acquire fabricated clocks or false Now claims. No Preview, Android, native build, parser/API deployment or broad migration is implied.
