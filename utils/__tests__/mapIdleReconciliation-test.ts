import {
  shouldReconcileAndroidMapIdle,
  shouldRefreshBeaconProjection,
} from '../mapIdleReconciliation';

describe('map idle reconciliation', () => {
  it('reconciles until an initial native camera state exists', () => {
    expect(shouldReconcileAndroidMapIdle({
      hasCurrentCameraState: false,
      lastCameraChangeAt: 0,
      lastSuccessfulReconcileCameraChangeAt: 0,
    })).toBe(true);
  });

  it('skips duplicate idle callbacks for the same camera change', () => {
    expect(shouldReconcileAndroidMapIdle({
      hasCurrentCameraState: true,
      lastCameraChangeAt: 1200,
      lastSuccessfulReconcileCameraChangeAt: 1200,
    })).toBe(false);
  });

  it('reconciles the first idle after a newer camera change', () => {
    expect(shouldReconcileAndroidMapIdle({
      hasCurrentCameraState: true,
      lastCameraChangeAt: 1300,
      lastSuccessfulReconcileCameraChangeAt: 1200,
    })).toBe(true);
  });

  it('refreshes beacon projection only when camera geometry changed', () => {
    expect(shouldRefreshBeaconProjection({
      bboxChanged: false,
      cameraMovedMeaningfully: false,
    })).toBe(false);
    expect(shouldRefreshBeaconProjection({
      bboxChanged: true,
      cameraMovedMeaningfully: false,
    })).toBe(true);
    expect(shouldRefreshBeaconProjection({
      bboxChanged: false,
      cameraMovedMeaningfully: true,
    })).toBe(true);
  });
});
