# Bounded cluster/puck clearance

Base: `22aacceeb2cb26c1d673e516befdff561e29b7ce` (current iOS Production at task start). Fix/test only; no publication.

## Behavior

- A measured, currently visible marker overlapping the puck proxy is the only trigger. Separated markers retain their original geographic coordinate and have no leader.
- Compute the smallest valid separating translation with a 4-point gap. The complete anchor-to-marker displacement, including any existing edge dock, is capped at 56 map-view points. This is a maximum, not a fixed jump.
- If the full marker cannot fit within that cap, use its separately measured compact item count. The same button/cluster identity and full accessibility label remain. A 24-point compact target plus existing 10-point hit slop on each side provides at least 44 points.
- Exclude the header/filter row, measured right rail/control reserve and bottom dock from placement. Incorporate the original edge transform exactly once; do not re-dock an already placed coordinate.
- Invalidate offsets and leaders at the start of every camera change. Recompute after idle; generation guards reject stale asynchronous projection results. Location, viewport, measurement, permission/filter and relevant layout changes invalidate the transaction too.
- Keep the existing native `LocationPuck` and its accuracy pulse unchanged. No provider, native bridge, credentials, check-in, updater, callout gesture or parser changes.

## Conservative location policy

The SDK exposes no exact native puck snapshot to JavaScript. The existing Expo sample is an explicit proxy, not proof of native-puck coordinates. Only overview zooms <=13.5 qualify. Require a finite, <=75m reported accuracy, age <30 seconds and <=4 screen points of reported positional uncertainty at that zoom/latitude. Use a 14-point core radius plus that uncertainty margin, excluding the accuracy halo. Copy snapshot values; compare them again after projection and clear committed offsets when the sample expires even without another event.

If no bounded safe placement exists even for the compact count, retain the original marker and puck and omit the leader. Likewise stale/inaccurate location declines displacement. This avoids misleading distant markers; it cannot guarantee clearance in an arbitrarily crowded or physically constrained viewport. These cases never hide either renderer or enlarge the displacement limit.

## Verification

- 3 focused Jest suites, **39 tests passed**: geometry/freshness, hook lifecycle and the actual measurement component integrated with the hook.
- Covered no overlap; edge/corner placement; measured size scales 0.75–3; total dock+offset cap; compact fallback; control-safe viewport; stale and mutated snapshots; expiry during projection and after commit; rapid camera changes; stale forward/reverse responses; unmount with a pending request; normal/compact transitions, changed count/font dimensions, duplicate-layout feedback and hidden-variant accessibility/touch behavior.
- TypeScript `--noEmit` passed. Targeted lint passed: 0 errors, 35 pre-existing map warnings. `git diff --check` passed.
- Independent source review by `independent_map_review` approved the completed bounded implementation, including the component coverage; no concrete blocker remained. Reviewer did not run native tests or publish.
- Local browser fixture uses the actual hook and measurement component with a browser React Native layout adapter, simulated projection and puck. Observed basic overlap: 18-point shift; no overlap: original anchor/no leader at 1x and 3x text; full-card fallback: compact count without a large shift; default edge: ~27 points; 3x edge: ~53 points within cap; original 40-point dock: ~14 additional points, applied once; camera movement/location expiry: immediate offset removal; delayed replies plus rapid camera moves followed by a separated case: no stale offset.

The browser fixture is **not native Yoga, Mapbox or iPhone verification**, and neither supplied Library screenshot was visually reproduced locally. Supported screenshot materialization failed at Windows extended-attribute handling; the parent inspected the original pixels separately.

## Remaining physical QA / release gate

No OTA export or publication was performed. On an authorized iOS Preview derivative, verify actual native marker dimensions, compact/full transitions without flicker or disappearing markers, real puck timing at stationary and moving locations, pan/zoom repeatedly, large text, no-overlap leader removal and separate usable count/control targets. Confirm the previously accepted no-camera cluster tap and callout drag/scroll behavior remain intact. Native exact alignment is not claimed by synthetic tests.

Preserve current authentication, runtime and check-in/updater fixes when preparing any later release. Reconcile the live baseline again before publication. Keep the previous explicit Cloudflare endpoint denial in force; it was not retried here.
