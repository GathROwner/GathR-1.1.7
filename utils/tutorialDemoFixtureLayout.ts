export type TutorialDemoInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type TutorialDemoViewport = {
  width: number;
  height: number;
};

export const TUTORIAL_DEMO_CLUSTER_SIZE = 72;

// The cluster card is intentionally placed above the tutorial sheet instead
// of being tied to a Mapbox coordinate. This makes the tutorial deterministic
// while leaving room for both the sheet and the platform home indicator.
const TUTORIAL_DEMO_CLUSTER_BOTTOM_CLEARANCE = 364;
const TUTORIAL_DEMO_CLUSTER_TOP_GUTTER = 168;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

export const getTutorialDemoClusterFrame = (
  viewport: TutorialDemoViewport,
  insets: TutorialDemoInsets,
) => {
  const safeWidth = Math.max(0, viewport.width - insets.left - insets.right);
  const left = insets.left + (safeWidth - TUTORIAL_DEMO_CLUSTER_SIZE) / 2;
  const minTop = Math.round(insets.top + TUTORIAL_DEMO_CLUSTER_TOP_GUTTER);
  const maxTop = Math.max(
    minTop,
    Math.round(
      viewport.height
        - insets.bottom
        - TUTORIAL_DEMO_CLUSTER_BOTTOM_CLEARANCE
        - TUTORIAL_DEMO_CLUSTER_SIZE,
    ),
  );
  const preferredTop = Math.round((viewport.height - TUTORIAL_DEMO_CLUSTER_SIZE) * 0.47);

  return {
    x: left,
    y: clamp(preferredTop, minTop, maxTop),
    width: TUTORIAL_DEMO_CLUSTER_SIZE,
    height: TUTORIAL_DEMO_CLUSTER_SIZE,
  };
};
