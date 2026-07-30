# Android startup timing - trending auto-open gate

Date: 2026-07-30
Device: Android emulator `emulator-5554`, package `com.craigb.gathr`
Installed binary observed by `dumpsys package`: `versionName=1.1.7`, `versionCode=8`

## Terminology

"Full saturation" is not a precise startup metric. For this work, use:

- time to first app surface: Android `ActivityTaskManager: Displayed`
- time to map populated: first screenshot where map tiles, nav, and markers are visible
- time to usable map: populated map plus touchable controls/markers

## App change

- `hooks/useTrendingAutoOpen.ts`
  - Adds a startup readiness gate for the cold-start Trending lightbox.
  - Keeps manual Trending pill behavior unchanged.
  - Delays Android auto-open by 3000 ms once startup is ready.
- `app/(tabs)/map.tsx`
  - Passes Android startup readiness to the Trending hook.
  - Readiness waits for loading to finish, clusters to be interaction-ready, and initial Android marker staging to complete.

The parser/backend was not changed.

## OTA updates published

The repo config is `version: "1.1.10"` / runtime `1.1.10`, but the emulator had a `1.1.7` preview-style binary installed. Because the app uses `runtimeVersion: { policy: "appVersion" }`, updates were published for both runtimes.

- `preview`, runtime `1.1.10`: update group `9ffb7bf6-2e73-4eeb-82cd-fe3a0f3e0ac0`
- `development`, runtime `1.1.10`: update group `28214f09-9de5-46cc-a11e-446e9bc2439c`
- `preview`, runtime `1.1.7`: update group `9aa15e92-5368-44a1-b719-d6b87060d989`
- `development`, runtime `1.1.7`: update group `3621805f-eed9-4a86-9083-0c00ea442949`

`app.config.js` was restored to `1.1.10` after the temporary `1.1.7` update packaging pass.

## Baseline measurement before gate

Artifact directory:
`C:\Users\craig\Dev\gathr-apps-script\firebase\artifacts\android-startup-perf-clean-2026-07-30T13-31-52Z`

Observed:

- Activity displayed: `+1m5s268ms`
- 90-second screenshot: still blank/splash blue
- Map populated: after 90 seconds, by about 154 seconds from host start
- Gfxinfo: 126 rendered frames, 126 janky frames, P50 150 ms, P90 400 ms, P95 700 ms, P99 4950 ms
- Logcat repeatedly showed `RNMBXCamera` / `RNMBXMarkerViewContent` Fabric soft exceptions and skipped-frame bursts.

## Post-gate measurement

Artifact directory:
`C:\Users\craig\Dev\gathr-apps-script\firebase\artifacts\android-startup-after-trending-gate-2026-07-30T14-00-04Z`

Observed:

- `am start` returned after about 4.2 seconds.
- 5-second screenshot: launcher still visible.
- 15, 30, 45, and 60-second screenshots: GathR splash.
- 90-second screenshot: blank blue app surface.
- 120-second screenshot: map tiles and markers visible.
- Activity displayed: `+1m12s386ms`
- Gfxinfo: 103 rendered frames, 103 janky frames, P50 200 ms, P90 750 ms, P95 1800 ms, P99 2750 ms
- Logcat again showed:
  - `ReactNoCrashSoftException` for `RNMBXCamera`
  - `ReactNoCrashSoftException` for `RNMBXMarkerViewContent`
  - a `Skipped 1077 frames` burst in the app process
  - Mapbox/Cronet monitor contention of about 5.7 seconds

No `TrendingAutoOpenTiming` lines surfaced in release logcat. That means logcat could not prove the exact OTA branch was running. It may be release logging behavior, stored Trending preference/cooldown, or a channel pull limitation. The visible startup timing remains valid for the installed emulator state.

## Current conclusion

The Trending auto-open gate is still the right policy: automatic modal/lightbox work should not compete with the initial Android map startup. However, it is not sufficient by itself.

The remaining cold-start delay is dominated by app/map startup readiness, Mapbox camera/marker mounting, and emulator/system jank. The next tuning pass should target startup work before the map becomes visible, not the area-event parser and not a broad visual overhaul.
