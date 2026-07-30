# Android startup timing - trending auto-open gate

Date: 2026-07-30
Device: Android emulator `emulator-5554`, package `com.craigb.gathr`
Installed binary observed by `dumpsys package`: `versionName=1.1.7`, `versionCode=8`

Current branch: `codex/android-startup-trending-gate`

## Critical OTA shell finding

The installed `1.1.7` preview APK cannot consume OTA updates. Its embedded
Android manifest has:

```text
expo.modules.updates.ENABLED=false
```

Its embedded `assets/app.config` also lacks `updates.url` and `runtimeVersion`.
That explains why preview OTA publishes did not change the emulator behavior:
the permission prompt and missing diagnostic markers were coming from the
embedded May `1.1.7` bundle, not from the newest OTA.

The later `1.1.10` preview APK created from commit `ab10aad` does have Expo
Updates enabled on channel `preview`, but it was an old-architecture native
experiment. It is not a valid production-equivalent startup target because the
map reached `0/0` event/special data in testing.

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

The repo config is `version: "1.1.10"` / runtime `1.1.10`, but the emulator had
a `1.1.7` preview-style binary installed. Because the app uses
`runtimeVersion: { policy: "appVersion" }`, updates were published for both
runtimes during the initial pass.

- `preview`, runtime `1.1.10`: update group `9ffb7bf6-2e73-4eeb-82cd-fe3a0f3e0ac0`
- `development`, runtime `1.1.10`: update group `28214f09-9de5-46cc-a11e-446e9bc2439c`
- `preview`, runtime `1.1.7`: update group `9aa15e92-5368-44a1-b719-d6b87060d989`
- `development`, runtime `1.1.7`: update group `3621805f-eed9-4a86-9083-0c00ea442949`
- `preview`, runtime `1.1.7`: update group `8e15e98f-281d-41f2-8ef9-b89ccf9cbfce`
- `preview`, runtime `1.1.10`: update group `86ae96c5-9cf2-4807-8cbe-9e98dc8c3917`
- `preview`, runtime `1.1.7`, diagnostics: update group `bd838eae-4290-433d-bd70-468299561c36`
- `preview`, runtime `1.1.7`, diagnostics with fingerprint skipped: update group `dbab1d14-4d21-49bb-9cb9-e3aa9385a667`

`app.config.js` was restored to `1.1.10` after the temporary `1.1.7` update packaging pass.

These OTA groups were published successfully, but the installed `1.1.7` shell
ignores them because Expo Updates is disabled in that APK. Do not treat those
emulator runs as proof that the latest JS bundle was executing.

## Before/after startup chart

| Run | Shell / code path | Activity displayed | First useful map | Full event/special data | Permission prompt | Jank | Interpretation |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| Baseline clean | Installed `1.1.7` embedded bundle, before trending gate | `+1m5s268ms` | after 90s, about 154s | about 154s | Present in related runs | 126/126 frames janky | Slow before our changes; Mapbox/native startup dominated. |
| Trending gate | OTA published but shell likely still embedded `1.1.7` | `+1m12s386ms` | 120s | 120s | Not disproven | 103/103 frames janky | Gate is sound policy, but measurement cannot prove the new JS ran. |
| Cache preserve | JS change intended to preserve `events-minimal` cache | `+1m5s917ms` | 106s | 152.6s | Present | 103/103 frames janky | Cache work did not materially fix cold start under this shell. |
| Android permission gate | JS changed to avoid startup permission request | not clean; ANR by 150s | 120s with `0/0` | not reached cleanly | Still present | 98/98 frames janky | Prompt still appeared because stale embedded JS was running. |
| No-auto-permission OTA attempt | Existing `1.1.7` shell after OTA publishes | `am start -W` distorted | 120s | 150s | Still present | 143/143 frames janky | Confirms OTA was not applied to this shell. |
| Old-arch preview APK | Existing `1.1.10` old-architecture shell, commit `ab10aad` | `+1m17s428ms` | 120s | not valid, stayed `0/0` | Absent | 117/118 frames janky | OTA-capable, but native architecture differs and data behavior is broken. |
| Existing `1.1.7` preview shell | Reinstalled May preview APK | `+34s131ms` | 60s with `0/0` | 120s | Present | 214/215 frames janky | Data eventually works, but this shell cannot pull OTA. |
| Diagnostic OTA attempts | `1.1.7` runtime diagnostic OTA groups | `+1m10s` to `+1m25s` | inconsistent | inconsistent | Present | high, plus ANR in one run | No diagnostic markers; shell ignored OTA. |

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

The Trending auto-open gate is still the right policy: automatic modal/lightbox
work should not compete with the initial Android map startup. However, the
emulator has not yet run the latest OTA-capable, production-equivalent JS/native
combination, so no speedup claim should be made from the emulator timings above.

The immediate blocker is not EAS Update publishing; it is the installed shell.
The current valid choices are:

1. Use an existing OTA-capable shell only for a narrow OTA smoke test if its
   native behavior is acceptable.
2. Keep parser/backend untouched and continue source-level startup tuning.
3. When explicitly approved, create one production-equivalent preview shell
   from the current new-architecture source so future JS changes can be tested
   by OTA as intended.

The remaining cold-start delay appears dominated by native app/map startup,
Mapbox camera/marker mounting, stale permission-prompt behavior from the old
bundle, and emulator/system jank. The next tuning pass should target startup
work before the map becomes visible, not the area-event parser and not a broad
visual overhaul.
