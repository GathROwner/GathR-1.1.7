let requestSequence = 0;
let latestReservedRequestId = 0;
let latestStartedRequestId = 0;

/** Reserve ordering at scheduling time, not timer-fire time. */
export const reserveViewportRequestId = (): number => {
  requestSequence += 1;
  latestReservedRequestId = requestSequence;
  return latestReservedRequestId;
};

export const isLatestReservedViewportRequest = (requestId: number): boolean =>
  requestId === latestReservedRequestId;

/**
 * Promote reserved work only when it actually starts. Merely scheduling a
 * replacement must not invalidate the request currently fetching data: the
 * scheduled callback can still be cancelled before it ever runs.
 */
export const markViewportRequestStarted = (requestId: number): boolean => {
  if (requestId < latestStartedRequestId) return false;
  latestStartedRequestId = requestId;
  return true;
};

export const isLatestStartedViewportRequest = (requestId: number): boolean =>
  requestId === latestStartedRequestId;

export const resetViewportRequestCoordinator = (): void => {
  requestSequence = 0;
  latestReservedRequestId = 0;
  latestStartedRequestId = 0;
};
