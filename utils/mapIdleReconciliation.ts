interface AndroidMapIdleReconciliationInput {
  hasCurrentCameraState: boolean;
  lastCameraChangeAt: number;
  lastSuccessfulReconcileCameraChangeAt: number;
}

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
