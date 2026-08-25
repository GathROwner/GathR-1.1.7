import { createTutorialPresentationSettler } from '../tutorialPresentationSettler';

describe('createTutorialPresentationSettler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('settles immediately when the entrance animation finishes', () => {
    const onSettled = jest.fn();
    const settler = createTutorialPresentationSettler(onSettled, 1200);

    settler.animationComplete(true);

    expect(onSettled).toHaveBeenCalledTimes(1);
    jest.runAllTimers();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('uses the bounded fallback when the animation is interrupted', () => {
    const onSettled = jest.fn();
    const settler = createTutorialPresentationSettler(onSettled, 1200);

    settler.animationComplete(false);
    jest.advanceTimersByTime(1199);
    expect(onSettled).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('does not settle after cancellation', () => {
    const onSettled = jest.fn();
    const settler = createTutorialPresentationSettler(onSettled, 1200);

    settler.cancel();
    jest.runAllTimers();

    expect(onSettled).not.toHaveBeenCalled();
  });
});
