# Android marker rebuild probe - 2026-05-18

## Question

The visible issue after closing an Android callout looked like more than normal category carousel cycling. The marker/tree appeared to shrink, disappear, or reappear slightly offset.

## Important correction

On the tested branch, Android was not using the native `ShapeSource` cluster layer path:

- `USE_ANDROID_NATIVE_CLUSTER_MARKER_LAYERS = false`
- The active marker path was `MapboxGL.MarkerView` with the React `TreeMarker` component.

So the issue was investigated as a `MarkerView` / React marker render-state issue, not as a native layer feature-property issue.

## Probe evidence

Temporary logs were added on `codex/android-marker-rebuild-probe` and then removed before checkpointing.

For the tapped downtown `12 events / 7 specials` cluster, the probe showed:

- Marker key stayed stable: `cluster-...-0`
- Marker coordinate stayed stable: `-63.126948,46.235093`
- `androidMarkerTouchEpoch` stayed `0`
- The target marker did not disappear from the render set
- Event/special/venue counts stayed stable

The meaningful post-close state change was:

- At close start, `isSelected: true`
- After deferred teardown, `isSelected: false`

Because `TreeMarker` scaled selected markers from `1.0` to `1.2`, clearing selection after callout teardown caused the selected marker to shrink later on the visible map. With a bottom-centered `MarkerView` anchor, that shrink can look like the tree physically moves or reappears slightly offset, even though the map coordinate did not change.

## Fixes kept

1. `TreeMarker` memo comparison now includes `isActive`.

This was a real bug from the previous marker-animation pause work. `TreeMarker` received `isActive`, but `React.memo` ignored it, so existing marker children could miss animation pause/resume changes unless another prop also changed.

2. Android selected-marker scale is disabled.

Selected marker scale is still preserved for iOS. On Android, the marker remains at stable size when selected/unselected, preventing delayed shrink during callout close teardown.

3. Cluster render coordinates now use a shared helper.

This removes duplicate coordinate calculation and keeps the `MarkerView` path aligned with the probe logic.

## Tablet evidence

Before disabling Android selected-marker scale:

- Visual crop: `artifacts/marker-rebuild-probe-close-burst-20260518/selected-marker-crop-sheet.png`
- Logs: selected marker coordinate/key remained stable, but `isSelected` changed from `true` to `false` after teardown.

After disabling Android selected-marker scale:

- Visual crop: `artifacts/marker-rebuild-no-android-scale-close-burst-20260518/selected-marker-crop-sheet.png`
- The selected marker no longer has a size transition to perform on close teardown.
- Category badges still resume cycling later, which is expected normal marker behavior.

## Validation notes

- Tested on Samsung tablet over ADB serial `192.168.4.46:41931`.
- No app data was cleared.
- `com.craigb.gathr` was not uninstalled.
- No EAS build was run.
- Screenshots were captured with binary-safe `cmd /c` / `exec-out cat` paths.
- TypeScript/lint were not run in this pass.
