import { createTutorialBooleanGate } from '../tutorialBooleanGate';
import {
  closePresentedTutorialCallout,
  shouldActivateAndroidRetapOverlay,
  shouldBypassCalloutOpenGuard,
  shouldRouteTutorialCalloutBack,
} from '../tutorialCalloutClosing';

describe('tutorial callout closing', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not issue a close request when no callout is presented', async () => {
    const gate = createTutorialBooleanGate(false);
    const close = jest.fn();

    await expect(closePresentedTutorialCallout(gate, close, 100)).resolves.toBe(true);
    expect(close).not.toHaveBeenCalled();
    gate.dispose();
  });

  it('starts waiting before requesting close and acknowledges committed teardown', async () => {
    const gate = createTutorialBooleanGate(true);
    const close = jest.fn(() => gate.publish(false));

    await expect(closePresentedTutorialCallout(gate, close, 100)).resolves.toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    gate.dispose();
  });

  it('uses the gate timeout instead of acknowledging an unfinished close', async () => {
    jest.useFakeTimers();
    const gate = createTutorialBooleanGate(true);
    const close = jest.fn();
    const closing = closePresentedTutorialCallout(gate, close, 250);

    expect(close).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(250);
    await expect(closing).resolves.toBe(false);
    gate.dispose();
  });

  it('does not leave the Android retap blocker active for direct map handoffs', () => {
    expect(shouldActivateAndroidRetapOverlay('tutorial-navigation')).toBe(false);
    expect(shouldActivateAndroidRetapOverlay('route-handoff')).toBe(false);
    expect(shouldActivateAndroidRetapOverlay('map-press')).toBe(true);
    expect(shouldActivateAndroidRetapOverlay('callout-onClose-prop')).toBe(true);
  });

  it('allows an explicit route handoff through the short callout-open guard', () => {
    expect(shouldBypassCalloutOpenGuard('route-handoff')).toBe(true);
    expect(shouldBypassCalloutOpenGuard('modal-request-close')).toBe(true);
    expect(shouldBypassCalloutOpenGuard('tutorial-navigation')).toBe(true);
    expect(shouldBypassCalloutOpenGuard('map-press')).toBe(false);
  });

  it('routes native Back through tutorial Previous only for the hosted callout step', () => {
    expect(shouldRouteTutorialCalloutBack(true, 'callout-venue-selector')).toBe(true);
    expect(shouldRouteTutorialCalloutBack(false, 'callout-venue-selector')).toBe(false);
    expect(shouldRouteTutorialCalloutBack(true, 'cluster-click')).toBe(false);
    expect(shouldRouteTutorialCalloutBack(true, null)).toBe(false);
  });
});
