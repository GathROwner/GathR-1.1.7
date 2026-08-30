import type { Cluster, Event, Venue } from '../types/events';
import type { FilterCriteria } from '../types/filter';
import type { FriendActivityProjection } from '../types/social';
import { doesEventMatchCategoryOrFacet } from './familyFriendly';
import { getRecognizedVenueId, isFriendActivityActive } from './friendPresence';
import { CITY_EVENTS_CATEGORY, isAreaExperienceEvent } from './locationScope';

const EARLY_EVENT_ASSOCIATION_MS = 90 * 60 * 1000;

export type FriendDestinationKind =
  | 'public_event'
  | 'private_invitation'
  | 'private_hosted'
  | 'venue';

export interface FriendDestination {
  id: string;
  venueId: string;
  venueName: string;
  friends: FriendActivityProjection[];
  friendCount: number;
  event: Event | null;
  venue: Venue;
  cluster?: Cluster;
  kind: FriendDestinationKind;
}

interface BuildFriendDestinationsInput {
  activities: FriendActivityProjection[];
  onScreenEvents: Event[];
  clusters: Cluster[];
  filterCriteria: FilterCriteria;
  savedEventIds?: ReadonlySet<string>;
  nowMs?: number;
}

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

const parseLocalEventTime = (dateValue: string, timeValue: string): number => {
  const dateMatch = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return Number.MAX_SAFE_INTEGER;
  const timeMatch = String(timeValue || '').trim().match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
  );
  const rawHours = timeMatch ? Number(timeMatch[1]) : 12;
  const minutes = timeMatch ? Number(timeMatch[2]) : 0;
  const seconds = timeMatch?.[3] ? Number(timeMatch[3]) : 0;
  const meridiem = timeMatch?.[4]?.toUpperCase();
  let hours = rawHours;
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (!Number.isFinite(hours) || hours > 23 || minutes > 59 || seconds > 59) {
    return Number.MAX_SAFE_INTEGER;
  }
  const value = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    hours,
    minutes,
    seconds,
    0
  ).getTime();
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
};

const eventStartsAt = (event: Event): number =>
  parseLocalEventTime(event.startDate, event.startTime);

const eventEndsAt = (event: Event): number => {
  const value = parseLocalEventTime(
    event.endDate || event.startDate,
    event.endTime || event.startTime
  );
  return Number.isFinite(value) ? value : eventStartsAt(event);
};

/**
 * Social destinations obey the active content/category/search/saved filters,
 * but deliberately ignore the time pill. A live check-in is current social
 * information even when its event starts shortly and is categorized as Today.
 */
export const doesEventMatchFriendDestinationFilters = (
  event: Event,
  criteria: FilterCriteria,
  savedEventIds: ReadonlySet<string> = new Set()
): boolean => {
  if (event.type === 'event' && !criteria.showEvents) return false;
  if (event.type === 'special' && !criteria.showSpecials) return false;

  const typeFilters = event.type === 'event'
    ? criteria.eventFilters
    : criteria.specialFilters;
  const category = normalize(typeFilters.category);

  if (category === '__filter_pills_hide__') return false;
  if (category) {
    if (typeFilters.category === CITY_EVENTS_CATEGORY) {
      if (!isAreaExperienceEvent(event)) return false;
    } else if (!doesEventMatchCategoryOrFacet(event, typeFilters.category || '')) {
      return false;
    }
  }

  const search = normalize(typeFilters.search || criteria.search);
  if (search) {
    const haystack = normalize(`${event.title} ${event.description} ${event.venue}`);
    if (!haystack.includes(search)) return false;
  }

  if (typeFilters.savedOnly && !savedEventIds.has(String(event.id))) return false;
  return true;
};

const getEventAssociationCandidates = (events: Event[], nowMs: number): Event[] => {
  const candidates = events.filter((event) => {
    const startsAt = eventStartsAt(event);
    const endsAt = eventEndsAt(event);
    const happening = startsAt <= nowMs && endsAt >= nowMs;
    const startsSoon = startsAt > nowMs && startsAt - nowMs <= EARLY_EVENT_ASSOCIATION_MS;
    return happening || startsSoon;
  });

  return [...candidates].sort((first, second) => {
    const firstStarted = eventStartsAt(first) <= nowMs;
    const secondStarted = eventStartsAt(second) <= nowMs;
    if (firstStarted !== secondStarted) return firstStarted ? -1 : 1;
    const startDelta = eventStartsAt(first) - eventStartsAt(second);
    if (startDelta !== 0) return startDelta;
    return String(first.id).localeCompare(String(second.id));
  });
};

const resolveClusterVenue = (
  clusters: Cluster[],
  venueId: string
): { cluster?: Cluster; venue?: Venue } => {
  for (const cluster of clusters) {
    for (const venue of cluster.venues) {
      const recognizedVenueId = getRecognizedVenueId(venue);
      const presence = cluster.friendPresence?.venues[venue.locationKey];
      const presenceVenueId = presence?.friends.find(
        (friend) => String(friend.venueId) === venueId
      )?.venueId;
      if (recognizedVenueId === venueId || presenceVenueId === venueId) {
        return { cluster, venue };
      }
    }
  }
  return {};
};

const createVenueFromEvent = (event: Event, venueName: string): Venue => ({
  locationKey: `venue:${String(event.venueId || '').trim()}`,
  venue: venueName || event.venue,
  address: event.address,
  latitude: event.latitude,
  longitude: event.longitude,
  events: [event],
});

const destinationKindForEvent = (event: Event | null): FriendDestinationKind => {
  if (!event) return 'venue';
  if (event.source !== 'friend_event') return 'public_event';
  return event.friendEvent?.viewerRole === 'guest'
    ? 'private_invitation'
    : 'private_hosted';
};

export function buildFriendDestinations({
  activities,
  onScreenEvents,
  clusters,
  filterCriteria,
  savedEventIds = new Set(),
  nowMs = Date.now(),
}: BuildFriendDestinationsInput): FriendDestination[] {
  if (!filterCriteria.showEvents && !filterCriteria.showSpecials) return [];

  const activeByVenue = new Map<string, Map<string, FriendActivityProjection>>();
  for (const activity of activities) {
    const venueId = String(activity.venueId || '').trim();
    if (!venueId || !isFriendActivityActive(activity, nowMs)) continue;
    const byFriend = activeByVenue.get(venueId) ?? new Map<string, FriendActivityProjection>();
    byFriend.set(activity.ownerUid, activity);
    activeByVenue.set(venueId, byFriend);
  }

  const eventsByVenue = new Map<string, Event[]>();
  for (const event of onScreenEvents) {
    const venueId = String(event.venueId || '').trim();
    if (!venueId || !activeByVenue.has(venueId)) continue;
    const list = eventsByVenue.get(venueId) ?? [];
    list.push(event);
    eventsByVenue.set(venueId, list);
  }

  const hasContentFilter = Boolean(
    !filterCriteria.showEvents
    || !filterCriteria.showSpecials
    || filterCriteria.eventFilters.category
    || filterCriteria.specialFilters.category
    || filterCriteria.eventFilters.search
    || filterCriteria.specialFilters.search
    || filterCriteria.search
    || filterCriteria.eventFilters.savedOnly
    || filterCriteria.specialFilters.savedOnly
  );

  const destinations: FriendDestination[] = [];
  for (const [venueId, byFriend] of activeByVenue) {
    const allVenueEvents = eventsByVenue.get(venueId) ?? [];
    // Requiring an on-screen event is the privacy-safe screen-boundary test:
    // activity carries no coordinates of its own.
    if (allVenueEvents.length === 0) continue;

    const matchingEvents = allVenueEvents.filter((event) =>
      doesEventMatchFriendDestinationFilters(event, filterCriteria, savedEventIds)
    );
    if (hasContentFilter && matchingEvents.length === 0) continue;

    const visibleEvents = hasContentFilter ? matchingEvents : allVenueEvents.filter((event) =>
      doesEventMatchFriendDestinationFilters(event, filterCriteria, savedEventIds)
    );
    const associationCandidates = getEventAssociationCandidates(visibleEvents, nowMs);
    // Event attendance cannot be inferred when multiple current/soon records
    // share a venue. In that case the destination remains a venue check-in.
    const linkedEvent = associationCandidates.length === 1 ? associationCandidates[0] : null;
    const friends = [...byFriend.values()].sort((first, second) =>
      first.displayName.localeCompare(second.displayName)
    );
    const context = resolveClusterVenue(clusters, venueId);
    const representativeEvent = linkedEvent || visibleEvents[0] || allVenueEvents[0];
    const venueName = friends[0]?.venueName || representativeEvent.venue;
    const venue = context.venue || createVenueFromEvent(representativeEvent, venueName);

    destinations.push({
      id: `friend-destination:${venueId}`,
      venueId,
      venueName,
      friends,
      friendCount: friends.length,
      event: linkedEvent,
      venue,
      cluster: context.cluster,
      kind: destinationKindForEvent(linkedEvent),
    });
  }

  return destinations.sort((first, second) => {
    if (second.friendCount !== first.friendCount) return second.friendCount - first.friendCount;
    const firstStart = first.event ? eventStartsAt(first.event) : Number.MAX_SAFE_INTEGER;
    const secondStart = second.event ? eventStartsAt(second.event) : Number.MAX_SAFE_INTEGER;
    if (firstStart !== secondStart) return firstStart - secondStart;
    return first.venueName.localeCompare(second.venueName);
  });
}

export const firstName = (displayName: string): string =>
  String(displayName || 'Friend').trim().split(/\s+/)[0] || 'Friend';

export function formatFriendDestinationTime(event: Event | null, nowMs = Date.now()): string {
  if (!event) return 'Checked in now';
  const startsAt = eventStartsAt(event);
  const endsAt = eventEndsAt(event);
  if (startsAt <= nowMs && endsAt >= nowMs) return 'Happening now';
  const minutesUntil = Math.ceil((startsAt - nowMs) / 60_000);
  if (minutesUntil > 0 && minutesUntil <= 120) {
    return `Starts in ${minutesUntil} min`;
  }
  const start = new Date(startsAt);
  const now = new Date(nowMs);
  const sameDay = start.getFullYear() === now.getFullYear()
    && start.getMonth() === now.getMonth()
    && start.getDate() === now.getDate();
  const time = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today at ${time}`;
  return start.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatFriendsHere(friends: FriendActivityProjection[]): string {
  const names = friends.slice(0, 3).map((friend) => firstName(friend.displayName));
  if (friends.length === 1) return `${names[0]} is here`;
  if (friends.length === 2) return `${names[0]} & ${names[1]} are here`;
  if (friends.length === 3) return `${names[0]}, ${names[1]} & ${names[2]} are here`;
  return `${names.join(', ')} +${friends.length - 3}`;
}
