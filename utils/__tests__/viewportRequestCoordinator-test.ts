import {
  isLatestViewportRequest,
  reserveViewportRequestId,
  resetViewportRequestCoordinator,
} from '../viewportRequestCoordinator';

describe('viewport request coordinator', () => {
  beforeEach(resetViewportRequestCoordinator);

  it('makes older scheduled work stale as soon as newer work is reserved', () => {
    const delayedCameraRequest = reserveViewportRequestId();
    expect(isLatestViewportRequest(delayedCameraRequest)).toBe(true);

    const movementEndRequest = reserveViewportRequestId();
    expect(isLatestViewportRequest(delayedCameraRequest)).toBe(false);
    expect(isLatestViewportRequest(movementEndRequest)).toBe(true);
  });

  it('continues ordering after several debounce replacements', () => {
    const requests = Array.from({ length: 50 }, () => reserveViewportRequestId());

    expect(isLatestViewportRequest(requests[0])).toBe(false);
    expect(isLatestViewportRequest(requests[48])).toBe(false);
    expect(isLatestViewportRequest(requests[49])).toBe(true);
  });
});
