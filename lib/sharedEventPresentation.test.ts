import {
  crowdIneligibilityMessage,
  crowdIneligibilityReason,
} from './sharedEventPresentation';

describe('shared event crowd presentation', () => {
  test('explains when an account cannot contribute to community confirmation', () => {
    expect(crowdIneligibilityMessage('account_not_eligible')).toContain('verified email');
  });

  test('finds the first ineligible event reason', () => {
    expect(crowdIneligibilityReason({
      eligibleEventCount: 0,
      collectingEventCount: 0,
      candidateEventCount: 0,
      reviewEventCount: 0,
      promotedEventCount: 0,
      threshold: 3,
      maxContributorCount: 0,
      events: [{
        privateEventId: 'private-1',
        contributorCount: 0,
        threshold: 3,
        status: 'ineligible',
        reason: 'parser_confidence_too_low',
      }],
    })).toBe('parser_confidence_too_low');
  });

  test('uses a safe fallback for new backend reasons', () => {
    expect(crowdIneligibilityMessage('future_reason')).toContain('safety requirements');
  });
});
