import { TUTORIAL_STEPS, getCompletedIdsForStep } from '../config/tutorialSteps';

export interface TutorialStepAdvance {
  nextIndex: number;
  completedIds: string[];
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
  return {
    nextIndex,
    completedIds: TUTORIAL_STEPS
      .slice(safeCurrentIndex, nextIndex)
      .flatMap(getCompletedIdsForStep),
  };
};
