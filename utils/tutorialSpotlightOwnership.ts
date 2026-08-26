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

export type TutorialClusterActionState = 'inactive' | 'locating' | 'ready' | 'fallback';

export const getTutorialClusterActionState = (
  currentStepId: string | null | undefined,
  hasTarget: boolean,
  hasSpotlight: boolean,
  targetUnavailable: boolean,
): TutorialClusterActionState => {
  if (currentStepId !== 'cluster-click') return 'inactive';
  if (targetUnavailable) return 'fallback';
  return hasTarget && hasSpotlight ? 'ready' : 'locating';
};

export const translateTutorialMeasurementToHost = (
  measurement: SpotlightConfig,
  hostWindowOrigin: Pick<SpotlightConfig, 'x' | 'y'>,
): SpotlightConfig => ({
  ...measurement,
  x: measurement.x - hostWindowOrigin.x,
  y: measurement.y - hostWindowOrigin.y,
});
