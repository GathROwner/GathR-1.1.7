import { TutorialBooleanGate } from './tutorialBooleanGate';

export const shouldBypassCalloutOpenGuard = (reason: string): boolean =>
  reason === 'modal-request-close' ||
  reason === 'tutorial-navigation' ||
  reason === 'route-handoff';

export const shouldActivateAndroidRetapOverlay = (reason: string): boolean =>
  reason !== 'tutorial-navigation' && reason !== 'route-handoff';

export const shouldRouteTutorialCalloutBack = (
  tutorialVisible: boolean,
  tutorialStepId: string | null,
): boolean => tutorialVisible && tutorialStepId === 'callout-venue-selector';

/**
 * Closes a tutorial callout only when native presentation is still committed.
 * The wait is started before the close request so a synchronous teardown event
 * cannot be missed.
 */
export const closePresentedTutorialCallout = async (
  gate: Pick<TutorialBooleanGate, 'getValue' | 'waitFor'>,
  close: () => void,
  timeoutMs: number,
): Promise<boolean> => {
  if (!gate.getValue()) return true;

  const closed = gate.waitFor(false, { timeoutMs });
  close();
  return closed;
};
