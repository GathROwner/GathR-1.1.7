import {
  crowdIneligibilityMessage,
  crowdIneligibilityReason,
  sharedEventProgressStage,
} from './sharedEventPresentation';

describe('shared event progress presentation', () => {
  test('keeps Uploading active until the server accepts the photo', () => {
    expect(sharedEventProgressStage('processing', false)).toBe(1);
  });

  test('moves to Reading as soon as the upload is accepted', () => {
    expect(sharedEventProgressStage('processing', true)).toBe(2);
  });

  test('marks Ready complete only after processing finishes', () => {
    expect(sharedEventProgressStage('saved', true)).toBe(3);
    expect(sharedEventProgressStage('needs_review', true)).toBe(3);
  });

  test('shows an error at the stage where it occurred', () => {
    expect(sharedEventProgressStage('error', false)).toBe(1);
    expect(sharedEventProgressStage('error', true)).toBe(2);
  });
});

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
