import { beginProfileTutorialReplay } from '../tutorialReplay';

describe('profile tutorial replay', () => {
  it('starts the tutorial and dismisses the native Profile modal', () => {
    const calls: string[] = [];

    const started = beginProfileTutorialReplay({
      restartTutorial: () => calls.push('restart'),
      dismissProfile: () => calls.push('dismiss'),
    });

    expect(started).toBe(true);
    expect(calls).toEqual(['restart', 'dismiss']);
  });

  it('keeps Profile open when the tutorial manager is unavailable', () => {
    const dismissProfile = jest.fn();

    const started = beginProfileTutorialReplay({
      restartTutorial: undefined,
      dismissProfile,
    });

    expect(started).toBe(false);
    expect(dismissProfile).not.toHaveBeenCalled();
  });
});
