let requestSequence = 0;
let latestReservedRequestId = 0;

/** Reserve ordering at scheduling time, not timer-fire time. */
export const reserveViewportRequestId = (): number => {
  requestSequence += 1;
  latestReservedRequestId = requestSequence;
  return latestReservedRequestId;
};

export const isLatestViewportRequest = (requestId: number): boolean =>
  requestId === latestReservedRequestId;

export const resetViewportRequestCoordinator = (): void => {
  requestSequence = 0;
  latestReservedRequestId = 0;
};
