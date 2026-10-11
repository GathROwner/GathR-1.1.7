// Shared by the visible dock, map ornaments and the native-modal touch proxy.
export const MAP_DOCK_HEIGHT = 52;
export const MAP_DOCK_EDGE_INSET = '7%' as const;

export const getMapDockBottom = (platform: string, bottomInset: number) =>
  platform === 'ios'
    // Leave a visible gap above the home indicator, including shorter safe areas.
    ? Math.max(bottomInset - 6, 18)
    : Math.max(bottomInset, 8) + 2;
