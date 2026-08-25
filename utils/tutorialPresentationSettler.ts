export const createTutorialPresentationSettler = (
  onSettled: () => void,
  timeoutMs: number,
) => {
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    onSettled();
  };
  const timeout = setTimeout(settle, timeoutMs);

  return {
    animationComplete: (finished: boolean) => {
      if (finished) settle();
    },
    cancel: () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
    },
  };
};
