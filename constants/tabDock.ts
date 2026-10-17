import { Dimensions } from 'react-native';

// Shared by all three tabs, feed clearance, map ornaments and modal touch proxy.
export const TAB_DOCK_HEIGHT = 52;
export const TAB_DOCK_EDGE_RATIO = 0.07;
export const TAB_DOCK_EDGE_INSET = '7%' as const;

export const getTabDockBottom = (platform: string, bottomInset: number) => {
  const { width, height } = Dimensions.get('window');
  // Retain the list tabs' Android tablet taskbar reserve for the shared dock.
  const androidInset = platform === 'android' && Math.min(width, height) >= 600
    ? Math.max(bottomInset, 52)
    : bottomInset;
  return platform === 'ios'
    // Leave a visible gap above the home indicator, including shorter safe areas.
    ? Math.max(bottomInset - 6, 18)
    : Math.max(androidInset, 8) + 2;
};

export const getTabDockContentInset = (platform: string, bottomInset: number) =>
  getTabDockBottom(platform, bottomInset) + TAB_DOCK_HEIGHT + 16;
