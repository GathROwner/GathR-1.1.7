import {
  shouldReconcileAndroidMapIdle,
  shouldCompleteRecenterOnMapIdle,
  shouldFetchReconciledViewport,
  shouldRefreshBeaconProjection,
  shouldUseNativeCameraReconciliation,
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

  it('uses native reconciliation for iOS recenter without enabling it for ordinary iOS idles', () => {
    expect(shouldUseNativeCameraReconciliation({
      platform: 'ios',
      source: 'map_idle',
      androidHotspotStartupActive: false,
    })).toBe(false);
    expect(shouldUseNativeCameraReconciliation({
      platform: 'ios',
      source: 'recenter',
      androidHotspotStartupActive: false,
    })).toBe(true);
  });

  it('preserves Android reconciliation except during hotspot startup', () => {
    expect(shouldUseNativeCameraReconciliation({
      platform: 'android',
      source: 'map_idle',
      androidHotspotStartupActive: false,
    })).toBe(true);
    expect(shouldUseNativeCameraReconciliation({
      platform: 'android',
      source: 'recenter',
      androidHotspotStartupActive: true,
    })).toBe(false);
  });

  it('forces a changed recenter viewport through even before a prior gesture', () => {
    expect(shouldFetchReconciledViewport({
      bboxChanged: true,
      source: 'recenter',
      userGestureSeen: false,
      hasPreviousViewportBbox: false,
    })).toBe(true);
    expect(shouldFetchReconciledViewport({
      bboxChanged: true,
      source: 'map_idle',
      userGestureSeen: false,
      hasPreviousViewportBbox: false,
    })).toBe(false);
  });

  it('does not let an early stale idle consume a pending recenter refresh', () => {
    expect(shouldCompleteRecenterOnMapIdle({
      pending: true,
      elapsedMs: 100,
      minimumElapsedMs: 350,
    })).toBe(false);
    expect(shouldCompleteRecenterOnMapIdle({
      pending: true,
      elapsedMs: 500,
      minimumElapsedMs: 350,
    })).toBe(true);
  });
});
