# Preview callout stacking and release correction

Status: unpublished correction based on 2ec65461e8d5d8d8a360fb7b4d3c1041a2856615. No OTA, native build, channel, auth or data changes.

## Confirmed causes and correction

The newly added outer CalloutDismissSurface had no stacking priority. Its sibling dimOverlay has zIndex 1, so the child's existing zIndex could not lift the whole surface above that sibling. Give the outer surface zIndex 2/elevation 50. Keep content colors, backdrop opacity and the static iOS sheet layout unchanged.

Release previously waited for dragY.stopAnimation's native getValue callback before starting either terminal animation. There was no fallback if that callback was not delivered. Raw native gesture events also targeted the same Animated.Value used by spring/timing. React Native iOS RCTNativeAnimatedNodesManager.handleAnimatedEvent stops animations on the event driver's value node. These are confirmed code paths; lack of callback delivery on the reported phone itself is not proven without device logs.

The correction uses a separate positionY for held position and settling, leaving dragY exclusively for raw gesture updates. The terminal event's translation/velocity makes the close/snap decision immediately. Gate raw updates off and add the final delta once using native offset/flatten operations before animating positionY. Regrabs preserve the native held base; duplicate terminal events and stale completion cannot overwrite a newer gesture. A ref-only position listener supplies regrab decision thresholds; native motion never waits for it. Shell releases supply final dy too.

Scope: three runtime files (CalloutDismissSurface, EventCallout shell release argument, useCalloutPullDismiss), two regression test files and this handoff. Existing separate noncollapsable native hosts from the mount-crash correction remain intact. No camera/count/puck implementation changes. Preview account continuity and all four intended frontend features are retained.

## Validation

- New actual-installed-handler reproducer failed all five initial cases against the released base before correction: surface below backdrop, missing immediate END completion, and END/CANCEL/FAIL settlement ownership.
- Corrected focused native-handler/mount/hook set passed 23/23.
- Combined relevant lightbox, horizontal navigation, modal/tab touch layer, camera, puck/count, pull dismissal and actual handler checks passed 59/59 across 11 suites.
- Targeted ESLint completed with zero errors and 83 warnings (82 existing EventCallout warnings, one test native-bridge require warning).
- Independent read-only source/integration review approved with no blockers. Reviewer did not edit or run tests.
- A new test helper's inferred literal oldState type was then explicitly annotated State; final TypeScript and that test file are checked separately in the package receipt.

The real installed PanGestureHandler state routing and mounting are exercised. The native bridge and animation clock remain mocked. No claim of physical iOS paint, gesture arbitration or motion validation is made.

## Required physical Preview QA before any promotion

Only after separate approval to publish this candidate to iOS Preview: verify footer adoption, then open the reported multi-venue callout repeatedly. Confirm bright sheet/header/cards above dimmed map in expanded and minimized states. At scroll top drag down from hero, description and fixed shell: sheet follows continuously; short release springs smoothly to origin; longer pull/quick flick completes close; upward reversal, cancellation and regrab recover without sticking. Verify mid-list scrolling, horizontal selectors, image lightbox/buttons/tabs and accessibility close/Reduce Motion. Confirm cluster selection/close preserves camera, explicit recenter/zoom still work and puck plus offset count/leader remain visible and separately usable.

## Release/integration guard

Current Preview is still 2ec6546 / OTA 01a165ec-4cdd-7353-862d-2a86efff123b, group 2548d380-709e-4b78-802c-05ed598625f5, runtime 1.1.10/channel preview. Known-good rollback remains OTA 01a165de-ff11-7af5-abfc-e372cfe95ca3, group 7383234c-d760-4ee9-b1a2-3c3ee71b2577 (production-account continuity, not embedded staging-auth bundle).

Production remains 7411351ed7316f9690882daea6d844b2838cab41 / OTA 01a1658a-8032-7a60-92e4-eb5de6bb963f, runtime 1.1.20. Original production map candidate b2aa2acae7c457e0a907f1063d6c1d2d906f5cef is blocked and must not be promoted unchanged. Any future Production integration must preserve check-in/updater changes and include the mount and stacking/settle corrections plus physical QA. No publication is authorized in this step.
