# Hybrid pulse visibility

Craig requested faster, darker green/yellow pulses on the new map layer, using
Current as the visibility reference. The existing layer is named Hybrid in code.

The native halo and view-rendered equivalent share one palette/cadence definition:
green #188038, yellow #C99700, initial opacity 0.8, 1000 ms outward transition,
250 ms pause and 40 ms reset. The native cycle is 1290 ms rather than 2640 ms;
its outward transition was previously 1600 ms and initial opacity 0.45. Radius,
stroke width and expansion scale remain unchanged. The future gray, reduced
motion and inactive static states retain their existing behavior. Native paint
transitions continue to animate independently of the annotation bitmap; no new
per-frame snapshot work is introduced. Venue rotation, tap delivery and the
automatic first-fetch stopwatch remain unchanged.

The comparison renders actual React Native marker components and obtains the
actual HybridMapHalo collapsed/expanded native paint props. An SVG bridge shows
these values over light/dark fixture map surfaces, frozen one-quarter through
the outward sweep. The fixture radius is the measured photo-ring radius
(42.3 / 2 logical points), rather than the inner photo radius. The old and new
marker alignment, spacing, pills and ring extent were independently reviewed.
The new pulse is visibly darker and stronger on both surfaces. A self-contained
animated browser preview and raw paint values remain under ignored artifacts.
This verifies presentation through a bridge; native Mapbox animation on an
iPhone has not been observed. No native map was manipulated for this change.

Relevant redraw, tap contract, clustering and startup-recorder regressions:
38 tests passed in six suites. TypeScript and lint release checks are retained
with the publication receipt. No native/configuration or event-data changes.
