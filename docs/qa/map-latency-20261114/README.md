# Map latency investigation on the accepted UI baseline

Baseline: `8840bd45242cd3d2f595fe05644a5c92a4599402`, checkpoint `baseline/gathr-ui-20261114`, implementation checkout `C:/Users/craig/.codex/worktrees/app-ui-changes/GathR-upgrade-sdk54`. The app source is equivalent to the accepted iOS Production release `82ca96b5ce75fd91bbdcef7095ce30a225ae8f8a`, with the retained Android release configuration. Investigation is read-only with respect to application behavior; no optimization or tracing-enabled OTA has been published.

## Reproduced: one venue interaction invalidates every Hybrid marker

`HybridClusterMarker` selects the entire interaction Map. `recordInteraction` replaces that Map when one venue is viewed. Every subscribed marker rebuilds its venue/category presentation; the changed `venues` identity triggers its snapshot layout effect, which requests a native annotation refresh after two animation frames.

A controlled React harness uses the actual `HybridMapAnnotation`, `HybridClusterMarker` and Zustand interaction store. Only native Mapbox/SVG drawing and persistence are mocked. With 1, 12 and 32 mounted markers, one venue interaction produces respectively 1, 12 and 32 presentation rebuilds AND annotation bitmap-refresh requests. Marker props and cluster data remain unchanged. `hybrid-fanout.json` records the identities of each affected marker.

This applies directly to single-venue taps, which record engagement before selecting the callout (`map.tsx:7350`), and to venue changes/engagement in an open callout. It is not proof that every initial multi-venue callout delay has the same cause: a multi-venue open does not take that immediate single-venue engagement path.

A second harness case mounts 32 rotating two-venue markers. A single 3-second rotation tick produces 32 annotation refresh requests. These rotations are synchronized on mount. iOS also keeps nonselected marker animations active while a callout is open; the existing callout animation pause is Android-only (`map.tsx:4084-4119`). These are plausible competing workloads, not measured iPhone latency values.

Origins: global interaction subscription entered with Hybrid in `bf6e724` on November 12. The explicit snapshot-change callback was added in `db74f1e` on November 13 to repair missing native-rendered summary contents. Any optimization must preserve that rendering repair and the pinch/pan behavior.

## Reproduced: late cache hydration does not immediately project an in-flight viewport

The first viewport request can start with no candidate events and wait for its public minimal-events fetch. If cached events arrive through `setAllEvents` during that await, the global cache becomes populated but the current viewport and clusters remain empty. An explicit recovery viewport request immediately projects the cached event, without waiting for the first network request. The delayed original request is correctly prevented from replacing the newer projection.

`late-cache-handoff.json`: after hydration, allEvents=1, viewport=0, clusters=0, initial request unfinished. After recovery: viewport=1, clusters=1. The map schedules that recovery after 1,200 ms (`map.tsx:5257-5276`). This is an ordering-dependent cache handoff gap shared by Current and Hybrid. It does not establish that every cold launch incurs exactly 1.2 seconds or that networking is otherwise fast.

The same controlled scenario passes against the pre-Hybrid iOS Preview map/store logic from `7961bd8` (only the list-count backport differs). The startup recovery mechanism dates to `35636fb` in May. This is pre-existing behavior, not evidence that the new ring/pill design introduced a new startup race. The accepted redesign could change timing enough to expose it, but that requires a device trace.

## Measurement boundary

Current and Hybrid use different native input routes: React Native Touchable handlers versus Mapbox PointAnnotation selection. Both converge on `handleMarkerPress`. Existing trace milestones distinguish native callback delivery, processing guards, callout preparation/selection, mount, layout and `event_callout_first_visible_frame`. No new competing callout state transition has yet been reproduced.

Existing `map_markers_render_complete` measures preparation inside the parent's marker-render calculation. It precedes actual child rendering and Hybrid's SVG-to-PNG conversion, photo decoding and PointAnnotation capture. A Mapbox fully-rendered basemap frame alone is also insufficient proof that every marker bitmap is ready. Therefore these metrics cannot yet establish first-visible-marker or final-rich-marker completion on iOS.

No physical iPhone or Android trace was captured in this investigation. ADB inventory found no connected device. The previously recorded emulator graphics instability is not represented as device performance proof. Harness execution times are intentionally excluded: desktop test timings under concurrent release exports are not mobile benchmarks.

## Bounded next measurements and repair order

1. Capture the same area, zoom, filters and comparable venue/event counts in Current and Hybrid, measuring cold process start and warm process relaunch separately. Preserve installed app data. Record the exact runtime/update ID. Establish cache availability, first viewport projection, native style/frame readiness, first marker image readiness and final rich-marker readiness.
2. For a single-venue pin and a multi-venue cluster separately, compare touch/selection callback -> handler -> callout preparation -> selection -> layout -> first visible frame. Trace guard rejections and timer lateness; do not assume a race.
3. First candidate repair: subscribe markers only to relevant venue interaction state, skip captures when the visible graphics are unchanged, and prevent background rotation/capture bursts from competing with callout opening. Preserve the accepted visible design, badge semantics, rotation cadence, summary correctness and map gestures.
4. Independently test a cache-arrival handoff that projects the newest available cache immediately, preserves request-order guards and still refreshes from the server. Avoid global loading-flag or readiness-threshold changes without measurements.

The reproduction scripts are saved as `.repro.txt` rather than permanent tests: asserting the current pathological refresh count should not become a supported contract. To rerun, copy to `artifacts/map-latency-20261114/__tests__/` using names `hybridFanout-test.tsx` and `lateCache-test.ts`, then run Jest with `--runInBand --runTestsByPath` from the accepted source checkout. Four fan-out/rotation cases and one cache-handoff case passed; the pre-Hybrid cache-handoff comparison also passed.
