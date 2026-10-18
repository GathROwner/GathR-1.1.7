import { Dimensions } from 'react-native';
import { getBottomSystemInset } from '../utils/systemInsets';

// Shared by all three tabs, feed clearance, map ornaments and modal touch proxy.
export const TAB_DOCK_HEIGHT = 52;
export const TAB_DOCK_EDGE_RATIO = 0.07;
export const TAB_DOCK_EDGE_INSET = '7%' as const;

export const getTabDockBottom = (platform: string, bottomInset: number) => {
  const systemInset = getBottomSystemInset(platform, bottomInset, Dimensions.get('window'));
  return platform === 'ios'
    // Leave a visible gap above the home indicator, including shorter safe areas.
    ? Math.max(bottomInset - 6, 18)
    : Math.max(systemInset, 8) + 2;
};

export const getTabDockContentInset = (platform: string, bottomInset: number) =>
  getTabDockBottom(platform, bottomInset) + TAB_DOCK_HEIGHT + 16;
