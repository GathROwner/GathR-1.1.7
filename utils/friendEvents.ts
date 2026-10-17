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

/**
 * Exact location actions must only use the separately authorized location
 * projection (or an exact event projection). Approximate map coordinates are
 * intentionally excluded so they can never unlock directions or calendar
 * address details before the host's reveal time.
 */
export function hasExactFriendEventCoordinates(
  event: Pick<FriendEventProjection, 'latitude' | 'longitude'>,
  location: FriendEventLocationProjection | null
) {
  return Number.isFinite(location?.latitude ?? event.latitude)
    && Number.isFinite(location?.longitude ?? event.longitude);
}

function hasUsefulLocationLabel(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized && normalized !== 'friend event' && normalized !== 'private event');
}

function shortAddress(value?: string | null) {
  return String(value || '').split(',')[0]?.trim() || '';
}

/**
 * Map callouts need a useful location heading without turning a hidden home
 * address into a venue name. An authorized place name wins; an exact address
 * is only shortened into the heading after the location projection is present.
 */
export function getFriendEventMapLocationLabel(
  event: FriendEventProjection,
  location: FriendEventLocationProjection | null
) {
  if (hasUsefulLocationLabel(location?.placeName)) return location!.placeName.trim();
  if (hasUsefulLocationLabel(event.locationLabel)) return event.locationLabel.trim();
  if (location?.address) return shortAddress(location.address);
  if (event.locationType === 'recognized_venue' && event.locationAddress) {
    return shortAddress(event.locationAddress);
  }
  return 'Private event';
}

/**
 * Exact custom addresses fail closed. Recognized venue addresses are public;
 * custom addresses require either the separate authorized location projection
 * or an explicitly revealed exact event projection.
 */
export function getFriendEventMapAddress(
  event: FriendEventProjection,
  location: FriendEventLocationProjection | null
) {
  if (location?.address) return location.address.trim();
  if (event.locationType === 'recognized_venue') {
    return event.locationAddress.trim() || event.locationLabel.trim();
  }
  if (event.addressRevealed && event.locationAddress) return event.locationAddress.trim();
  return 'Address shared later';
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
    venue: getFriendEventMapLocationLabel(event, location),
    address: getFriendEventMapAddress(event, location),
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
