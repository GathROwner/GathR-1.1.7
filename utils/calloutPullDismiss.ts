/** Distances are React Native dp; gesture-handler velocities are dp/second. */
export const isCalloutContentAtTop = (scrollY: number): boolean =>
  Number.isFinite(scrollY) && scrollY <= 2;

export const shouldDismissCalloutPull = (
  distance: number, velocity: number, sheetHeight: number,
): boolean => {
  if (![distance, velocity, sheetHeight].every(Number.isFinite) || sheetHeight <= 0) return false;
  // Reversing upward always cancels, including a long pull brought back toward the sheet.
  if (velocity < -150) return false;
  const threshold = Math.max(80, Math.min(140, sheetHeight * 0.2));
  return distance >= threshold || (distance >= 24 && velocity >= 900);
};
