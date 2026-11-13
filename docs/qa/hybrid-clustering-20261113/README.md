# Hybrid clustering and thinner rings — November 13, 2026

Craig requested less overlap and thinner segmented photo rings, then clarified that markers should not shift around after the map settles. The final implementation adjusts geographic grouping through the existing cached Supercluster index. It adds no collision-search hook, map-idle placement pass, movement animation or leader lines. Existing user-dot clearance and edge docking remain at their accepted baseline; this patch adds no displacement behavior.

## Final changes

Hybrid selects a clustering profile with a 160-map-point radius at integer zooms, converted to Supercluster's tile extent (80 at the existing iOS extent 256). Its index continues to zoom 20 so nearby venues can remain grouped in detailed views until geography has enough room. Other map styles retain their exact existing configuration. The same cached index, cluster assembler, filters and callout selection are used. Selecting the same profile is a no-op. Profile changes rebuild once; ordinary zoom queries use the existing index. No extra backend queries are introduced.

Photo arc thickness is 3.15 logical points, down from 7.2. The photo diameter and its existing thin white border stay the same. The circle's outside diameter contracts accordingly, keeping the arc against the photo. Static venue-total ring thickness remains unchanged. The marker reserves one size across its rotating venues, including the widest category strip and friend badges, so the photo and summaries keep their positions as content changes. Geometry is memoized; width measurements avoid constructing unused glyph images.

## Visual review

Independently reviewed [actual marker components](actual-markers.png), including single/multiple venues, friends, missing photos, selected state, large venue totals and category overflow. Reviewed the [clustering comparison](clustering-comparison.png), which uses fixtures exported by the actual mapStore and installed real Supercluster, rendered with the actual Hybrid component through RNWeb. The backdrop and event data are fixtures; this is not a native iPhone screenshot. Before grouping has six markers and two overlapping pairs; Hybrid has two marker groups with no overlap in this fixture. Both retain six venues, twelve events and six specials. See [scene checks](SCENE_CHECKS.json).

Geographic clustering reduces crowding; it is not a mathematical guarantee that every possible combination of long summary pills or dense same-location venues can never overlap. The radius is a conservative trial for Hybrid, not a new displacement system. Device responsiveness and iOS adoption remain to be checked on the phone. The accepted native PointAnnotation gesture routing, image-based summary capture, all-zoom details, existing tap/callout behavior, three-second rotation and timing halos remain.

## Validation and performance

79 focused tests passed, covering the real spatial index, grouping/splitting, data totals, restoring default mode, idempotent profile selection, filters/expiry, callout selection, bitmap summaries, stable rotation dimensions and ring-to-photo contact. TypeScript and Expo lint checks are recorded in the release receipt; lint has 227 pre-existing warnings and zero errors.

The [host microbenchmark](CLUSTERING_BENCHMARK.json) uses the installed Supercluster with 1,000 fixture venues. Median index build was about 2.22 ms with the existing iOS configuration and 2.69 ms with Hybrid; mean cached query was about 0.17/0.23 ms. These are Windows Node measurements, not iPhone timing or end-to-end app latency. The important architectural bound is reusing the existing cached index rather than adding a post-settle collision solver.
