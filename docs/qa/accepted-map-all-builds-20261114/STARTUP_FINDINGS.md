# Startup cluster investigation

Current implementation: [cold-start cache handoff](../cold-start-20261115/README.md). The findings below describe the pre-repair baseline.

Current reproduction clarification (November 15): Craig reports immediate data when returning to GathR from the app switcher without closing it. The observed slow opening followed minimizing GathR, removing it from the app switcher, then reopening it. Prioritize explicit cold-launch reconstruction; long background absence alone is not currently reproduced. No further paired session-ID exports are required to establish this reproduction distinction.

Accepted starting source: `86fb65f5` on `codex/app-ui-changes`. The approved tap fix remains separate from this diagnosis; no startup behavior change is included in the rollout.

The actual current map store reproduces a cache-to-viewport handoff gap. A first viewport request starts with an empty cache and waits for minimal events. When `setAllEvents` receives a valid cached event during that wait, `allEvents` becomes 1 while viewport and clusters remain 0. A second viewport request immediately projects the cached item, yielding viewport=1 and clusters=1. The stale first request cannot overwrite it. The controlled test passed on the accepted source. This test uses deferred network completion and fixture events, not device performance measurements.

Relevant current source:
- Root cache preload waits 180 ms before looking for restored React Query items, then calls `setAllEvents` (`app/_layout.tsx:688-788`).
- `setAllEvents` intentionally updates only the global event cache (`store/mapStore.ts:1186-1217`).
- `fetchViewportEvents` captures its candidate list before awaiting the first network response (`store/mapStore.ts:1910-1950`).
- Map startup schedules recovery after 1200 ms if both its event and viewport arrays remain empty (`app/(tabs)/map.tsx:5237-5286`). Cache arriving after that recovery has already checked can still leave the original network request as the next opportunity.

This is a reproduced delay source shared by Current and Hybrid and predates Hybrid. It is not proof that every launch waits exactly 1200 ms, nor proof that the phone's whole delay comes from cache handling. Startup network/cache hydration, location positioning, first cluster projection, and native annotation image readiness need separate milestones. Parent render timing and a fully rendered basemap frame do not prove native rich marker bitmap visibility.

The next repair should allow the latest startup viewport to use newly available cached candidates immediately, while retaining filters, expiry checks, request ordering, and a server refresh. Reducing a timer alone does not solve that handoff. Keep the existing native marker/photo rendering repairs intact.

Reproduction and raw JSON are retained under `artifacts/accepted-map-all-builds-20261114/`. Craig clarified that the delay follows leaving GathR and returning much later, and that a recent delete/reinstall was fast. Treat this as long-absence reopening until device evidence distinguishes a still-running process from iOS process eviction. A fast reinstall does not establish that cache persisted.

## Long-absence refresh path

`app/_layout.tsx:793-843` handles AppState active by calling React Query fetchQuery with a three-minute staleTime and ten-minute gcTime, then calls setAllEvents. A stale retained query can therefore trigger a network refresh; those configuration values alone do not measure its actual duration. This callback does not itself clear viewport arrays, clear clusters or set isLoading.

`store/mapStore.ts:1670-1774` separately has a cache-first fetchEvents path. With cached query data it leaves loading false and refreshes in the background. Without query data it sets isLoading true for a foreground fetch; map markers are gated by !isLoading. The map mount effect avoids this fallback when a startup viewport request has already started.

The handoff reproduction is still a valid problem but must not be presented as the confirmed cause of Craig's long-absence symptom. Next decisive evidence should record whether the JS process survived, age/count of restored query data, foreground refresh start/end, viewport/cluster counts, loading changes and first native marker image readiness. Preserve installed data and use one long-absence return; do not rely on reinstall as an equivalent benchmark.


The existing exported `traceRunId` is created for a JS module lifetime. Comparing exports before a long absence and after the delayed return can distinguish a retained JS session from a restarted JS runtime without changing the app. A changed ID does not alone prove OS process eviction; compare the Profile runtime/update footer to rule in/out an OTA change. A reinstall may initially use the embedded bundle before an OTA applies, so its speed must be compared with the exact same running bundle rather than assuming retained cache.

The accepted automatic OTA host defers automatic apply for a background departure from Map (`hooks/useAutomaticOtaUpdates.ts:55-59`). Do not assume every long-absence Map return is an OTA reload. No startup, cache or OTA behavior has been altered in this diagnosis.


## Reproduced: missing query cache hides retained clusters during a store refresh

A second controlled test seeds the actual store with one valid event, a populated viewport and one retained cluster, but no React Query entry and a four-minute-old lastFetchedAt. `prefetchIfStale(180000)` enters fetchEvents, which sees no query data and sets isLoading=true while waiting for the controlled pending fetch. The store still holds cachedEvents=1, viewportEvents=1 and clusters=1. The map's `!isLoading && renderClusterMarkers()` gate is false, hiding those existing markers until the fetch settles. See `retained-cluster-refresh.json`. No real network or device timings are measured.

The tab layout's delayed post-switch prefetch is a current caller (`app/(tabs)/_layout.tsx:636-646`). Query cache garbage collection can leave this cache absent after inactivity, while Zustand still retains data. The root AppState fetchQuery callback alone does not invoke this loading path. Therefore this is a concrete refresh/visibility failure condition and a candidate for the reported long-absence return, not a confirmed account of the phone's exact path.

Both controlled store cases pass on the accepted implementation baseline. The reproducer is retained as `.repro.txt` to avoid treating undesirable behavior as a permanent product contract. No application fix or additional startup OTA was made.


## Current diagnosis boundary after the cold-start clarification

The leading reproduced condition is now the late-hydration startup handoff: a new process begins with empty in-memory viewport/cluster state, while persisted React Query restoration and the first viewport request can overlap. The root provider renders its children while restoration occurs, and the preload uses a 180 ms timer rather than a restoration-complete handoff. Existing store tests already establish that newly restored allEvents does not itself complete the waiting first viewport projection. The 1200 ms recovery can eventually use the cache, if it is available by then. These are source/reproduction findings, not a measured breakdown of Craig's phone delay.

The retained-cluster refresh reproduction remains a separate valid condition, but is lower priority for this specifically reported process-restart sequence. Avoid asking Craig to keep waiting for a warm-resume delay that has not recurred.

The existing manual recorder starts after Start / Clear and stops after 180 seconds. Starting it after the clusters appear cannot capture the cold-launch wait, so another after-the-fact trace is not a timing measurement. A module session ID can establish session continuity but does not isolate cache, network, location or native marker readiness. Accurate phone attribution requires recording those launch milestones before the map appears.
