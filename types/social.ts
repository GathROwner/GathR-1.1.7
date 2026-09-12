import type { Timestamp } from 'firebase/firestore';

export type SocialTimestamp = Timestamp | Date | number | null | undefined;

export interface SocialProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  socialHandle: string;
}

export interface FriendProjection extends SocialProfile {
  acceptedAt?: SocialTimestamp;
  updatedAt?: SocialTimestamp;
}

export interface FriendRequestProjection extends SocialProfile {
  direction: 'incoming' | 'outgoing';
  requestedAt?: SocialTimestamp;
  updatedAt?: SocialTimestamp;
}

export interface BlockProjection extends SocialProfile {
  ownerUid: string;
  blockedUid: string;
  createdAt?: SocialTimestamp;
}

export interface FriendActivityProjection extends SocialProfile {
  ownerUid: string;
  venueId?: string;
  locationType?: 'gathr_venue' | 'external_place' | 'private_place';
  venueLocationKey: string;
  venueName: string;
  placeAddress?: string;
  placeCategory?: string;
  latitude?: number;
  longitude?: number;
  locationPrecision?: 'exact' | 'approximate';
  message: string;
  createdAt?: SocialTimestamp;
  expiresAt?: SocialTimestamp;
  revision: string;
}

export type CheckInAudienceMode = 'all_friends' | 'selected_friends';
export type CheckInDurationMinutes = 30 | 60 | 120;

export interface OwnCheckIn {
  ownerUid: string;
  venueId?: string;
  locationType?: 'gathr_venue' | 'external_place' | 'private_place';
  venueLocationKey: string;
  venueNameSnapshot: string;
  placeAddress?: string;
  placeCategory?: string;
  latitude?: number;
  longitude?: number;
  locationPrecision?: 'exact' | 'approximate';
  audienceMode: CheckInAudienceMode;
  selectedUids: string[];
  shareExactLocation?: boolean;
  viewerUids: string[];
  viewerCount: number;
  message: string;
  durationMinutes: CheckInDurationMinutes;
  createdAt?: SocialTimestamp;
  expiresAt?: SocialTimestamp;
  revision: string;
}

export interface VenueFriendPresence {
  venueLocationKey: string;
  venueName: string;
  friends: FriendActivityProjection[];
  friendCount: number;
}

export interface ClusterFriendPresence {
  friendCount: number;
  displayCount: string;
  previewFriends: FriendActivityProjection[];
  venues: Record<string, VenueFriendPresence>;
}

export interface CheckInInput {
  operationId?: string;
  eligibilitySessionId?: string;
  venueId?: string;
  placeCandidateId?: string;
  durationMinutes: CheckInDurationMinutes;
  audienceMode: CheckInAudienceMode;
  selectedUids?: string[];
  shareExactLocation?: boolean;
  message?: string;
}

export type CheckInEligibilityReason =
  | 'qualifying'
  | 'eligible'
  | 'outside'
  | 'low_accuracy'
  | 'moving_too_fast';

export interface CheckInEligibilityResult {
  sessionId: string;
  venueId?: string;
  placeCandidateId?: string;
  locationKey: string;
  eligibleVenueIds: string[];
  eligible: boolean;
  qualifyingMs: number;
  requiredMs: number;
  remainingMs: number;
  distanceMetres: number;
  reason: CheckInEligibilityReason;
  expiresAt?: SocialTimestamp;
}

export interface CheckInEligibilitySampleInput {
  sessionId: string;
  venueId?: string;
  placeCandidateId?: string;
  candidateVenueIds?: string[];
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  speedMetersPerSecond?: number | null;
}

export interface NearbyCheckInPlaceCandidate {
  id: string;
  type: 'gathr_venue' | 'external_place' | 'private_place';
  venueId?: string;
  name: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceMetres: number;
}

export interface NearbyCheckInPlacesResult {
  candidates: NearbyCheckInPlaceCandidate[];
  expiresAt?: SocialTimestamp;
}

export interface PrivateCheckInPlaceCandidateResult {
  candidate: NearbyCheckInPlaceCandidate & { type: 'private_place' };
  expiresAt?: SocialTimestamp;
}

export type FriendEventVisibility = 'all_friends' | 'selected_friends';
export type FriendEventGuestInviteMode = 'host_only' | 'guests_can_invite';
export type FriendEventLocationType = 'recognized_venue' | 'custom_address' | 'online' | 'tbd';
export type FriendEventStatus = 'published' | 'canceled' | 'ended';
export type FriendEventRsvp = 'invited' | 'going' | 'maybe' | 'cant_go' | 'host';

export interface FriendEventResponseCounts {
  going: number;
  maybe: number;
  cant_go: number;
}

export interface FriendEventGuest extends SocialProfile {
  invitedByUid: string;
  response: FriendEventRsvp;
}

export interface FriendEventHistoryEntry {
  kind: 'created' | 'edited' | 'canceled' | 'ended';
  summary: string;
  at?: SocialTimestamp;
  revision: string;
}

export interface FriendEventProjection {
  eventId: string;
  hostUid: string;
  host: SocialProfile;
  viewerUid: string;
  viewerRole: 'host' | 'guest';
  title: string;
  description: string;
  category: string;
  startAt?: SocialTimestamp;
  endAt?: SocialTimestamp;
  status: FriendEventStatus;
  visibility: FriendEventVisibility;
  guestInviteMode: FriendEventGuestInviteMode;
  guestListVisible: boolean;
  coverImageUrl: string;
  externalUrl: string;
  locationType: FriendEventLocationType;
  locationLabel: string;
  locationAddress: string;
  addressRevealAt?: SocialTimestamp;
  addressRevealed: boolean;
  venueId: string;
  latitude: number | null;
  longitude: number | null;
  approximateLatitude: number | null;
  approximateLongitude: number | null;
  onlineUrl: string;
  viewerCount: number;
  responseCounts: FriendEventResponseCounts;
  guests: FriendEventGuest[];
  ownRsvp: FriendEventRsvp;
  cancellationReason: string;
  updateHistory: FriendEventHistoryEntry[];
  revision: string;
  createdAt?: SocialTimestamp;
  updatedAt?: SocialTimestamp;
}

export interface FriendEventLocationProjection {
  eventId: string;
  hostUid: string;
  address: string;
  placeName: string;
  latitude: number;
  longitude: number;
  revealedAt?: SocialTimestamp;
  updatedAt?: SocialTimestamp;
}

export interface FriendEventLocationSuggestion {
  id: string;
  mapboxId: string;
  primaryText: string;
  secondaryText: string;
  fullAddress: string;
  featureType: string;
}

export interface ResolvedFriendEventLocationSuggestion {
  mapboxId: string;
  primaryText: string;
  fullAddress: string;
  featureType: string;
  latitude: number;
  longitude: number;
}

export type FriendEventLocationInput =
  | { type: 'recognized_venue'; venueId: string }
  | {
      type: 'custom_address';
      address: string;
      placeName?: string;
      latitude: number;
      longitude: number;
      revealAtMs?: number;
    }
  | { type: 'online'; onlineUrl?: string }
  | { type: 'tbd' };

export interface FriendEventInput {
  operationId?: string;
  title: string;
  description?: string;
  category: string;
  startAtMs: number;
  endAtMs: number;
  visibility: FriendEventVisibility;
  selectedUids?: string[];
  guestInviteMode: FriendEventGuestInviteMode;
  guestListVisible?: boolean;
  coverImageUrl?: string;
  externalUrl?: string;
  location: FriendEventLocationInput;
}

export const SOCIAL_FEATURE_ENABLED =
  process.env.EXPO_PUBLIC_SOCIAL_FEATURE_ENABLED === 'true';

export const SOCIAL_RELEASE_TWO_ENABLED =
  SOCIAL_FEATURE_ENABLED && process.env.EXPO_PUBLIC_SOCIAL_RELEASE_TWO_ENABLED === 'true';
