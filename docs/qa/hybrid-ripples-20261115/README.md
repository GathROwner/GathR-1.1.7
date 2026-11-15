# Coordinated water ripples

Craig accepted the darker/faster pulse, then reported venue switches interrupting
it and requested a double ripple like a stone falling into water. This keeps the
accepted green #188038 and yellow #C99700 and adds a larger leading ring plus a
smaller following ring, offset by 220 ms. The large ring expands 2.2x over 1100 ms;
the smaller expands 1.6x over 750 ms. Opacities start at 0.8 and 0.65 respectively.

Both native paint transitions share one 1500 ms cycle. After two ripple pairs,
the native halo requests the next venue in the middle of its invisible gap:
180 ms after the leading ring's fade duration, leaving 220 ms before the next
outward transition. The first venue swap is at 2820 ms after halo mount; later
swaps are 3000 ms apart. The native marker no longer runs a separate venue timer
for Now/Today. Future gray venues retain their three-second rotation and static
ring. The view-rendered equivalent uses the same pair cadence. Reduced motion,
selected markers, inactive/compact markers and unmount cancel animation work.

Equivalent coordinate arrays/parent renders retain the exact ShapeSource object
and CircleLayer paint objects, preventing redundant native transition targets.
Only the halo owns pulse state. Venue changes still invalidate one annotation
bitmap; individual ripple phases do not. Native tap delivery, layer hit targets,
data/cache/auth and the automatic startup stopwatch are unchanged.

Actual-component fake-clock regressions cover both native layers, delayed inner
wave, no venue changes during outward transitions, one bitmap capture per venue
change, inactive pause/resume with a fresh pair count, stable paint objects and
reduced motion. They verify target state/timing, not optical native completion.

The rendered comparison obtains native paint props from actual accepted/candidate
HybridMapHalo components and renders actual RN markers over light/dark fixtures.
Both waves are visible at 560 ms, and alignment, spacing, palette and surrounding
pills were independently reviewed. An animated SVG bridge preview is retained
under ignored artifacts. Native Mapbox playback is not visually verified; the
reported phone interruption has not been independently reproduced on a device.

Published on iOS Production runtime 1.1.20 from the exact accepted live baseline
e382ad816f81ca02640b0e665b06b89215b48bf8. Release source
d6c11f96abacc39fc068c2444721710790d6305a, group
649f73b4-e93f-42cf-8185-89fa58cf38ca, update
01a1e153-caa6-79ec-8c60-fb26b6cb78c1. View/list independently verify source,
platform, runtime and newest iOS update. Clean export: 2579 modules, 112 final
EAS assets. Release validation: 257 tests passed across 33 suites, two existing
explicit skips (opt-in benchmark and independently reproduced stale cache-key
assertion), TypeScript passes, lint zero errors and existing 226 warnings.
Native/auth/social/Mapbox preflights passed. No other OTA target was changed.
The device must still adopt this update and verify the actual animation.
