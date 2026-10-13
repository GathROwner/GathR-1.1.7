# Observer test repair and indexed event-detail matching

Craig approved both tasks after accepting the navigation-subscription Preview on his device. Source baseline: `dfef992`, branch `codex/frontend-adjudicator-20261011`. Live iOS Preview baseline: `57c693b82008f756701deffc402057d5cc11258e`, group `45be7d90-e486-486f-b1c4-6c0164d86bda`, runtime 1.1.10. The accepted UI, date preview, images/fonts, and navigation selector remain in the baseline.

## Observer tests

The previously blocked lifecycle suite imported the native map store without its I/O mocks. Its current component also needs pathname, store subscriptions, and `socialStore.getState()`. The tests now supply these using an isolated Zustand store and mocked services. A cached-return test expected a retry after 1 second, whereas the accepted observer imposes a minimum 2-second sampling interval. It now verifies no premature request/unlock at 1 second and the same session/progress recovery at 2 seconds.

All 12 existing lifecycle cases pass; three added cases cover startup deferral, reuse of a fresh shared location, and a shared location winning a pending GPS fallback without a later stale result changing the session. The actual observer file, thresholds, permission handling, privacy flow and venue selection are unchanged. Together with the existing control and readiness-contract suites, the focused observer pass is 3 suites / 58 tests. This is simulated location evidence, not onsite or runtime map testing.

## Production change

Only `store/mapStore.ts` production code changes, within detail matching/deduplication plus its ID-helper import. The existing `toFirestoreEventId` supplies precisely the equivalence key used by the old comparison helper, including whitespace, numeric IDs and one `fb_` prefix. Nullish IDs never match; blank IDs can match. No new ID semantics or dependencies are introduced.

The first normalized detail for a key is indexed once and reused across `events` and `allEvents`. Each collection records its existing keys to identify extras without repeated list searches. Deduplication uses a key-to-position index: later equivalent records replace the contents at the first position. This preserves first-detail-wins, last-record-wins, stable positions, original existing IDs/types, untouched object references and extras ordering.

Normalization, detail-to-event coercion, the merged event-field block, request/private/contributor guards, fetch implementation, and cache/refresh/error paths were independently compared with Git baseline and are text-identical. The existing cached-then-fresh merge sequence remains intact. No backend/Firestore mutation or parser changes occurred.

The lookup structures trade transient Maps/Sets for bounded linear ID work. Phone memory, network latency, frame rate, and perceived speed were not measured. This is a processing optimization, not a size-saving claim.

## Full-result comparison and measurements

`store/__tests__/fixtures/fetchEventDetails-baseline.ts.txt` freezes the complete original 274-line function from `dfef992:store/mapStore.ts`. Its executable body was independently checked against that commit, normalizing only line endings. The test compiles that reference with the installed Babel tooling and runs it alongside the real current store function, with all I/O mocked. No native map or app UI is mounted. This fixture is test-only and is not imported by the app.

Cases compare both complete collections, including ticket/action fallbacks, descriptions, media ordering, recurrence, timing, location metadata, private/contributor exclusions, fresh/cached/forced paths, malformed/blank/numeric/prefixed IDs, duplicates and 40 varied duplicate-heavy datasets. Explicit assertions anchor expected identities, precedence, content and ordering. A machine-independent work-count test guards against quadratic matching as inputs grow.

The optional experiment runs one warm-up and five measured repetitions for each implementation on identical synthetic inputs, timing the entire detail operation. All full-result hashes match, including the separately captured unmodified control run. See `benchmark.json` and `unmodified-control.json`.

| Rows in each of two collections | Details | Old pair comparisons | New ID-key computations | Old median ms | New median ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 20 | 270,300 | 2,060 | 181.16 | 1.44 |
| 1,000 | 100 | 1,219,000 | 4,300 | 746.50 | 2.71 |
| 3,000 | 300 | 10,977,000 | 12,900 | 6,772.58 | 8.66 |

The counters describe different operations: an old pair comparison normalizes two IDs, while a new key computation normalizes one. Timings are local Node/Jest results with test instrumentation, not phone benchmarks, full-app speedups or guarantees. No timing threshold is used in regular tests. The optional benchmark passed separately and is skipped in the ordinary regression runs.

## Validation

21 focused suites / 222 tests pass independently under UTC and America/Halifax; 1 optional benchmark is skipped in those ordinary runs. TypeScript passes; lint passes with zero errors / 213 existing warnings. `git diff --check` passes. See `checks.json` for exact suite names and counts.

There are no JSX, style, visual-layout, asset, native/runtime/config or dependency changes. No runtime map manipulation, emulator session, backend deployment, database write, ad interaction, native build or Production/Android publication is part of this work. New iOS Preview publication and asset/export verification belong in RELEASE.md. Device adoption of the new update remains separate from publication evidence.
