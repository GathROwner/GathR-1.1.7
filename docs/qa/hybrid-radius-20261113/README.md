# Less aggressive Hybrid grouping — November 13, 2026

Craig confirmed the prior update worked, but reported groups combining venues that still appeared far apart. The accepted thinner rings, photo size, stable rotation bounds, bitmap summary capture and native gesture handling remain unchanged.

Hybrid radius is reduced 30%, from 160 to 112 Mapbox logical points at an integer index level (iOS Supercluster radius 80 to 56 at extent 256). Hybrid now queries the nearest integer index level rather than always rounding down. That lets groups split half a zoom level earlier, avoiding the broad reach that built up toward the upper end of an integer zoom bucket. Default/Current/Standard/GathR keep their previous radius and floor-zoom query behavior. Max zoom 20 for Hybrid is retained.

This is parameter/query tuning within the existing cached Supercluster index: no collision search, post-settle marker displacement, new timers, native modules, backend queries or new index per camera tick. Cluster contents and tap/callout behavior use the existing assembler. All counts and venue coordinates remain intact.

## Visual acceptance

Reviewed the [actual-component comparison](clustering-comparison.png). The same four fixture venues were exported by the actual mapStore with the installed real Supercluster, once from the prior live source and once from the revised source. The wider-separated pair now has separate markers; the close pair stays combined. Marker count increases from two to three, with four venues, eight events and four specials retained in both views. Neither view overlaps in this fixture. Rendering uses RNWeb with iOS props and a fixture backdrop, not a native iPhone screenshot. See [scene checks](SCENE_CHECKS.json).

Grouping remains geographic, so this is a balance between crowding and merging distance rather than a guarantee against all overlapping pills. Device responsiveness and the exact grouping in Craig's live data require phone verification.

## Behavior checks

Real-index store tests cover venues 130 points apart staying separate, a close 35-point pair remaining grouped, and a 90-point pair splitting across zoom 15.49/15.51. They also retain all data totals, normal zoom splitting, default-style restoration, idempotent profile changes and stable coordinates. The full release validation includes prior marker/summary, filter/expiry, callout-selection and latency invariants. Production Firebase/App Check/social, Mapbox, clean source/export and EAS readback are recorded with the release receipt.
