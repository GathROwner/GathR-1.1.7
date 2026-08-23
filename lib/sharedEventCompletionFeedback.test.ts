import { shouldShowSharedEventInAppBanner } from './sharedEventCompletionFeedback';

describe('shared event completion feedback', () => {
  it('does not cover the live result screen with a duplicate banner', () => {
    expect(shouldShowSharedEventInAppBanner('/shared-event')).toBe(false);
    expect(shouldShowSharedEventInAppBanner('/(tabs)/map')).toBe(true);
  });
});
