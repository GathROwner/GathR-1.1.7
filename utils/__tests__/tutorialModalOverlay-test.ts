import {
  getTutorialModalOverlay,
  isTutorialModalHostedStep,
  setTutorialModalOverlay,
  subscribeTutorialModalOverlay,
} from '../tutorialModalOverlay';
import { useTutorialUiStore } from '../../store/tutorialUiStore';

describe('tutorial modal overlay bridge', () => {
  afterEach(() => setTutorialModalOverlay(null));

  afterEach(() => {
    useTutorialUiStore.setState({ isVisible: false, currentStepId: null });
  });

  it('hosts every tutorial state rendered inside a native modal', () => {
    expect(isTutorialModalHostedStep('callout-venue-selector')).toBe(true);
    expect(isTutorialModalHostedStep('facebook-submission')).toBe(true);
    expect(isTutorialModalHostedStep('completion')).toBe(true);
    expect(isTutorialModalHostedStep('cluster-click')).toBe(false);
  });

  it('notifies modal hosts when the overlay renderer changes', () => {
    const listener = jest.fn();
    const renderer = () => null;
    const unsubscribe = subscribeTutorialModalOverlay(listener);

    setTutorialModalOverlay(renderer);

    expect(getTutorialModalOverlay()).toBe(renderer);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setTutorialModalOverlay(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('exposes the active step to modal target measurement code', () => {
    useTutorialUiStore.getState().setVisible(true);
    useTutorialUiStore.getState().setCurrentStepId('facebook-submission');

    expect(useTutorialUiStore.getState()).toMatchObject({
      isVisible: true,
      currentStepId: 'facebook-submission',
    });
  });
});
