export const isTutorialDemoCalloutStep = (
  isTutorialActive: boolean,
  currentStepId: string | null | undefined,
  demoCalloutVisible: boolean,
) => isTutorialActive
  && currentStepId === 'callout-venue-selector'
  && demoCalloutVisible;

export const isTutorialDemoClusterReady = (
  currentStepId: string | null | undefined,
  hasSpotlight: boolean,
  targetUnavailable: boolean,
) => currentStepId === 'cluster-click' && hasSpotlight && !targetUnavailable;

export const shouldAdvanceTutorialDemoCallout = ({
  isTutorialActive,
  currentStepId,
  demoCalloutVisible,
  demoCalloutReady,
  alreadyAdvanced,
}: {
  isTutorialActive: boolean;
  currentStepId: string | null | undefined;
  demoCalloutVisible: boolean;
  demoCalloutReady: boolean;
  alreadyAdvanced: boolean;
}) => isTutorialActive
  && currentStepId === 'cluster-click'
  && demoCalloutVisible
  && demoCalloutReady
  && !alreadyAdvanced;
