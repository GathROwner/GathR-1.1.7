import type { Cluster, Event, Venue } from '../types/events';

type ClusterInteractionRecordLike = {
  eventIds: string[];
};

export type ClusterInteractionMapLike = Map<string, ClusterInteractionRecordLike>;

export interface VenueNewContentProgress {
  venueId: string;
  venueEventIds: string[];
  totalNewEventIds: string[];
  remainingUnseenNewEventIds: string[];
}

const normalizeText = (value?: string): string => (value ?? '').trim().toLowerCase();

const normalizeCoord = (value: number): string => {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(6);
};

export const getVenueIdentityKeyFromVenue = (venue: Pick<Venue, 'venue' | 'address' | 'latitude' | 'longitude'>): string => {
  return [
    normalizeText(venue.venue),
    normalizeText(venue.address),
    normalizeCoord(venue.latitude),
    normalizeCoord(venue.longitude),
  ].join('|');
};

export const getVenueIdentityKeyFromEvent = (event: Pick<Event, 'venue' | 'address' | 'latitude' | 'longitude'>): string => {
  return [
    normalizeText(event.venue),
    normalizeText(event.address),
    normalizeCoord(event.latitude),
    normalizeCoord(event.longitude),
  ].join('|');
};

export const buildEventLookupByVenueIdentity = (events: Event[]): Map<string, Event[]> => {
  const result = new Map<string, Event[]>();

  events.forEach((event) => {
    const key = getVenueIdentityKeyFromEvent(event);
    const existing = result.get(key);
    if (existing) {
      existing.push(event);
    } else {
      result.set(key, [event]);
    }
  });

  return result;
};

export const getVenueNewContentProgress = ({
  venueId,
  venueEvents,
  interactions,
  viewedEventIds,
}: {
  venueId: string;
  venueEvents: Event[];
  interactions: ClusterInteractionMapLike;
  viewedEventIds: Set<string>;
}): VenueNewContentProgress => {
  const venueEventIds = Array.from(new Set(venueEvents.map((event) => event.id.toString())));
  const lastInteraction = interactions.get(venueId);

  // First-time exposure does not count as "new" under current app semantics.
  if (!lastInteraction) {
    return {
      venueId,
      venueEventIds,
      totalNewEventIds: [],
      remainingUnseenNewEventIds: [],
    };
  }

  const previousEventIds = new Set(lastInteraction.eventIds);
  const totalNewEventIds = venueEventIds.filter((eventId) => !previousEventIds.has(eventId));
  const remainingUnseenNewEventIds = totalNewEventIds.filter((eventId) => !viewedEventIds.has(eventId));

  return {
    venueId,
    venueEventIds,
    totalNewEventIds,
    remainingUnseenNewEventIds,
  };
};

export const getClusterUnseenNewCount = ({
  cluster,
  interactions,
  viewedEventIds,
}: {
  cluster: Cluster;
  interactions: ClusterInteractionMapLike;
  viewedEventIds: Set<string>;
}): number => {
  return cluster.venues.reduce((sum, venue) => {
    const progress = getVenueNewContentProgress({
      venueId: venue.locationKey,
      venueEvents: venue.events,
      interactions,
      viewedEventIds,
    });

    return sum + progress.remainingUnseenNewEventIds.length;
  }, 0);
};
