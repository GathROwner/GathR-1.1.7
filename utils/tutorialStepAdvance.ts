import { TUTORIAL_STEPS, getCompletedIdsForStep } from '../config/tutorialSteps';

export interface TutorialStepAdvance {
  nextIndex: number;
  completedIds: string[];
  crossesFilterPills: boolean;
}

export const getTutorialStepAdvance = (
  currentIndex: number,
  requestedStepCount = 1,
): TutorialStepAdvance => {
  const stepCount = Number.isFinite(requestedStepCount)
    ? Math.max(1, Math.trunc(requestedStepCount))
    : 1;
  const lastIndex = Math.max(0, TUTORIAL_STEPS.length - 1);
  const safeCurrentIndex = Math.min(Math.max(0, currentIndex), lastIndex);
  const nextIndex = Math.min(safeCurrentIndex + stepCount, lastIndex);
  const crossedSteps = TUTORIAL_STEPS.slice(safeCurrentIndex + 1, nextIndex + 1);

  return {
    nextIndex,
    completedIds: TUTORIAL_STEPS
      .slice(safeCurrentIndex, nextIndex)
      .flatMap(getCompletedIdsForStep),
    crossesFilterPills: crossedSteps.some((step) => step.id === 'filter-pills'),
  };
};

export const getTutorialPreviousIndex = (
  currentIndex: number,
  skipCalloutLesson: boolean,
): number => {
  const lastIndex = Math.max(0, TUTORIAL_STEPS.length - 1);
  const safeCurrentIndex = Math.min(Math.max(0, currentIndex), lastIndex);
  const shouldJumpOverCallout =
    skipCalloutLesson &&
    TUTORIAL_STEPS[safeCurrentIndex]?.id === 'filter-pills';

  return Math.max(0, safeCurrentIndex - (shouldJumpOverCallout ? 2 : 1));
};
