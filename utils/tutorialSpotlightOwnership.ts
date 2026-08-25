import type { SpotlightConfig } from '../types/tutorial';

export type OwnedTutorialSpotlight = {
  stepId: string;
  config: SpotlightConfig;
};

export const getTutorialSpotlightForStep = (
  spotlight: OwnedTutorialSpotlight | undefined,
  currentStepId: string | null | undefined,
): SpotlightConfig | undefined => {
  if (!spotlight || spotlight.stepId !== currentStepId) return undefined;
  return spotlight.config;
};
