import { auth } from '../config/firebaseConfig';

const DEFAULT_FUNCTIONS_BASE_URL = 'https://northamerica-northeast2-gathr-m1.cloudfunctions.net';

const FUNCTIONS_BASE_URL = (
  (typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_GATHR_FUNCTIONS_BASE_URL) ||
  DEFAULT_FUNCTIONS_BASE_URL
).replace(/\/+$/, '');

export type SharedEventPayload = {
  sourceUrl?: string;
  sharedText?: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  mediaUrls?: string[];
  sourcePlatform?: string;
  sourceApp?: string;
  visibilityHint?: string;
  timezone?: string;
};

export type SharedEventResultEvent = {
  privateEventId?: string;
  publicCandidateId?: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  mediaUrls?: string[];
  imageUrl?: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  confidence?: number;
  needsUserReview?: boolean;
  reviewReasons?: string[];
  sequenceIndex?: number;
  extractedFromShare?: boolean;
};

export type SharedEventSubmitResult = {
  success: boolean;
  ingestId?: string;
  privateEventId?: string;
  privateEventIds?: string[];
  publicCandidateId?: string;
  publicCandidateIds?: string[];
  routing?: 'private_only' | 'public_candidate';
  sourceVisibility?: 'public_verified' | 'restricted_unverified' | 'user_private' | 'unknown';
  status?: 'needs_user_review' | 'saved' | 'submitted_public_candidate';
  extractedEventCount?: number;
  needsUserReview?: boolean;
  reviewReasons?: string[];
  confidence?: number;
  event?: SharedEventResultEvent;
  events?: SharedEventResultEvent[];
  visibilityEvidence?: {
    method?: string;
    reason?: string;
    httpStatus?: number;
    finalUrl?: string;
  };
  error?: string;
};

export async function submitSharedEvent(payload: SharedEventPayload): Promise<SharedEventSubmitResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Log in to save shared events.');
  }

  const token = await user.getIdToken();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/submitSharedEvent`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ payload }),
  });

  const result = await response.json().catch(() => ({})) as SharedEventSubmitResult;
  if (!response.ok || result.success === false) {
    throw new Error(result.error || `Shared event save failed (${response.status})`);
  }

  return result;
}
