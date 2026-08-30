import type { Event } from '../types/events';
import type {
  FriendEventLocationProjection,
  FriendEventProjection,
  SocialTimestamp,
} from '../types/social';

export function socialTimeToMillis(value: SocialTimestamp): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: () => number }).toMillis;
    if (typeof toMillis === 'function') return toMillis.call(value);
  }
  return null;
}

export function formatFriendEventDate(value: SocialTimestamp): string {
  const millis = socialTimeToMillis(value);
  if (millis === null) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(millis));
}

export function isFriendEventCurrent(event: FriendEventProjection, now = Date.now()) {
  const endAt = socialTimeToMillis(event.endAt);
  return event.status !== 'ended' && endAt !== null && endAt > now;
}

export function findFriendEventLocation(
  eventId: string,
  locations: FriendEventLocationProjection[]
) {
  return locations.find((location) => location.eventId === eventId) ?? null;
}

export function friendEventToMapEvent(
  event: FriendEventProjection,
  location: FriendEventLocationProjection | null
): Event | null {
  if (event.status !== 'published') return null;
  const latitude = location?.latitude
    ?? event.latitude
    ?? event.approximateLatitude;
  const longitude = location?.longitude
    ?? event.longitude
    ?? event.approximateLongitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const startAt = socialTimeToMillis(event.startAt);
  const endAt = socialTimeToMillis(event.endAt);
  if (startAt === null || endAt === null) return null;
  const start = new Date(startAt);
  const end = new Date(endAt);
  return {
    id: `friend-event:${event.eventId}`,
    type: 'event',
    category: event.category,
    title: event.title,
    description: event.description,
    venueId: event.venueId || null,
    venue: location?.placeName || event.locationLabel || 'Friend event',
    address: location?.address || event.locationAddress || (event.addressRevealed ? event.locationLabel : 'Address shared later'),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    startTime: start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    endTime: end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    ticketPrice: 'Private friend event',
    profileUrl: '',
    imageUrl: event.coverImageUrl || '',
    SharedPostThumbnail: event.coverImageUrl || '',
    latitude: Number(latitude),
    longitude: Number(longitude),
    ticketLinkPosts: '',
    ticketLinkEvents: '',
    source: 'friend_event',
    locationScope: event.locationType === 'recognized_venue' || location ? 'venue' : 'unknown',
    locationLabel: event.locationLabel,
    locationPrecision: location || event.latitude !== null ? 'exact' : 'approximate',
    mapMode: 'venue',
    friendEvent: {
      eventId: event.eventId,
      hostUid: event.hostUid,
      hostName: event.host.displayName,
      viewerRole: event.viewerRole,
      ownRsvp: event.ownRsvp,
      visibility: event.visibility,
      addressRevealed: event.addressRevealed,
    },
  };
}
