import {
  isLatestReservedViewportRequest,
  isLatestStartedViewportRequest,
  markViewportRequestStarted,
  reserveViewportRequestId,
  resetViewportRequestCoordinator,
} from '../viewportRequestCoordinator';

describe('viewport request coordinator', () => {
  beforeEach(resetViewportRequestCoordinator);

  it('orders scheduled work without invalidating an in-flight fetch', () => {
    const activeRequest = reserveViewportRequestId();
    expect(markViewportRequestStarted(activeRequest)).toBe(true);
    expect(isLatestStartedViewportRequest(activeRequest)).toBe(true);

    const delayedReplacement = reserveViewportRequestId();
    expect(isLatestReservedViewportRequest(activeRequest)).toBe(false);
    expect(isLatestReservedViewportRequest(delayedReplacement)).toBe(true);
    expect(isLatestStartedViewportRequest(activeRequest)).toBe(true);

    expect(markViewportRequestStarted(delayedReplacement)).toBe(true);
    expect(isLatestStartedViewportRequest(activeRequest)).toBe(false);
    expect(isLatestStartedViewportRequest(delayedReplacement)).toBe(true);
  });

  it('continues scheduled ordering after several debounce replacements', () => {
    const requests = Array.from({ length: 50 }, () => reserveViewportRequestId());

    expect(isLatestReservedViewportRequest(requests[0])).toBe(false);
    expect(isLatestReservedViewportRequest(requests[48])).toBe(false);
    expect(isLatestReservedViewportRequest(requests[49])).toBe(true);
  });

  it('rejects an older delayed request after newer work has started', () => {
    const delayedRequest = reserveViewportRequestId();
    const immediateRequest = reserveViewportRequestId();

    expect(markViewportRequestStarted(immediateRequest)).toBe(true);
    expect(markViewportRequestStarted(delayedRequest)).toBe(false);
    expect(isLatestStartedViewportRequest(immediateRequest)).toBe(true);
  });

  it('resets both scheduled and started generations', () => {
    const firstRequest = reserveViewportRequestId();
    markViewportRequestStarted(firstRequest);

    resetViewportRequestCoordinator();

    const afterReset = reserveViewportRequestId();
    expect(afterReset).toBe(1);
    expect(markViewportRequestStarted(afterReset)).toBe(true);
    expect(isLatestReservedViewportRequest(afterReset)).toBe(true);
    expect(isLatestStartedViewportRequest(afterReset)).toBe(true);
  });
});
