# Android Preview date-only compatibility candidate

Not published. No backend/API deployment or live-record write. Original iOS source checkout remains untouched.

## Baseline and exact scope

Fresh Android Preview list/view identified group efc6c11c-1ae6-4c9a-8897-6f8e396aa38c, update 01a0d607-081f-7a97-9cb5-0fea1111ba48, runtime 1.1.10, commit 8ce23bf9186e91a3282d9071eae668a5c1077bd2. This candidate is a direct descendant, not a replacement with current iOS UI.

Functional commit 6de059b108ee60e7ff5fd64bbe4f87870ea3eaa6 ports only the reviewed 913e268/f43affc policy recognition, honest missing-clock summary/badge/disclosure/calendar guard and No/Yes recurrence handling. The older Android detail path additionally needs the small readVersion2EventTiming helper and metadata lift during refresh/reconstruction; otherwise a detail fetch loses the contract. No current festival/area-overview/lightbox design is backported. The guard explicitly rejects runtime date_range_overview without adding that newer schedule type or changing old area behaviour.

Client feed pages and single/batch details declare exactly dateOnlyActivities=v1. Venue contact/directory reads remain unchanged; this app has no venue-with-events request path. Declaration is compatibility, not authorization or source approval. Current serving API ignores it; the coordinator owns backend gating and data changes.

Cache commit 67019c6 partitions both persisted generations: feed ['events-minimal','original-source-v3','date-only-activities-v1']; detail schema original-source-v2-date-only-activities-v1. Prior keys are not repurposed or copied into the new keys, and auth/user storage is not cleared. Real QueryClient dehydration/hydration tests cover upgrade and rollback. Store feed/detail I/O is exercised; an AST audit checks every root/bootstrap/store cache selector resolves to the central constants.

Nine runtime files change: lib/api/firestoreEvents.ts, lib/queryKeys.ts, store/mapStore.ts, types/firestore.ts, utils/calendarUtils.ts, utils/dateUtils.ts, utils/eventRecurrence.ts, utils/eventScheduleStateCache.ts and utils/eventTiming.ts. All app routes, components, hooks, services, assets, native/configuration and dependency files retain the Android baseline tree.

## Native evidence

Existing s24 / emulator-5554, debuggable com.craigb.gathr 1.1.10 (13), runtime 1.1.10; ordinary local npm-ci dependency directory. Metro served this exact worktree on 8081. adb run-as succeeded and reverse 8081 was present. A fresh native bundle request and the visible 6de059b fixture marker establish source adoption. This is development-client shared-JavaScript evidence, not Android OTA or iPhone adoption.

The actual EventTimingSummaryText, EventTimingBadge and calendar guard rendered synthetic fixtures. Temporary minimal root/index and map stub prevent any map mounting or exploration. No live event or calendar was written. Metro did show Firebase configuration initialization through route discovery; no AuthProvider or event loader was invoked by the fixture. Source files are retained as .txt only, excluded from runtime imports.

- 01-today-tomorrow.png: readable single/two-line labels and unknown-clock badges.
- 02-disclosure.png: both clocks explicitly unknown; no claim that a start was supplied.
- 03-calendar-guard.png: missing-start explanation and Cancel, no timed calendar export.
- 04-auditions.png: October26 evening wording retained in description without a clock; bounded offer retains full date range.
- 05-timed-overnight.png: healthy 7–9PM and 11PM–1AM ranges remain clear.

Each framebuffer was independently inspected for text completeness, hierarchy, alignment and clipping. Initial dev-client startup timed out before Metro was ready; local prewarming and relaunch recovered. Error frames are ignored artifacts, not acceptance evidence. No app-data clear, APK replacement or native build occurred.

The original app/_layout.tsx, app/index.tsx and app/(tabs)/map.tsx were restored byte-for-byte, the temporary data module removed, and the task-owned Metro/emulator stopped before export. restoration-proof.json records SHA256, Git blobs, screenshot hashes and an empty app-route diff. Later cache-only changes do not alter the rendered components.

## Checks and handoff gate

The initial restored-source checks pass 13 suites/132 tests, TypeScript and lint (zero errors, 219 existing warnings; none of the warning files change). Cache isolation tests additionally pass four cases on both platform candidates. Offline parity-probe.cjs.txt passes 20 healthy comparisons against Android baseline and16 marked-policy comparisons against iOS Preview3d2f4f7, using synthetic data without network calls. Final rerun/export/graph results are recorded in validation.json.

Local platform exports and Preview environment preflights are validation only. No EAS update or native build is authorized or performed. Coordinator must independently review final commits, screenshots, graph proof and serving comparison, then obtain the exact release/backend/data gate. Backend capability suppression must be deployed before publishing marked public data; supported Preview candidates can be released separately after approval. Unsupported clients temporarily omit newly marked activities. Production compatibility work and actual device adoption remain separate.

## Final validation

Final restored/cache-isolated source passes 14 suites / 136 tests; TypeScript; lint zero errors / 219 unchanged warnings; clean Android Preview staging/Social/Mapbox/runtime/ancestry preflight. Final Android-only clean-cache local export builds 2,727 Metro modules / 2,669 mapped sources / 5,962,824-byte Hermes, 127 local asset metadata entries. Export proof verifies 11 required source files match the working files exactly, including normal root/index/map, plus zero fixture/test sources and no fixture marker. This is local export metadata, not EAS asset publication. No OTA or native build.
