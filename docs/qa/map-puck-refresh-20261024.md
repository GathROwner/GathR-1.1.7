# Stationary puck clearance follow-up

Base:38d1650119a8939632041a22704cd499e49eba23, iOS Production runtime1.1.20, OTA01a16b64. Scope: renew collision-only location samples while stationary and use screen uncertainty for overview accuracy.

The prior collision snapshot expired after30s, while the normal iOS map watch required50m movement (`timeInterval` is Android only). It could therefore stop separating a stationary user's count and puck. The absolute75m accuracy cutoff also rejected80m accuracy at zoom8 even though its projected uncertainty was only0.38points.

## Correction

- Own an immutable collision-only sample; do not change map/check-in stores or the existing50m watcher.
- While focused, foreground and at overview zoom, renew after20s using a short cancellable Expo watch. Existing foreground permission is read before watch creation; no permission prompt. Complete on a recent usable fix, cancel after8s, retry failures after10s, deduplicate idle requests and remove subscriptions even when their setup resolves late.
- Cancel timers/read attempts in background, when disabled/zoomed close, or on unmount. Require a new read on resume and ignore old pending completions.
- Keep30s snapshot expiry, finite coordinates/accuracy validation, <=4 projected uncertainty points, the14pt core+uncertainty radius,4pt gap and56pt movement cap. Remove only the absolute75m gate. Invalid/unavailable location still cannot justify a distant or stale displacement.
- Keep camera generation guards, native location puck, counts/compact fallback, control avoidance, authentication, updater and check-in unchanged.

## Evidence

-51 tests in4 focused suites cover actual sampler+layout with a stationary movement sample unchanged for100s, renewal across multiple expiry periods, repeated camera/idle events, background cancellation and fresh resume, late old results, bounded retries, off-screen/close-zoom inactivity, native watch cleanup, revoked permission starting no watcher, cancellation during a permission read, and zoomed-out80/500m accuracy.
- Independent source review approved the final implementation and permission cleanup; no concrete blocker remained. It did not run native tests or publish.
- Browser fixture uses the actual sampler, layout hook and measurement component with simulated Expo GPS/AppState and a browser native-view adapter. At47s stationary, the original movement sample was47s old, collision sample6s old,2 refresh reads had completed and0 watches remained active. Count/dot remained separated by18.38points. At500m accuracy/zoom8, clearance was20.36points. This is not native iOS/Mapbox evidence or reproduction of the user's screenshots.
- During56s of simulated background state, reads remained at4 and active watches at0; resume performed one new read and restored clearance with a fresh collision sample while the unchanged movement sample was92s old. Repeated camera changes with delayed projections followed by a separated count left no stale offset.

## Remaining native QA

Confirm the exact new OTA footer after authorized release. Stay stationary on the zoomed-out map for more than a minute, then background/resume and pan/zoom repeatedly. Both puck and count should remain readable with small clearance and no stale leader. Check-in physical confirmation remains separately open. Native Yoga/MarkerView dimensions and independent Expo/native-puck provider timing are not proven by simulation. No native bridge, puck replacement, native build, backend/parser/data change or blocked CDN request is part of this correction.
