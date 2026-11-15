# Recording review and ordered native reset

Craig supplied a 13.436-second HEVC screen recording, 1206x2622, about 60 fps,
after confirming adoption of iOS Production OTA 01a1e16a. The recording shows an
abrupt halo change around 4.1-4.2 seconds while the Montana's photo remains on
screen. The photo transition near 2.57 seconds is separately visible. Photo
loading alone therefore does not explain every observed skip. The cropped sheets
were independently viewed. Their timestamps are approximate FPS-normalized
positions, not native event timestamps. The full recording and full-map frames
remain local; only small public-venue crops excluding the blue location dot and
phone/Profile information are retained here.

The earlier e35d07e candidate addressed skipped React reset commits. The video
also warrants removing ambiguity between transition configuration and paint
targets: the published code changes duration and radius/opacity in the same
update. The final candidate commits four explicit phases:

1. Outward: expand and fade using prepared transition settings.
2. Disarmed: retain the invisible expanded targets, turn transition durations off.
3. Collapsed: return to the base radius/opacity with transitions already off.
4. Armed: configure the next outward durations/delay without changing targets.

Each next stage is scheduled after the preceding React commit. It does not rely
on native dictionary/property application order or on two state changes surviving
a single React batch. This avoids changing a paint target at the same time as
its transition options. The exact native mechanism behind the recorded artifact
has not been instrumented; this is an evidence-guided repair, not a claim that
the recording proves a particular Mapbox implementation defect.

All values in utils/hybridPulse.ts are byte-identical to the user's accepted
pace: 1100/750 ms wave durations, 150 ms trailing delay, existing scales/colors
and opacity. The three 40 ms reset stages fit in the existing 400 ms quiet
budget, preserving the intended 1500 ms repeat interval. The first start after
activation now primes and arms in 80 ms rather than 40 ms; the first scheduled
venue handoff is correspondingly 40 ms later. No photo/snapshot guards, tap
delivery, geometry, auth/native configuration or startup recorder were changed.

The regression passes against the candidate and fails on untouched published
d54228d at the expected nonzero-transition reset assertion. That temporary test
file was restored exactly and the release checkout verified clean. A simulated
batched callback window verifies disarm, collapse and arm as distinct commits.
32 focused redraw/tap regressions pass. TypeScript passes; lint has zero errors
and the existing 226 warnings.

The comparison renders actual RN markers and actual native paint endpoints
through an SVG bridge, independently reviewed on light/dark fixture backgrounds.
Its appearance/endpoints match the accepted version. This does not verify native
motion after the repair; a subsequent iPhone comparison remains necessary.

API references: [RNMapbox CircleLayer](https://rnmapbox.github.io/docs/components/CircleLayer)
documents separate radius/stroke transition properties and millisecond timing;
[Mapbox transitions](https://docs.mapbox.com/style-spec/reference/transition/)
documents property-specific transition options. These explain the API contract,
not the cause of the user's recorded artifact.

Published on iOS Production runtime 1.1.20 from exact live d54228d. Release
source d89cbc2bf7114e3042939c141478e677bf1c8926, group
6086fae0-5b8d-4f17-b772-85d1f40f6996, update
01a1e186-9f7c-71db-bc5f-74b4cb01f6e2. Independent view/list readbacks confirm
platform, runtime, source and newest iOS update. Clean export: 2579 modules,
112 final EAS assets. Release validation passed 260 tests across 33 suites, with
two explicit existing skips (opt-in benchmark and independently reproduced stale
cache-key assertion). TypeScript passed; lint zero errors/226 existing warnings.
Native/auth/social/Mapbox preflights passed. No other OTA target was changed.
The separate e35d07e candidate was incorporated into the final staged repair,
not published as an intermediate update. Native after-playback and adoption of
this new update remain unverified.
