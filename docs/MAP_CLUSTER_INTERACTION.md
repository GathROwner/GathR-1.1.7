# Map cluster and callout interaction system

## Purpose

This document describes the current GathR map interaction path: camera movement, viewport filtering, cluster readiness, cluster selection, callout presentation, nested scrolling, dismissal, and navigation through visible bottom tabs.

The implementation has changed substantially from the original fixed-delay design. In particular, there is no ordinary 500 ms cluster-readiness delay. Use the current source and opt-in map trace for runtime conclusions.

## Primary files

- `app/(tabs)/map.tsx`: camera lifecycle, markers, selection, native modal, callout close coordination, and bottom-tab proxying.
- `store/mapStore.ts`: viewport partitioning, filtering, pill counts, grouping, Supercluster generation, and equivalent-projection suppression.
- `components/map/EventCallout.tsx`: callout presentation states, shell dragging, nested list scrolling, close animation, and event lightbox ownership.
- `components/map/CalloutModalTabBarTouchLayer.tsx`: in-modal touch targets aligned with the visible bottom tabs.
- `utils/eventScheduleStateCache.ts`: bounded schedule-state reuse across hot map paths.
- `utils/mapTrace.ts` and `components/debug/MapTracePanel.tsx`: opt-in runtime timeline and state snapshot.
- `utils/calloutInteractionSafety.ts`: child-to-parent close acceptance handling.
- `utils/tutorialCalloutClosing.ts`: close-guard bypass rules for explicit dismissal and navigation paths.
- `hooks/useHotspotHighlight.ts`: daily hotspot selection and programmatic camera ownership.

## Interaction layers

Map responsiveness spans four different layers. A symptom should be assigned to one before changing code.

1. **Native touch delivery**: Mapbox marker views, React Native modal surfaces, overlays, hit targets, and `pointerEvents`.
2. **JavaScript scheduling**: camera callbacks, debounced movement end, viewport filtering, React commits, and timer lateness.
3. **Map projection state**: viewport membership, filtered events, venue grouping, cluster identity, and native marker reconciliation.
4. **Callout state**: selection, mount/layout, presentation state, shell responder, nested ScrollView, close acceptance, and route handoff.

A callout whose venue selector, resize button, and event lightbox still work is not evidence that the whole app has frozen. If scrolling and dismissal fail together, inspect the callout responder and close contract first.

## Cluster readiness and tap guards

Interactive readiness is derived from current data state:

```ts
const hasZeroFilteredResults = !isLoading && filteredEvents.length === 0;
const clustersReadyForInteraction =
  !isLoading && (clusters.length > 0 || hasZeroFilteredResults);
```

The transparent not-ready overlay is present only while data is not loading, clusters are not ready, and the filtered result is not legitimately empty. It is a native touch interception mechanism, not a timer.

Cluster selection also checks synchronous refs and state for:

- current processing cluster;
- loading and readiness;
- programmatic camera ownership;
- callout close transitions;
- tutorial/hotspot interaction state;
- Android retap-overlay state where applicable.

Use `onPressIn`, `onPress`, and handler-start trace milestones to distinguish native non-delivery from a JavaScript guard rejection.

## Camera movement and filter-pill return

Meaningful camera changes hide the top filter pills. Movement end is debounced by approximately 250 ms after the last meaningful camera event, with a bounded fallback for prolonged movement.

When movement end is recognized, the current implementation dispatches the native pill-return animation immediately, before final reconciliation work. A short post-show lockout prevents tiny follow-up camera ticks from instantly hiding the pills again.

Perceived return time can still include:

- Mapbox inertial camera events after finger release;
- late JavaScript timer execution;
- React/native animation duration;
- viewport and marker reconciliation.

Do not describe a late timer as a race condition. Compare its expected and actual firing timestamps with the synchronous work occurring in between.

## Viewport filtering and clustering

The hot path partitions coordinate-bearing events by the current bounding box, applies active time/category filters, groups events by venue, and generates the cluster projection.

Performance invariants:

- Schedule state is cached by event identity, relevant timing input, timezone, and time bucket rather than recomputed independently for every consumer.
- Expiry, map filtering, cluster eligibility, Now/Today classification, and pill counts must retain identical timing semantics.
- Per-gesture timing metrics are bounded or reset; lifetime totals must not be mistaken for one render's work.
- Equivalent viewport projections and equivalent cluster arrays do not produce redundant store commits.
- Optimization must not alter filter counts, eligibility, cluster membership, or selected venue identity.

The trace records filtering duration and schedule-call counts, viewport partition and commit results, grouping and clustering duration, and whether an equivalent store commit was skipped.

## Callout lifecycle

### Selection and presentation

A successful cluster press synchronously claims the processing guard, prepares or reuses callout data, selects the venue set, and requests the camera/callout presentation. The native modal owns the visible callout surface. Trace selection, render, first layout, native presentation, and first visible frame separately.

### Presentation states

The callout can be minimized, partially presented, or expanded. Shell dragging changes presentation state. The nested content list is scrollable whenever the callout is not minimized:

```tsx
scrollEnabled={calloutState !== 'minimized'}
```

The shell PanResponder must not toggle list scrolling through transient state. Native responder termination may omit the expected release callback. Termination handling restores shell transform state without leaving the nested list disabled.

### Close acceptance contract

The child close animation and parent selection state form an acceptance handshake.

- The parent callback may return `false` when a close is rejected.
- A rejected close resets the child's `closeAnimationStarted` latch.
- A cancelled animation also resets the latch.
- Legacy `void` and explicit `true` results are treated as accepted.
- Explicit dismissal paths can bypass the short anti-flicker guard: X/onClose, modal request-close, bottom-tab navigation, and tab re-press.

Without the reset, one rejected close can permanently make later X, map, and tab attempts appear inert while unrelated inner controls continue to work.

### Visible bottom tabs inside a native Modal

A transparent React Native `Modal` still owns the native touch surface. The application's underlying bottom tabs can remain visible but cannot receive touches directly.

`CalloutModalTabBarTouchLayer` renders three transparent Pressables inside the modal, aligned over Events, Map, and Specials. The layer requires explicit touch ownership and native stacking/elevation. Each target requests an accepted callout close; Events and Specials then route to their destination, while Map closes and remains on the map.

When automating this behavior, capture the open callout immediately before the tab tap and confirm the destination immediately afterward. A second tap at the old coordinates can land on a newly rendered feed card and open its lightbox, misleading the tester into thinking navigation failed.

## Opt-in map trace

Enable only in an authorized diagnostic Preview bundle:

```text
EXPO_PUBLIC_MAP_LATENCY_TRACE=1
EXPO_PUBLIC_MAP_LATENCY_VARIANT=baseline
```

Use `baseline` for instrumentation-only measurement and `optimized` for a candidate containing the performance changes.

On device:

1. Long-press the lower-left GathR logo.
2. Select Clear.
3. Perform one concise pan, pinch, cluster tap, or callout action.
4. Reopen the panel.
5. Use Share Logs when the trace is needed elsewhere.

The buffer is bounded and camera ticks are aggregated. Do not add unbounded logging or high-frequency `console.*` calls to production paths.

Useful interpretation:

| Evidence | Likely layer |
| --- | --- |
| No marker `onPressIn` | Native overlay, Mapbox reconciliation, or hit target |
| `onPressIn` followed by blocked-handler event | Readiness, processing, programmatic-camera, tutorial, or close guard |
| Timer lateness grows during filter/commit work | JavaScript workload or timer starvation |
| Selection is immediate but first visible frame is late | Callout mount/layout/native presentation |
| Inner controls work but list will not scroll | PanResponder/ScrollView ownership |
| Inner controls work but every close path fails | Close latch versus parent guard |
| Callout closes from a bottom-tab tap but route seems unclear | Confirm destination before another scripted tap |

## Regression tests

At minimum, preserve coverage for:

- schedule-cache keying, invalidation, and semantic equivalence;
- per-gesture metric reset/bounds;
- equivalent viewport and cluster commit suppression;
- parent close accepted, rejected, and legacy `void` results;
- close-latch reset after rejection or animation cancellation;
- PanResponder termination with nested scrolling still enabled;
- explicit close reasons bypassing the anti-flicker guard;
- modal Events, Map, and Specials hit-target geometry and callbacks.

## Device verification matrix

For an authorized Preview OTA, verify Android first without clearing app data:

1. Confirm the Profile footer shows the exact new Android update ID.
2. Open a multi-venue cluster and switch venues.
3. Scroll a callout containing at least two cards and capture the changed list position.
4. Open and close an event lightbox.
5. Close the callout with X.
6. Resize it, then close by tapping the map.
7. Reopen it separately for Events, Map, and Specials bottom-tab tests.
8. Capture each destination before the next input.
9. Confirm Profile social rows and other Preview configuration remain intact.

Only after the exact final Android bundle passes should the identical commit move to iOS Preview. Run clean-worktree, ancestry, Mapbox, auth/social, environment, runtime, and platform preflights, then server-verify the iOS update ID, group, branch, runtime, platform, and commit.

## Hotspot boundary

The daily hotspot owns programmatic camera movement while it animates. Taps may be intentionally rejected during that lock. This is distinct from ordinary post-pan latency or a stuck callout. Confirm the trace's programmatic-camera reason before changing hotspot timing or selection behavior.
