import type { SharedEventCrowdPromotionSummary } from './sharedEventApi';

export type SharedEventProgressPhase = 'processing' | 'saved' | 'needs_review' | 'error';

export function sharedEventProgressStage(
  phase: SharedEventProgressPhase,
  uploadAccepted: boolean
): 1 | 2 | 3 {
  if (phase === 'processing' || phase === 'error') {
    return uploadAccepted ? 2 : 1;
  }

  return 3;
}

const CROWD_INELIGIBILITY_MESSAGES: Record<string, string> = {
  account_not_eligible:
    'This account needs a verified email or linked phone number before its photos can count toward community confirmation.',
  critical_facts_not_photo_derived:
    'GathR could not confidently read the title, date, and location directly from the photo, so this copy stays private.',
  parser_confidence_too_low:
    'GathR saved the event, but the photo parse was not confident enough to count toward community confirmation.',
  location_required:
    'GathR could not confirm a venue or address from the photo, so this copy stays private.',
  title_not_specific:
    'GathR could not confirm a specific event title from the photo, so this copy stays private.',
  date_out_of_range:
    'The detected date is outside the range used for community confirmation, so this copy stays private.',
  event_expired:
    'This event appears to have already happened, so it cannot enter community confirmation.',
  photo_required:
    'A user-shared photo is required before an event can enter community confirmation.',
  public_source_uses_public_validation:
    'This share follows GathR\'s public-source review path instead of community photo confirmation.',
};

export function crowdIneligibilityReason(
  crowd: SharedEventCrowdPromotionSummary | undefined
): string | undefined {
  return crowd?.events.find((event) => event.status === 'ineligible')?.reason;
}

export function crowdIneligibilityMessage(reason: string | undefined): string {
  if (!reason) {
    return 'This event did not meet the safety requirements for community confirmation, so it stays private to your account.';
  }
  return CROWD_INELIGIBILITY_MESSAGES[reason] ||
    'This event did not meet the safety requirements for community confirmation, so it stays private to your account.';
}
