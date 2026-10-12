# Callout drag feedback and interruptible navigation — 2026-10-12

## Scope and baseline

Craig authorized the read-only recommendations: finger-following horizontal movement, more forgiving horizontal recognition, distance/velocity release decisions, and interruptible settling. Source baseline: `6b7ae96d43e9866d2734f74bc9e24697cd56eff2`, branch `codex/frontend-adjudicator-20261011`. Recovery branch: `codex/callout-drag-baseline-20261012`.

Current iOS Preview was independently read as group `1d6419ce-f29d-4362-b51f-1d3aa18f4909`, iOS update `01a13038-c3b9-71fb-9469-82164e74b85d`, runtime `1.1.10`, commit `20059d3c40163842769c7e5d42e8e85da8249a1b`. The release must be assembled on that commit, preserving accepted intervening changes.

## Behavior

- The visible list follows native horizontal pan translation without a per-frame JavaScript listener. Selector and tabs stay fixed; content is clipped inside its existing container. The adjacent page is not pre-mounted beside the dragged list.
- Horizontal activation is 12 points; initial vertical failure tolerance is 22 points. Release accepts a 48-point horizontal drag, or a 16-point minimum flick at 650 points/second, with horizontal direction and axis checks. Native recognition must reach ACTIVE; failed gestures never navigate.
- Accepted releases slide out over 150 ms and the committed destination springs into place. Short/cancelled drags settle back. Reduce Motion skips the transition animation.
- A fresh gesture interrupts settling without the old timed input lock. Accepted navigation advances a synchronous cursor; generation checks discard stale animation completions. Pending React commits cannot reset an already-started second gesture.
- Populated Events/Specials pages still loop across venues in selector order, skipping empty lists. Venue Info remains tap-only. Explicit tab/venue taps and disabled/unmounted callouts cancel pending navigation.
- Swipe navigation avoids competing LayoutAnimation, retaining direct-tap layout animation and existing interaction tracking/haptics. The previously fixed progress strip remains non-interactive.

## Native visual verification

Rendered on the existing Android s24 development client (`emulator-5554`, 1080×2400, density 3), using the real EventCallout component inside a temporary native Modal on the Events screen. Two local fixture venues each contain two Events and two Specials. The fixture uses existing loaded image data and local IDs. No map was mounted, manipulated, or tested. No backend fixture writes or social actions were performed. The temporary Events insertion was restored byte-for-byte, and the fixture/probe is absent from the shipped module graph.

These are genuine framebuffer PNGs, independently inspected before release; paired XML files record settled native UI where available. Fixture text is retained as `.tsx.txt` for reproduction only. A 40-point right inset avoids Android's OS back gesture so the callout's own right progress strip can be tested.

| Evidence | Observed result |
| --- | --- |
| `01-native-mid-drag.png` | A Specials visibly pulled left during a six-second held native drag; selector/tabs remain stationary and the content clips cleanly. |
| `02-native-next-venue-events.png` | The same drag settles on B Events. |
| `03-native-diagonal-specials.png` | B Events → B Specials with 35 points of vertical drift; previously the 32-point release cap rejected this drift. |
| `04-native-vertical-scroll.png` | A Specials scrolls vertically, with the right progress strip visible. |
| `05-native-progress-edge-next-venue.png` | Swipe beginning on that strip (native x948) successfully selects B Events and resets scroll to the top. |
| `06-native-first-page.png`, `07-native-wrap-to-last-page.png` | Reverse swipe from A Events wraps to B Specials. |
| `08-native-info-tapped.png`, `09-native-info-swipe-stays-put.png` | Tapping Venue Info opens B Info; horizontal swiping leaves that selection unchanged. |

The final entry-interruption refinement is present in the mid-drag evidence. The final explicit destination-venue assignment is present in evidence 04–09. It does not alter visual styling.

## Checks and limits

Four focused suites pass, 31 tests: swipe navigation, interruptible transition hook, venue selection, and interaction safety. Tests cover interrupted/late completions, rapid second releases before React commits, reversal, tap override, disabling/unmount, cancellation/short drag, velocity acceptance, Reduce Motion, sparse lists, and looping.

Short scripted Android flicks (140 pixels over 70 or 160 ms) were delivered as BEGAN → FAILED, with zero reported velocity and no ACTIVE state. A longer scripted drag reached ACTIVE/END but also reported zero velocity. Therefore emulator injection did not verify real flick recognition. Velocity decisions are unit-tested; natural iPhone flick feel, real-device performance, and iOS OTA adoption remain unverified. Native screenshots prove shared rendered behavior, not iOS adoption. No race condition or JS-thread performance diagnosis is claimed from these observations.

Release validation and publication readback are recorded separately after the clean candidate checks.
