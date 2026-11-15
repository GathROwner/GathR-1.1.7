# Automatic first-data-fetch stopwatch

Craig clarified that cached restarts were already fast. Neither the cache-handoff
patch nor a fast force-quit/reopen proves that the original slow first data pull
was repaired. No cause or measured speed improvement is claimed here.

This instrumentation keeps a separate bounded, memory-only summary in diagnostic
bundles. It starts at diagnostic JavaScript module load, records account/cache
readiness and the first actual feed source request, individual public pages (up
to 16), private query/venue-directory completion, merge completion, viewport
projection, first nonempty cluster computation and a qualified Mapbox frame proxy.
Public/private failures are marked without error contents. Later source fetches
do not overwrite the first one. Durations are monotonic offsets, not native app
launch measurements. Page time includes response download and JSON decoding.

The existing Share Logs button includes this summary without starting manual
capture. Start / Clear and the manual three-minute expiry do not erase it. It
remains available until the current JavaScript process ends; it does not survive
another app termination. The normal high-frequency map recorder stays dormant.
There are no new timers, filesystem writes, requests, UI subscriptions, personal
identifiers, titles, coordinates or raw payloads in this recorder.

The first qualifying fully rendered map frame is explicitly a proxy. It does
not prove annotation bitmap pixels were visible. Existing request ordering,
pagination, cache lifetime, auth, filters, touch handling and layout are retained.
The panel layout is unchanged. No native map interaction was performed.

Tests control public/private completion separately and exercise pagination,
single-flight reuse, network failure, disabled recording, bounded storage,
milestone deduplication, sharing before manual capture and sharing after Clear
and expiry. Existing cached/no-cache store tests are included.

Broad implementation run: 255 passed, one existing opt-in benchmark skipped,
one unrelated pre-existing cache-key assertion failed. The identical assertion
was independently reproduced on the untouched live iOS source 77bdcee8: the old
expectation omits the existing offer-availability-v1 suffix. No cache-key change
or unrelated test adjustment is included. TypeScript passes; lint has zero
errors and the existing 226 warnings. Raw logs are under ignored artifacts.

Phone instruction after adoption: use GathR normally. After a slow opening,
open the existing logo diagnostic panel and Share Logs before terminating the
app again. No Clear, reinstall or repeated restarts are needed to capture it.

Published and independently server-verified on iOS Production runtime 1.1.20:
group `e1c14d4a-b49e-49e2-bbd4-c82e4694f478`, update
`01a1e034-6ab7-7f47-8c51-038689a20da5`, release source
`0d1acad87a80d980fa49a5e18c35103e813c8529`. The clear-cache export bundled
2578 modules and 112 final EAS assets. The independent release checkout passed
255 tests across 33 suites; the existing opt-in benchmark and independently
reproduced stale assertion were skipped explicitly. Source AST comparison,
after removing only the added timing calls/import, verifies identical map code;
root layout, panel, marker/callout components, native and auth sources match the
previous live release. Phone adoption and an actual slow-opening recording
remain unverified. Other five OTA targets were not changed by this release.
