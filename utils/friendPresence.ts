import type { Cluster, Venue } from '../types/events';
import type {
  ClusterFriendPresence,
  FriendActivityProjection,
  SocialTimestamp,
  VenueFriendPresence,
} from '../types/social';
import { isScopedLocationEvent } from './locationScope';

export function socialTimestampToMillis(value: SocialTimestamp): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

export function isFriendActivityActive(
  activity: FriendActivityProjection,
  nowMs = Date.now()
): boolean {
  const expiresAtMs = socialTimestampToMillis(activity.expiresAt);
  return expiresAtMs !== null && expiresAtMs > nowMs;
}

export function getRecognizedVenueId(venue: Venue): string | null {
  const venueIds = new Set<string>();
  for (const event of venue.events) {
    if (isScopedLocationEvent(event)) return null;
    const venueId = String(event.venueId || '').trim();
    if (venueId) venueIds.add(venueId);
  }
  return venueIds.size === 1 ? [...venueIds][0] : null;
}

export function buildFriendPresenceByVenue(
  activities: FriendActivityProjection[],
  nowMs = Date.now()
): Record<string, VenueFriendPresence> {
  const result: Record<string, VenueFriendPresence> = {};
  const seenByVenue = new Map<string, Set<string>>();

  for (const activity of activities) {
    const venueId = String(activity.venueId || '').trim();
    if (!isFriendActivityActive(activity, nowMs) || !venueId) continue;
    const seen = seenByVenue.get(venueId) ?? new Set<string>();
    if (seen.has(activity.ownerUid)) continue;
    seen.add(activity.ownerUid);
    seenByVenue.set(venueId, seen);

    const existing = result[venueId];
    if (existing) {
      existing.friends.push(activity);
      existing.friendCount = existing.friends.length;
    } else {
      result[venueId] = {
        venueLocationKey: activity.venueLocationKey,
        venueName: activity.venueName,
        friends: [activity],
        friendCount: 1,
      };
    }
  }

  return result;
}

export function annotateClustersWithFriendPresence(
  clusters: Cluster[],
  activities: FriendActivityProjection[],
  nowMs = Date.now()
): Cluster[] {
  if (activities.length === 0) return clusters;
  const byVenue = buildFriendPresenceByVenue(activities, nowMs);
  if (Object.keys(byVenue).length === 0) return clusters;

  return clusters.map((cluster) => {
    const venues: Record<string, VenueFriendPresence> = {};
    const uniqueFriends = new Map<string, FriendActivityProjection>();
    for (const venue of cluster.venues) {
      const venueId = getRecognizedVenueId(venue);
      const presence = venueId ? byVenue[venueId] : undefined;
      if (!presence) continue;
      venues[venue.locationKey] = {
        ...presence,
        venueLocationKey: venue.locationKey,
      };
      for (const friend of presence.friends) uniqueFriends.set(friend.ownerUid, friend);
    }
    if (uniqueFriends.size === 0) return cluster;
    const previewFriends = [...uniqueFriends.values()]
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, 3);
    const friendPresence: ClusterFriendPresence = {
      friendCount: uniqueFriends.size,
      displayCount: uniqueFriends.size > 3 ? '3+' : String(uniqueFriends.size),
      previewFriends,
      venues,
    };
    return { ...cluster, friendPresence };
  });
}

export function getVenueFriendPresence(cluster: Cluster | null, venue: Venue | null) {
  if (!cluster?.friendPresence || !venue) return null;
  return cluster.friendPresence.venues[venue.locationKey] ?? null;
}

export function formatCheckInVisibilityCopy(
  viewerCount: number,
  expiresAt: SocialTimestamp
): string {
  const safeCount = Math.max(0, Math.floor(viewerCount));
  const label = safeCount === 1 ? 'friend' : 'friends';
  const expiresAtMs = socialTimestampToMillis(expiresAt);
  const expiry = expiresAtMs === null
    ? 'the selected expiry time'
    : new Date(expiresAtMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${safeCount} ${label} can see this check-in until ${expiry}.`;
}
