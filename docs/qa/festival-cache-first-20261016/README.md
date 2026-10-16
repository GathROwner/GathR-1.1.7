# Festival activity browser: cache-first candidate

Status: validated candidate, stopped before OTA publication for independent coordinator review.

## Source and scope

- Source branch: `codex/festival-browser-cache-first-20261016`.
- Runtime implementation commit: `1ade792e806423919c217a0a4bb9542ef573393d`.
- Base: current iOS Preview `7473c3e17b607a3c82595ee0b71b60331144bf97`, runtime `1.1.10`, group `948ec492-513f-4a93-a3be-7980f3213ed4`, update `01a14132-e6b0-7ab4-acbb-efdf2fab2977`. Read back again on October 16; newest iOS row remains this group.
- Four runtime files: `AreaLocationBrowser.tsx`, `useAreaActivities.ts`, `areaActivityCache.ts`, and the appended status-aware client loader in `firestoreEvents.ts`. Existing nullable loader callers remain unchanged.
- Already available exact linked IDs render independently and open synchronously. Missing/stale IDs load with a shared four-request limit. Cached cards stay usable during refresh. No polling interval.
- Existing venue, date, recurrence, cancellation, expiry and source gates remain in use. Confirmed 404/410 removal has a distinct cache entry; transient errors retain usable data. Newer source arrivals are protected from older in-flight results.
- Rich per-ID entries use a new cache generation, separate from the previous aggregate `Event[]` keys. User/auth storage is preserved.

## Native visual evidence

All PNGs are unedited native `1080x2400` framebuffer captures from the existing `emulator-5554` Android debug client, package `com.craigb.gathr`, native version `1.1.10 (13)`, runtime `1.1.10`. Metro served this worktree and the fixture visibly identifies implementation `1ade792`. This proves shared JavaScript behavior, not iOS device adoption or production network latency.

The standalone fixture uses local synthetic records and a private in-memory query client. It never mounts or operates the GathR map. Full fixture source is retained as `fixture.tsx.txt`, outside the app route graph. No real linked festival IDs, backend changes, live record writes, APK installs, account creation or user-storage clearing were performed. The guest lightbox intentionally keeps its existing registration gate, so authenticated description/actions were not verified here.

| Capture | Observed behavior |
| --- | --- |
| `01-cached.png` | Twelve cached activities visible, requests 0, detail hydration 0. |
| `02-cached-open.png` | First activity opens in the existing lightbox, Event 1/12. |
| `03-cached-next.png` | Horizontal title swipe advances to Event 2/12. |
| `04-return.png` | Venue-header swipe down returns to the same twelve-item programme; counters remain zero. |
| `05-cold-loading.png` | Unknown count shown as an ellipsis, “Loading activities…”, four missing-record requests. No false zero/empty result. |
| `06-partial.png` | Two ready cards visible with `2+`; only two missing requests, no blocking full-list spinner. |
| `07-partial-open.png` | Cached card opens as Event 1/2 while missing requests are pending. |
| `08-refresh-ready.png` | Two cached cards, zero requests, refresh enabled. |
| `09-refreshing.png` | Explicit refresh has two requests; both cached cards remain visible. |
| `10-refresh-complete.png` | Count becomes one, updated title appears, confirmed missing second record is removed. |

The original root, index and map routes were restored byte-for-byte and their SHA256 hashes verified; see `restoration-proof.json`. The temporary root fixture module and its environment file were removed. The app and task-owned Metro were stopped; the pre-existing emulator was left running.

## Validation

- Final restored-route run: eight Jest suites / 69 tests pass. The expiry suite is recorded separately (14 tests) for a combined nine suites / 83 tests.
- TypeScript passes.
- Full Expo lint passes: zero errors, 213 pre-existing warnings.
- `git diff --check` passes.
- One existing date-only cache fixture had expired relative to October 16. Its test clock is now fixed to October 15; no runtime behavior was changed for that test repair.
- Local iOS Preview auth/social/Mapbox preflight and production export are recorded in `export-check.json` after completion. Publication remains prohibited for this handoff.

Raw local command logs and export files are under ignored `artifacts/festival-cache-first-20261016/`.
