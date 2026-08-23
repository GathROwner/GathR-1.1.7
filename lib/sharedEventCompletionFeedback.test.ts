import {
  sharedEventFeedbackKind,
  shouldSendSharedEventSystemNotification,
  shouldShowSharedEventInAppBanner,
} from './sharedEventCompletionFeedback';

describe('shared event completion feedback', () => {
  it('routes completion, venue review, and failure to distinct notification kinds', () => {
    expect(sharedEventFeedbackKind({ tone: 'success' })).toBe('shared_event_complete');
    expect(sharedEventFeedbackKind({ tone: 'warning', persistent: true })).toBe('shared_event_venue_needed');
    expect(sharedEventFeedbackKind({ tone: 'error' })).toBe('shared_event_failed');
  });

  it('uses OS notifications only while GathR is not active', () => {
    expect(shouldSendSharedEventSystemNotification('active')).toBe(false);
    expect(shouldSendSharedEventSystemNotification('background')).toBe(true);
    expect(shouldSendSharedEventSystemNotification('inactive')).toBe(true);
  });

  it('does not cover the live result screen with a duplicate banner', () => {
    expect(shouldShowSharedEventInAppBanner('/shared-event')).toBe(false);
    expect(shouldShowSharedEventInAppBanner('/(tabs)/map')).toBe(true);
  });
});
