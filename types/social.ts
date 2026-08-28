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

export interface BlockProjection {
  ownerUid: string;
  blockedUid: string;
  createdAt?: SocialTimestamp;
}

export interface FriendActivityProjection extends SocialProfile {
  ownerUid: string;
  venueId: string;
  venueLocationKey: string;
  venueName: string;
  message: string;
  createdAt?: SocialTimestamp;
  expiresAt?: SocialTimestamp;
  revision: string;
}

export type CheckInAudienceMode = 'all_friends' | 'selected_friends';
export type CheckInDurationMinutes = 30 | 60 | 120;

export interface OwnCheckIn {
  ownerUid: string;
  venueId: string;
  venueLocationKey: string;
  venueNameSnapshot: string;
  audienceMode: CheckInAudienceMode;
  selectedUids: string[];
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
  venueId: string;
  durationMinutes: CheckInDurationMinutes;
  audienceMode: CheckInAudienceMode;
  selectedUids?: string[];
  message?: string;
}

export const SOCIAL_FEATURE_ENABLED =
  process.env.EXPO_PUBLIC_SOCIAL_FEATURE_ENABLED === 'true';
