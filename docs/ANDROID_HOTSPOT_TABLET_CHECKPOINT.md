# Android Hotspot Tablet Checkpoint

Updated on April 26, 2026 for the SDK 54 upgrade workspace at `C:\Windows\System32\GathR-Project\GathR-upgrade-sdk54`.

## Status

The Android daily hotspot fix is checkpointed before starting the deeper Mapbox-native cluster rendering experiment.

- App version: `1.0.9`
- Base branch: `codex/upgrade-sdk54-modernize`
- Source checkpoint commit: `416f60d` (`fix(map): speed up Android hotspot display`)
- Tablet used for validation: Samsung `SM_P610`, ADB serial `R52T302EBZR`
- Package: `com.craigb.gathr`

The tablet was unavailable for a fresh April 26 rerun because it needed to charge. This checkpoint is based on the last completed live tablet validation from April 25, 2026.

## Last Passing Tablet Run

Run folder:

`artifacts/hotspot-tablet-run/run9`

Key visual evidence:

`artifacts/hotspot-tablet-run/run9/run9_010_0066s.png`

Key Metro log:

`artifacts/hotspot-tablet-run/expo-8081.out.log`

Measured markers from session `ML-1777151876616`:

- `T1 map_loaded`: about `3.8s`
- `T1b map_idle`: about `4.1s`
- `T5b first_clusters`: about `10.9s`
- Hotspot trigger scheduled with Android delay `0ms`
- First trigger found the camera ref unavailable and entered retry
- `T5c clusters_ready`: about `24.5s`
- Hotspot visible initial state: about `34.2s`
- Screenshot confirmed tooltip, dismiss control, and orange highlight ring visible

Earlier before this fix, the same startup path could take roughly `131s` before the hotspot was marked shown.

## Source Changes In The Checkpoint

`hooks/useHotspotHighlight.ts`

- Shows the hotspot as soon as the camera animation starts instead of waiting for delayed post-zoom refinement.
- Uses an Android `0ms` trigger delay.
- Keeps the scheduled trigger stable so cluster re-renders do not continuously cancel it.
- Retries when the global camera ref is not ready instead of consuming the daily hotspot flag.
- Leaves the post-zoom cluster refinement as a follow-up, not a blocker for visibility.

`components/map/HotspotHighlight.tsx`

- Removes Android `PixelRatio` scaling from `getPointInView` results.
- Offsets Android coordinates by the measured MapView position.
- Raises overlay elevation so the hotspot renders above the loading/touch-blocking layer.

`app/(tabs)/map.tsx`

- Publishes map refs synchronously so the Android hotspot trigger can see them earlier.
- Skips viewport filtering/fetch work during programmatic camera animation frames.
- Reduces camera-loop log noise behind debug flags.
- Rounds viewport bbox cache keys to 3 decimals to reduce churn from tiny camera movement.

`utils/geoUtils.ts`

- Gates high-frequency viewport bbox logs behind a local debug flag.

## Validation Already Done

Completed locally:

- `npx tsc --noEmit --pretty false`
- `git diff --check` for the changed source files

Known unrelated validation issue:

- `npm run lint` / `expo lint` had a pre-existing lint failure in `components/map/EventCallout.tsx` around `Unexpected var, use let or const instead`.

## Next Live Tablet Pass

When the tablet is charged:

1. Confirm device:
   - `adb devices -l`
   - expected serial: `R52T302EBZR`
2. Reverse Metro:
   - `adb -s R52T302EBZR reverse tcp:8081 tcp:8081`
3. Reset the daily hotspot date in AsyncStorage SQLite:
   - force-stop app
   - copy `/data/data/com.craigb.gathr/databases/RKStorage` through `run-as`
   - set `state.hotspotLastShownDate` to the previous day
   - copy the DB back and remove stale journal/WAL/SHM files
4. Clear logcat and launch the dev client.
5. Capture screenshots every 5-7 seconds for at least 3 minutes.
6. Pass criteria:
   - hotspot tooltip and ring visible on the map
   - daily flag is not consumed before the camera ref is ready
   - hotspot visible under 45 seconds on the Samsung tablet
   - no startup crash or stuck permissions/dev-mode prompt

## Mapbox-Layer Experiment Plan

Start the experiment from the checkpoint branch, not directly from the main upgrade branch.

Planned experiment branch:

`codex/mapbox-cluster-layer-experiment`

Approach:

1. Add a feature flag for native Mapbox cluster layer rendering.
2. Convert visible cluster data into a GeoJSON `FeatureCollection`.
3. Render clusters through `ShapeSource` plus `CircleLayer` and `SymbolLayer`.
4. Preserve the current React Native `MarkerView` path behind a fallback flag.
5. Implement layer press handling and route it into the existing cluster tap/hotspot selection flow.
6. Keep visual parity good enough for timing validation first; refine badge styling after performance is proven.

Expected benefit:

- The likely bottleneck is the initial React Native `MarkerView` commit on the tablet.
- Moving clusters to Mapbox-native layers should reduce the `first_clusters -> clusters_ready` gap.

Measurement targets:

- `T5b first_clusters`
- `T5c clusters_ready`
- hotspot visible initial
- screenshot-confirmed visible tooltip/ring
- cluster tap behavior after startup

Rollback:

- If interaction parity breaks or timing is not better, stay on the checkpointed `MarkerView` fix and abandon the experiment branch.
