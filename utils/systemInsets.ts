type WindowSize = { width: number; height: number };

// Android tablet taskbars can overlay transparent sheets without being reported
// in their safe-area inset. Keep the same minimum reserve as the floating dock.
export const getBottomSystemInset = (
  platform: string,
  reportedBottom: number,
  { width, height }: WindowSize,
) => platform === 'android' && Math.min(width, height) >= 600
  ? Math.max(reportedBottom, 52)
  : reportedBottom;
