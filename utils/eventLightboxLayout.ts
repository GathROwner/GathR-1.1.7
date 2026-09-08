interface EventLightboxLayoutInput {
  windowHeight: number;
  safeAreaTop: number;
  tabBarHeight: number;
}

interface EventLightboxLayout {
  panelTop: number;
  panelHeight: number;
  imageHeight: number;
  descriptionMinHeight: number;
}

const IMAGE_SCREEN_HEIGHT_RATIO = 0.35;
const IMAGE_PANEL_HEIGHT_RATIO = 0.45;
const DESCRIPTION_VISIBLE_HEIGHT = 114;
const DESCRIPTION_PANEL_HEIGHT_RATIO = 0.19;

export const getEventLightboxLayout = ({
  windowHeight,
  safeAreaTop,
  tabBarHeight,
}: EventLightboxLayoutInput): EventLightboxLayout => {
  const normalizedWindowHeight = Math.max(0, windowHeight);
  const panelTop = Math.max(0, safeAreaTop);
  const panelBottom = Math.max(0, tabBarHeight);
  const panelHeight = Math.max(0, normalizedWindowHeight - panelTop - panelBottom);
  const imageHeight = Math.min(
    normalizedWindowHeight * IMAGE_SCREEN_HEIGHT_RATIO,
    panelHeight * IMAGE_PANEL_HEIGHT_RATIO
  );
  const descriptionMinHeight = Math.min(
    DESCRIPTION_VISIBLE_HEIGHT,
    panelHeight * DESCRIPTION_PANEL_HEIGHT_RATIO
  );

  return {
    panelTop,
    panelHeight,
    imageHeight,
    descriptionMinHeight,
  };
};
