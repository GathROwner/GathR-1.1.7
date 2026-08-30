import type {
  FriendEventLocationProjection,
  FriendEventProjection,
  FriendEventVisibility,
} from '../types/social';

export type FriendEventVerificationState =
  | 'checking'
  | 'available'
  | 'unavailable'
  | 'error';

export interface FriendEventAudienceState {
  effectiveVisibility: FriendEventVisibility;
  audienceCount: number;
  hostOnly: boolean;
}

/**
 * A new host with no friends can still plan an event, but "All friends" then
 * snapshots an empty guest audience. Keep the server contract valid while the
 * UI describes that state honestly as host-only for now.
 */
export function resolveFriendEventAudience(
  visibility: FriendEventVisibility,
  friendCount: number,
  selectedCount: number,
  editing: boolean
): FriendEventAudienceState {
  const safeFriendCount = Math.max(0, friendCount);
  const safeSelectedCount = Math.max(0, selectedCount);
  const hostOnly = !editing && safeFriendCount === 0;
  const effectiveVisibility = hostOnly ? 'all_friends' : visibility;
  return {
    effectiveVisibility,
    audienceCount: effectiveVisibility === 'all_friends'
      ? safeFriendCount
      : safeSelectedCount,
    hostOnly,
  };
}

/**
 * A confirmed direct-document miss overrides older collection state. Before
 * that confirmation, an already server-confirmed store projection may render
 * while the focused listener catches up.
 */
export function resolveFriendEventDetail(
  storeEvent: FriendEventProjection | null,
  verifiedEvent: FriendEventProjection | null,
  verification: FriendEventVerificationState
) {
  if (verification === 'unavailable') return null;
  if (verification === 'available') return verifiedEvent;
  return storeEvent;
}

/**
 * Exact private locations fail closed: once the focused server listener
 * confirms that no location projection exists, never fall back to an older
 * collection value.
 */
export function resolveFriendEventLocation(
  storeLocation: FriendEventLocationProjection | null,
  verifiedLocation: FriendEventLocationProjection | null,
  verified: boolean
) {
  return verified ? verifiedLocation : storeLocation;
}
