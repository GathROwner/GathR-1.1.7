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

## April 27 Marker Startup Experiment

Branch:

`codex/marker-startup-lightweight-experiment`

Metro/dev-client setup:

- Metro port: `8082`
- ADB serial: `R52T302EBZR`
- Package: `com.craigb.gathr`
- Hotspot reset date for test runs: `2026-04-26`

Measured runs:

| Run | Change under test | Key result |
| --- | --- | --- |
| `run12-hotspot-overlay-log-20260427` | checkpoint behavior with overlay projection logging | `T5b +11.8s`, `T5c +24.6s`, hotspot visible state about `+34.6s`; screenshot confirmed tooltip/ring |
| `run14-lightweight-freshmetro-20260427` | deferred rich marker children on fresh Metro | `T5b +10.6s`, `T5c +22.1s`, hotspot visible state about `+31.7s` |
| `run16-marker-subset-20260427` | 12 startup MarkerViews, full markers later | `T5b +10.8s`, `T5c +21.6s`, hotspot visible state about `+30.7s`, full markers about `+49.1s`, rich details about `+66.0s` |
| `run17-marker-subset-4-20260427` | 4 startup MarkerViews | similar hotspot timing to 12 markers; too sparse visually for little gain |
| `run19-no-cluster-markerviews-20260427` | MarkerView isolation disabled all cluster markers | overlay projection still around `+29.7s`; this argues MarkerView count is not the main remaining wall |
| `run20-immediate-clusters-ready-20260427` | immediate cluster-ready gate, 12 startup markers | loading overlay drops earlier, hotspot visible state about `+21.1s`, overlay projection about `+30.7s`; screenshot confirmed tooltip/ring |

Current conclusion:

- Keep the custom React Native marker design.
- Defer rich marker children during startup; this is a small but real win.
- A limited startup MarkerView subset does not create a drastic speedup by itself. A 12-marker startup subset is less visually disruptive than 4 and performs similarly.
- The bigger remaining delay is Mapbox projection/readiness and startup JS work around the hotspot overlay, not just the custom marker tree.
- A Mapbox-native cluster layer replacement is paused because it cannot safely reproduce the current marker/callout visual behavior without a larger redesign.

## April 27 Perfetto Findings

Artifacts:

- Trace: `artifacts/hotspot-tablet-run/run22-perfetto-hotspot-largebuffer-20260427/gathr-hotspot-run22-largebuffer-20260427.pftrace`
- Summary: `artifacts/hotspot-tablet-run/run22-perfetto-hotspot-largebuffer-20260427/perfetto-run22-summary.txt`
- Logcat: `artifacts/hotspot-tablet-run/run22-perfetto-hotspot-largebuffer-20260427/logcat-run22.txt`
- Secondary simpleperf run: `artifacts/hotspot-tablet-run/run24-simpleperf-hotspot-20260427/` (directional only; the flow was not a clean map startup because the dev launcher/login overlay interfered)

Key timing anchors from run22:

- `T5 first_render`: app `+11ms`, trace about `+19.6s`
- `T5b first_clusters`: app `+11755ms`, trace about `+31.3s`
- `T5c clusters_ready`: app `+23003ms`, trace about `+42.6s`
- hotspot overlay position ready: trace about `+52.6s`
- `T5d full_cluster_markers_enabled`: app `+42711ms`

Main trace finding:

- The JS thread (`mqt_v_js`) is the dominant wall: `66.7s` CPU in a `75.7s` trace.
- During `first_clusters -> clusters_ready`, JS used `11.24s` CPU in an `11.25s` wall window.
- During `clusters_ready -> overlay_ready`, JS used `10.04s` CPU in a `10.04s` wall window.
- `MapboxRenderThread` only used `0.92s` CPU across the whole trace, so native Mapbox rendering is not the main remaining bottleneck.
- A large React Native mount burst appears around trace `+44.1s`: `Choreographer#doFrame` about `1.74s`, `MountItemDispatcher::mountViews` about `1.70s`, `UPDATE_STATE numInstructions=595`, and `UPDATE_LAYOUT numInstructions=1171`.

Experiment added after this trace:

- `app/(tabs)/_layout.tsx`: switch tab screens back to lazy mounting so Events/Specials do not mount during the active Map startup.
- `app/_layout.tsx`: defer Android AdMob/WebView/ad-pool startup to `45s` and run it after interactions. iOS keeps the existing `2s` delay.
- `components/map/HotspotHighlight.tsx`: reduce `getPointInView` polling to `100ms` and stop polling once the first valid position is ready unless the hotspot camera animation is active.
- `components/ads/CompactCalloutAdWarmup.tsx`: defer Android compact callout ad warmup for `45s` after Map mount. Run27 showed this component still triggered `[AdPool] Loading 15 events ads...` and `[AdPool] Loading 15 specials ads...` during map startup even after the root AdMob delay.

Follow-up tablet run:

- `run27-cold-guest-tap-startup-20260427`: guest mode is not persisted across force-stop, so this run launched cold, tapped `Continue as Guest`, then measured map startup.
- Run27 timing after Map mount: `T5b first_clusters +4883ms`, hotspot visible initial about `+11609ms`, `T5c clusters_ready +11622ms`, overlay position ready about `+15684ms`, `T5d full_cluster_markers_enabled +24748ms`, `T5e rich_marker_details_enabled +39110ms`.
- Run27 screenshot `screen-07.png` confirmed the hotspot tooltip/ring rendered.
- `run28-cold-guesttap-adwarmup-deferred-20260427`: validated the compact callout ad warmup deferral. Early `[AdPool] Loading 15 events ads...` and `[AdPool] Loading 15 specials ads...` calls were gone from map startup.
- Run28 timing after Map mount: `T1 map_loaded +2509ms`, `T5b first_clusters +4504ms`, `startup_marker_subset_rendered +4506ms`, hotspot visible initial about `+10038ms`, `T5c clusters_ready +10049ms`, overlay position ready about `+12170ms`, `T5d full_cluster_markers_enabled +21114ms`, `T5e rich_marker_details_enabled +35192ms`.
- Run28 screenshot `screen-06.png` confirmed the hotspot tooltip/ring rendered.
- `run30-hotspot-alignment-offset-fix-20260427`: fixed hotspot ring alignment on Android. Run29 showed the ring below the cluster because `HotspotHighlight` added `mapViewLayout.absoluteY` to `getPointInView()` output, double-counting the tab header. The fix keeps the marker visual offset but no longer adds the MapView absolute window offset.
- Run30 timing after Map mount stayed in the same improved range: `T5b first_clusters +4985ms`, `T5c clusters_ready +10257ms`, overlay position ready about `+12313ms`, `T5d full_cluster_markers_enabled +21228ms`, `T5e rich_marker_details_enabled +35102ms`.
- Run30 screenshot `screen-06.png` confirmed the hotspot ring now surrounds the selected cluster instead of sitting below it.

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

## Mapbox-Layer Experiment Status

Status: paused.

The user does not want to give up the existing custom marker/callout behavior. The April 27 no-MarkerView isolation run also showed that removing cluster MarkerViews entirely did not move overlay projection below the roughly 30-second wall, so a Mapbox-native cluster layer rewrite is no longer the next best bet for this issue.

Historical plan kept here for reference:

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

- Original hypothesis: the initial React Native `MarkerView` commit was the likely tablet bottleneck.
- Current evidence: MarkerViews are not the main remaining blocker for the hotspot overlay timing.

Measurement targets:

- `T5b first_clusters`
- `T5c clusters_ready`
- hotspot visible initial
- screenshot-confirmed visible tooltip/ring
- cluster tap behavior after startup

Rollback:

- If interaction parity breaks or timing is not better, stay on the checkpointed `MarkerView` fix and abandon the experiment branch.
