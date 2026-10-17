# Area overview lightbox looping — candidate for review

**Published to iOS Preview as OTA01a14a65 under Craig's explicit authorization. Native post-fix visual verification and iPhone adoption remain pending.** See RELEASE.md; prepublication evidence below is retained.

Functional/tested export commit: `9afa0df43dab2a9576e2b955e376472631f820f3`, branch `codex/carousel-boundaries-20261017`, checkout `C:\Users\craig\.codex\worktrees\carousel-boundaries\GathR-upgrade-sdk54`. Documentation-only evidence commits follow without changing that runtime tree.

Fresh live baseline: iOS Preview source `12025d15da05f4d5832cd3ff5129c5fdbdd9b553`, OTA `01a14a41-5615-7df3-959a-b722370fd2c7`, group `9fd7c64c-a8f0-4d44-b2fe-1aad06727d72`, runtime1.1.10. Craig confirmed that Trending update works on his phone; this area change is additive.

## Behavior and exact scope

The area overview selection uses `source: city_event_marker`. When a callout is mounted, EventCallout owns its lightbox above the native modal; otherwise GlobalEventLightbox renders the fallback. Both previously passed the bounded default. The candidate gives both hosts the same narrow source policy, so previous on the first parent event wraps to the last and next on the last wraps to the first. One parent remains stationary.

Only three runtime files change:

- `utils/lightboxNavigation.ts`: adds the five-line `shouldLoopGlobalLightbox` whitelist for exact Trending manual/auto and city_event_marker sources.
- `app/(tabs)/map.tsx`: imports the policy and replaces the existing four-line Trending conditional with its shared call.
- `components/map/EventCallout.tsx`: imports the policy and passes it for the global selection's source. A local venue selection has no global source and stays finite.

The shared policy prevents the area fallback/native-modal hosts from drifting again. Trending remains looping. Other global deep-link/route/friend contexts, ordinary local callout paging, and AreaLocationBrowser child-activity paging remain finite. Event arrays/IDs/order/currentIndex/image selection/location data are not rewritten. The existing area1/2counter and ViewLocations wiring are retained; no hero, gallery, layout or gesture implementation changes.

## Tests and gates

New tests evaluate actual production GlobalEventLightbox body and EventCallout's actual ownership bindings/navigation callback/lightbox JSX without mounting MapScreen or Mapbox. They invoke the actual EventImageLightbox arrow callbacks and saved-ref swipe completion handler with the hosts' real props and a deterministic animation adapter. This is source/callback integration proof, not a native gesture/layout screenshot.

Before the fix, all8area boundary cases (two hosts x two/three parent events x arrow/swipe) failed;10ownership/finite cases passed. After the fix, all20area-host cases pass, including the added single-parent cases. Tests check repeated first-to-last/last-to-first cycles, original object identity/order/source, destination venue and hero, unchanged media and8location first-parent data, route callback presence, single-owner suppression and finite unrelated/local contexts. Existing actual Trending/category tests remain passing. Existing child programme, cache, backlinks, timing and gallery suites remain passing.

Expanded clean validation:25suites /294passed /1existing optional benchmark skipped; TypeScript passes; lint0errors /215existingwarnings; diff/clean/ancestry checks pass. Guarded iOSPreview auth/account-continuity/social/Mapbox preflight passes with **Publish=False**.

## Clean export proof

`export-check.json` records the complete machine-readable audit:

- iOS-only Hermes bundle:5,736,488bytes, delta+144bytes from live-reviewed Trending export.
- SHA256 `7538dce13b5c88cf851068d6affd44a261c1c4595bee2cacdcf7b042c11429c3`.
- 2505modules /2461source-map sources; exact same source set as live-reviewed export.
- Only the three approved runtime source contents differ. Every other runtime source content matches baseline.
- 111assets, identical metadata order/set and independently verified identical file bytes.
- Ten route/component/utility contents match checkout hashes; no fixture/QA/test source in runtime graph.
- Accepted lightbox/carousel/AreaLocationBrowser/programme/cache/API/auth/social/native/config source files are unchanged.

Local artifacts: `artifacts/area-lightbox-loop-20261017/` contains before/focused/release test logs, typecheck/lint/preflight/export logs, fresh EAS readbacks and the export. No QA app entrypoint or environment was created, no normal route was temporarily replaced, Metro remains stopped, and installed app/data were not touched.

## Visual/release gate

No genuinely available post-fix native screenshot exists for this patch. Previous emulator reconnect/local-manifest requests were policy-blocked even after connection approval; this task did not retry them through any tool or method. The permitted prior read-only capture showed Android launcher/System UI ANR, not a loaded GathR client, and is not offered as area-fix acceptance. Craig's earlier Trending waiver was not inherited during preparation. He subsequently explicitly authorized this area publication after disclosure of the gap; see RELEASE.md.

Publication was initially held for independent review and the visual-evidence gap. Root reviewed the concrete source/export, and Craig explicitly authorized iOSPreview publication despite the gap. No Android/Production publication, native build, backend/data change or map interaction was authorized or performed. iPhone adoption is not claimed.

Root independently accepted the source/tests/export comparison, then independently verified published live metadata and actual remote bundle bytes. Exact release/readback evidence and Craig's standing confidence-based Preview authority are recorded in RELEASE.md.
