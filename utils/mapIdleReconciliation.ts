interface AndroidMapIdleReconciliationInput {
  hasCurrentCameraState: boolean;
  lastCameraChangeAt: number;
  lastSuccessfulReconcileCameraChangeAt: number;
}

export type MapCameraReconciliationSource =
  | 'map_idle'
  | 'movement_end'
  | 'hotspot_return'
  | 'recenter';

export const shouldUseNativeCameraReconciliation = ({
  platform,
  source,
  androidHotspotStartupActive,
}: {
  platform: string;
  source: MapCameraReconciliationSource;
  androidHotspotStartupActive: boolean;
}): boolean => {
  if (platform === 'android') {
    return !androidHotspotStartupActive;
  }

  // iOS camera-change events normally keep the cached viewport current. A
  // recenter is intentionally suppressed while it animates, so it needs one
  // native read after the camera settles.
  return source === 'recenter';
};

export const shouldReconcileAndroidMapIdle = ({
  hasCurrentCameraState,
  lastCameraChangeAt,
  lastSuccessfulReconcileCameraChangeAt,
}: AndroidMapIdleReconciliationInput): boolean =>
  !hasCurrentCameraState || lastCameraChangeAt > lastSuccessfulReconcileCameraChangeAt;

export const shouldRefreshBeaconProjection = ({
  bboxChanged,
  cameraMovedMeaningfully,
}: {
  bboxChanged: boolean;
  cameraMovedMeaningfully: boolean;
}): boolean => bboxChanged || cameraMovedMeaningfully;

export const shouldFetchReconciledViewport = ({
  bboxChanged,
  source,
  userGestureSeen,
  hasPreviousViewportBbox,
}: {
  bboxChanged: boolean;
  source: MapCameraReconciliationSource;
  userGestureSeen: boolean;
  hasPreviousViewportBbox: boolean;
}): boolean =>
  bboxChanged && (
    source === 'recenter' ||
    userGestureSeen ||
    hasPreviousViewportBbox
  );

export const shouldCompleteRecenterOnMapIdle = ({
  pending,
  elapsedMs,
  minimumElapsedMs,
}: {
  pending: boolean;
  elapsedMs: number;
  minimumElapsedMs: number;
}): boolean => pending && elapsedMs >= minimumElapsedMs;
