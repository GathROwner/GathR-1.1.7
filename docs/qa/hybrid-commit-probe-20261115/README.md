# Unreleased candidate: commit the reset before restarting

Craig's Profile screenshot confirms iOS Production 1.1.20 build 79 adopted
OTA 01a1e16a. He reports that it remains janky and explicitly accepts the current
quickness. The screenshot documents adoption, not the motion failure. It contains
personal Profile information and is not copied into this repository.

The current callback chain schedules reset=false and then restart=true 40 ms
later without waiting for React to commit the reset. A targeted component probe
simulated an 80 ms React batching/commit window spanning those callbacks. It
retained the exact outward paint object, radius 40.59, without a collapsed native
target. PROBE.log passes because it asserts that undesirable baseline behavior.
This is a React batching model, not a recording of an 80 ms iPhone CPU stall.

The candidate starts the next 40 ms timer from an effect that runs after the
collapsed state commits. The permanent regression checks that the same simulated
batch now produces radius 18.45 with zero transition duration, holds it for 39 ms,
and only then requests the next outward wave at 40 ms. Timer cleanup and pause
pair-count reset remain explicit. Regular-frame tests now advance in 10 ms commits
instead of batching several seconds into one act. The busy-window regression
deliberately retains the coalesced callback case.

Wave duration, delay, scales, colors and opacity in utils/hybridPulse.ts are
byte-for-byte unchanged. Image readiness, snapshot barriers, photo callbacks,
tap delivery and native configuration are unchanged. Focused regressions pass
32 tests across three suites. TypeScript/lint checks are retained in ignored
artifacts. This change has not been exported, published or tested on an iPhone.

The component counterexample does not establish the cause of Craig's remaining
native visual issue. Publication is held pending a short recording showing the
actual jump across venue changes. The next diagnostic needs to distinguish a
skipped wave reset from a photo/snapshot handoff or native paint interruption.
No native map interaction was performed. Current published OTA remains 01a1e16a.
