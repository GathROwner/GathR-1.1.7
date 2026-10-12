# Callout right-edge swipe interception - 12 October 2026

Craig reported that multi-venue list swipes still work from the middle or opposite side, but intermittently fail when started on the interest-pill side of the screen.

## Baseline and fix

- Accepted source baseline: `e5f106cd1875773ff898967cfcbeef11d98f71fa`, branch `codex/frontend-adjudicator-20261011`.
- Reversible baseline branch: `codex/callout-swipe-regression-baseline-20261012`.
- Exact live iOS Preview baseline: `d441b76cd803d0202e6de8e0f8ef07219189b063`, group `deb66eee-b993-42dc-be4b-7a870b2ced41`, iOS update `01a1300c-68f9-7480-85d3-742669f59e3d`, runtime 1.1.10.
- Original looping callout implementation remains present in both source and live release. There was no lost swipe handler.

The callout's full-height, three-point decorative scroll-progress container sits above the horizontal gesture handler at the right edge. Its default touch handling intercepts gestures beginning on that strip. It now uses `pointerEvents="none"`, allowing those touches to reach the list gesture handler underneath. The bar remains visible and vertical scrolling remains enabled. No thresholds, browse ordering, lightbox behavior, interest-pill handlers, or layout were changed.

Static review also confirms the actual map callout uses a native over-full-screen modal and the ancillary interest controls are disabled while it is open. This isolated reproduction identifies a callout-local blocker; it is not end-to-end proof of every possible iPhone edge gesture.

## Controlled native evidence

Actual EventCallout rendered in a temporary Events-screen native modal on the existing s24 Android debug client, `com.craigb.gathr` 1.1.10 (13), with Metro serving the source checkout. Two fixture venues each have two Events and two Specials. [Fixture source](CalloutSwipeFixture.tsx.txt) uses local synthetic IDs and cloned media; no fixture records were written to the backend.

The fixture has a temporary 40-point right margin. This moves the callout's progress strip 120 physical pixels inward from Android's system-back gesture edge, separating native OS interception from component interception. The framebuffer is 1080 x 2400 and the inset callout ends at x960. The strip occupies x942-951. Before and after swipes use the same x948,y1600 to x300,y1600 path over 400 ms, after a vertical scroll makes the progress strip visible. Each capture follows a settling interval and native hierarchy readback.

| Evidence | Result |
| --- | --- |
| [10 original edge swipe](10-inset-baseline-edge.png) and matching XML | With default progress-strip touch handling, the right-edge swipe leaves A Specials selected. |
| [11 fixed, strip visible](11-inset-fixed-progress.png) | Same selected A Specials page, with the scroll-progress strip visible before the controlled fixed swipe. |
| [12 same edge swipe after fix](12-inset-fixed-edge.png) and matching XML | Identical swipe changes to B Events. Selected venue and active tab agree with the content; the new list starts at the top. |
| [13 reverse](13-fixed-reverse.png) | Swipe right returns from B Events to A Specials. |
| [14 next Specials](14-fixed-b-specials.png) | Continue through B Events to B Specials. |
| [15 forward wrap](15-fixed-forward-wrap.png) | B Specials wraps to A Events. |
| [16 reverse wrap](16-fixed-reverse-wrap.png) | A Events wraps back to B Specials. |
| [17 vertical scroll](17-fixed-vertical.png) | Vertical scrolling moves the list, preserves B Specials, and renders the progress strip. |

All retained screenshots were independently reviewed for correct selection, content, alignment, spacing, and unchanged callout appearance. Early exploratory captures from the physical Android screen edge were excluded because Android's back gesture also intercepted those paths.

The temporary Events import and fixture render were removed by restoring the exact saved file. `git diff -- app/(tabs)/events.tsx` is empty. The fixture is retained as text only and is not part of the bundle.

No actual map screen was mounted or manipulated during these checks. No map gestures, cluster taps, backend writes, calendar writes, social actions, or external links were tested. No APK or native build was created or installed. These checks prove the shared component behavior on Android; iPhone gesture feel and adoption remain pending Craig's compatible Preview device check.

## Validation and release

Baseline focused tests passed: three suites / 20 tests covering browse sequence, venue selection, and callout interaction safety. Final clean-release checks and publication metadata will be recorded after candidate validation.
