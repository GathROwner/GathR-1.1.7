export type CalloutCloseRequestResult = boolean | void;

export const settleCalloutCloseAttempt = (
  result: CalloutCloseRequestResult,
  resetAttempt: () => void,
): boolean => {
  const accepted = result !== false;
  if (!accepted) {
    resetAttempt();
  }
  return accepted;
};
