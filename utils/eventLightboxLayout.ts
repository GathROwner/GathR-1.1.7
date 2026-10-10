interface EventLightboxLayoutInput {
  windowHeight: number;
  safeAreaTop: number;
  safeAreaBottom?: number;
  tabBarHeight: number;
  extendToDeviceEdges?: boolean;
}

interface EventLightboxLayout {
  panelTop: number;
  panelBottom: number;
  panelHeight: number;
  imageHeight: number;
  descriptionMinHeight: number;
}

const IMAGE_SCREEN_HEIGHT_RATIO = 0.35;
const EDGE_TO_EDGE_IMAGE_SCREEN_HEIGHT_RATIO = 0.4;
const IMAGE_PANEL_HEIGHT_RATIO = 0.45;
const DESCRIPTION_VISIBLE_HEIGHT = 114;
const DESCRIPTION_PANEL_HEIGHT_RATIO = 0.19;

export const getEventLightboxLayout = ({
  windowHeight,
  safeAreaTop,
  safeAreaBottom = 0,
  tabBarHeight,
  extendToDeviceEdges = false,
}: EventLightboxLayoutInput): EventLightboxLayout => {
  const normalizedWindowHeight = Math.max(0, windowHeight);
  const panelTop = extendToDeviceEdges ? 0 : Math.max(0, safeAreaTop);
  const panelBottom = extendToDeviceEdges
    ? Math.max(0, safeAreaBottom)
    : Math.max(0, tabBarHeight);
  const panelHeight = Math.max(0, normalizedWindowHeight - panelTop - panelBottom);
  const imageHeight = Math.min(
    normalizedWindowHeight * (
      extendToDeviceEdges
        ? EDGE_TO_EDGE_IMAGE_SCREEN_HEIGHT_RATIO
        : IMAGE_SCREEN_HEIGHT_RATIO
    ),
    panelHeight * IMAGE_PANEL_HEIGHT_RATIO
  );
  const descriptionMinHeight = Math.min(
    DESCRIPTION_VISIBLE_HEIGHT,
    panelHeight * DESCRIPTION_PANEL_HEIGHT_RATIO
  );

  return {
    panelTop,
    panelBottom,
    panelHeight,
    imageHeight,
    descriptionMinHeight,
  };
};
