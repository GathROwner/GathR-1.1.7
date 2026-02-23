/**
 * Firestore Events API Service
 * Handles fetching, filtering, and pagination for Firestore-sourced events.
 */

import { Event } from '../../types/events';
import { FirestoreEvent, FirestoreEventsResponse } from '../../types/firestore';
import {
  FIRESTORE_API_BASE,
  FIRESTORE_INCLUDE_EXPIRED_DEFAULT,
  FIRESTORE_MAX_PAGES,
  FIRESTORE_PAGE_LIMIT,
} from '../config/backend';

// Debug flag for logging
const DEBUG_FIRESTORE = __DEV__ ?? true;

export interface FirestoreFetchOptions {
  isEvent?: boolean;
  startDate?: string;
  endDate?: string;
  includeExpired?: boolean;
  maxPages?: number;
  limit?: number;
}

interface FirestorePageRequest extends FirestoreFetchOptions {
  startAfter?: string;
}

export const toFirestoreEventId = (eventId: string | number): string => {
  const raw = String(eventId ?? '').trim();
  if (!raw) return '';
  return raw.startsWith('fb_') ? raw.slice(3) : raw;
};

export const toAppEventId = (eventId: string | number): string => {
  const raw = String(eventId ?? '').trim();
  if (!raw) return '';
  return raw.startsWith('fb_') ? raw : `fb_${raw}`;
};

export const areEventIdsEquivalent = (
  a: string | number | null | undefined,
  b: string | number | null | undefined
): boolean => {
  if (a == null || b == null) return false;
  return toFirestoreEventId(a) === toFirestoreEventId(b);
};

/**
 * Convert 24-hour time format to 12-hour format with AM/PM
 * "14:00" -> "2:00:00 PM"
 * "09:30" -> "9:30:00 AM"
 * "00:00" -> "12:00:00 AM"
 */
export function convert24to12Hour(time24: string): string {
  if (!time24) return '';
  if (/am|pm/i.test(time24)) return time24;

  const parts = time24.split(':');
  if (parts.length < 2) return time24;

  let hour = Number.parseInt(parts[0], 10);
  const minute = parts[1] || '00';

  if (Number.isNaN(hour)) return time24;

  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;

  return `${hour}:${minute}:00 ${period}`;
}

/**
 * Normalize a Firestore event to match the app Event interface.
 */
export function normalizeFirestoreEvent(fsEvent: FirestoreEvent): Event {
  const latitude = fsEvent.venueInfo?.coordinates?.latitude ?? 0;
  const longitude = fsEvent.venueInfo?.coordinates?.longitude ?? 0;
  const venue = fsEvent.venue;

  if (latitude === 0 && longitude === 0 && DEBUG_FIRESTORE) {
    console.log(`[Firestore] Event with no coordinates: ${fsEvent.id} - ${fsEvent.title}`);
  }

  const rawOriginalEventId = fsEvent.originalEventId ?? fsEvent.metadata?.originalEventId ?? null;

  const rawDescription =
    fsEvent.fullDescription ??
    fsEvent.metadata?.fullDescription ??
    fsEvent.description ??
    '';

  return {
    // Preserve existing app expectation that Firestore IDs are namespaced.
    id: toAppEventId(fsEvent.id),

    // Type mapping: isEvent=false -> 'special', otherwise 'event' (including null)
    type: fsEvent.isEvent === false ? 'special' : 'event',

    // Source tracking
    source: 'firestore' as const,

    // Basic event info
    category: fsEvent.category || 'Other',
    title: fsEvent.title || '',
    description: rawDescription,

    // Venue info (flattened from nested structure)
    venue: fsEvent.venueInfo?.name || fsEvent.metadata?.venueName || venue?.pagename || 'Unknown Venue',
    address: fsEvent.venueInfo?.address || fsEvent.metadata?.address || venue?.address || '',
    latitude,
    longitude,

    // Date/time
    startDate: fsEvent.startDate || '',
    startTime: convert24to12Hour(fsEvent.startTime),
    endDate: fsEvent.endDate || fsEvent.startDate || '',
    endTime: fsEvent.endTime ? convert24to12Hour(fsEvent.endTime) : '',

    // Media
    imageUrl: fsEvent.metadata?.image || '',
    profileUrl: fsEvent.metadata?.icon || venue?.profileImage || '',
    SharedPostThumbnail: '',

    // Engagement metrics
    likes: fsEvent.metadata?.likes ?? 0,
    shares: fsEvent.metadata?.shares ?? 0,
    comments: fsEvent.metadata?.comments ?? 0,
    topReactionsCount: fsEvent.metadata?.topReactionsCount ?? 0,
    usersResponded: fsEvent.metadata?.usersResponded ?? '0',

    // Ticketing
    ticketPrice: fsEvent.price || '',
    ticketLinkPosts: fsEvent.ticketLinkPosts || fsEvent.metadata?.ticketLinkPosts || '',
    ticketLinkEvents: fsEvent.ticketLinkEvents || fsEvent.metadata?.ticketLinkEvents || '',

    // Additional media/details
    mediaUrls: fsEvent.metadata?.mediaUrls || [],
    facebookUrl: fsEvent.metadata?.facebookUrl || '',
    eventType: fsEvent.metadata?.eventType || '',
    ageRestriction: fsEvent.metadata?.ageRestriction || '',

    // Recurrence metadata (top-level backend contract, metadata fallback for safety)
    isRecurring: fsEvent.isRecurring ?? fsEvent.metadata?.isRecurring ?? false,
    recurringPattern: fsEvent.recurringPattern ?? fsEvent.metadata?.recurringPattern,
    isRecurringInstance:
      fsEvent.isRecurringInstance ?? fsEvent.metadata?.isRecurringInstance ?? false,
    originalEventId: rawOriginalEventId ? toAppEventId(rawOriginalEventId) : null,

    // Venue details
    venueWebsite: fsEvent.venueInfo?.website || venue?.website || '',
    venueRating: venue?.placeDetailsParsed?.rating ?? venue?.rating,
    venuePhone: venue?.placeDetailsParsed?.international_phone_number || venue?.phone || '',
    venueFacebookUrl: venue?.facebookUrl || '',
    venueInstagramUrl: venue?.instagramUrl || '',
    venueCategories: venue?.categories || (venue?.category1 ? [venue.category1] : []),
  };
}

/**
 * Fetch a single page of Firestore events.
 */
async function fetchFirestorePage({
  startAfter,
  isEvent,
  startDate,
  endDate,
  includeExpired,
  limit,
}: FirestorePageRequest): Promise<FirestoreEventsResponse> {
  const params = new URLSearchParams();
  params.set('limit', String(limit ?? FIRESTORE_PAGE_LIMIT));

  if (startAfter) {
    params.set('startAfter', startAfter);
  }

  if (typeof isEvent === 'boolean') {
    params.set('isEvent', String(isEvent));
  }

  if (startDate) {
    params.set('startDate', startDate);
  }

  if (endDate) {
    params.set('endDate', endDate);
  }

  params.set(
    'includeExpired',
    String(includeExpired ?? FIRESTORE_INCLUDE_EXPIRED_DEFAULT)
  );

  const url = `${FIRESTORE_API_BASE}/events?${params.toString()}`;
  const t0 = Date.now();
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Firestore API error: ${response.status} - ${errorText}`);
  }

  const data: FirestoreEventsResponse = await response.json();

  if (DEBUG_FIRESTORE) {
    console.log(
      `[Firestore][fetch] ms=${Date.now() - t0} events=${data.events?.length ?? 0} hasMore=${!!data.nextPageToken}`
    );
  }

  return data;
}

/**
 * Fetch a single Firestore event by ID using the detail endpoint.
 */
export async function fetchFirestoreEventById(
  eventId: string | number
): Promise<Event | null> {
  const firestoreId = toFirestoreEventId(eventId);
  if (!firestoreId) return null;

  const url = `${FIRESTORE_API_BASE}/events/${encodeURIComponent(firestoreId)}`;

  try {
    const t0 = Date.now();
    const response = await fetch(url);

    if (!response.ok) {
      if (DEBUG_FIRESTORE) {
        console.warn(`[Firestore][detail] Not found id=${firestoreId} status=${response.status}`);
      }
      return null;
    }

    const payload = await response.json();
    const rawEvent = (payload?.event || payload) as FirestoreEvent | null;

    if (!rawEvent || !rawEvent.id) {
      if (DEBUG_FIRESTORE) {
        console.warn(`[Firestore][detail] Unexpected payload for id=${firestoreId}`);
      }
      return null;
    }

    if (DEBUG_FIRESTORE) {
      console.log(`[Firestore][detail] ms=${Date.now() - t0} id=${firestoreId}`);
    }

    return normalizeFirestoreEvent(rawEvent);
  } catch (error) {
    console.error('[Firestore] Error fetching event details:', error);
    return null;
  }
}

/**
 * Fetch multiple Firestore event details.
 */
export async function fetchFirestoreEventDetailsBatch(
  eventIds: Array<string | number>
): Promise<Event[]> {
  const uniqueIds = Array.from(
    new Set(eventIds.map((id) => String(id ?? '').trim()).filter(Boolean))
  );

  if (uniqueIds.length === 0) return [];

  const responses = await Promise.all(uniqueIds.map((id) => fetchFirestoreEventById(id)));
  return responses.filter((event): event is Event => Boolean(event));
}

/**
 * Venue contact info structure returned by fetchVenueDetails.
 */
export interface VenueContactInfo {
  website?: string;
  facebook?: string;
  instagram?: string;
  phone?: string;
  email?: string;
  rating?: number;
}

/**
 * Fetch venue details by venue ID.
 */
export async function fetchVenueDetails(venueId: string): Promise<VenueContactInfo | null> {
  try {
    const url = `${FIRESTORE_API_BASE}/venues/${venueId}`;

    if (DEBUG_FIRESTORE) {
      console.log(`[Firestore][fetchVenueDetails] Fetching venue: ${venueId}`);
    }

    const t0 = Date.now();
    const response = await fetch(url);

    if (!response.ok) {
      if (DEBUG_FIRESTORE) {
        console.log(
          `[Firestore][fetchVenueDetails] Venue not found: ${venueId} (${response.status})`
        );
      }
      return null;
    }

    const venue = await response.json();

    if (DEBUG_FIRESTORE) {
      console.log(
        `[Firestore][fetchVenueDetails] ms=${Date.now() - t0} venue=${venue.pagename || venueId}`
      );
    }

    return {
      website: venue.website || venue.placeDetailsParsed?.website || undefined,
      facebook: venue.facebookUrl || undefined,
      instagram: venue.instagramUrl || undefined,
      phone: venue.placeDetailsParsed?.international_phone_number || venue.phone || undefined,
      email: venue.email || undefined,
      rating: venue.placeDetailsParsed?.rating ?? venue.rating ?? undefined,
    };
  } catch (error) {
    console.error('[Firestore] Error fetching venue details:', error);
    return null;
  }
}

/**
 * Fetch venue details by venue name (searches all venues).
 */
export async function fetchVenueDetailsByName(
  venueName: string
): Promise<VenueContactInfo | null> {
  try {
    const url = `${FIRESTORE_API_BASE}/venues`;

    if (DEBUG_FIRESTORE) {
      console.log(`[Firestore][fetchVenueDetailsByName] Searching for venue: ${venueName}`);
    }

    const t0 = Date.now();
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const venues = data.venues || data;

    if (!Array.isArray(venues)) {
      console.error('[Firestore] Unexpected venues response format:', typeof venues);
      return null;
    }

    const venueNameLower = venueName.toLowerCase();
    const matchedVenue = venues.find((v: any) => {
      const pagename = (v.pagename || '').toLowerCase();
      const title = (v.title || '').toLowerCase();

      return (
        pagename === venueNameLower ||
        title === venueNameLower ||
        pagename.includes(venueNameLower) ||
        title.includes(venueNameLower) ||
        venueNameLower.includes(pagename) ||
        venueNameLower.includes(title)
      );
    });

    if (!matchedVenue) {
      if (DEBUG_FIRESTORE) {
        console.log(`[Firestore][fetchVenueDetailsByName] No match found for: ${venueName}`);
      }
      return null;
    }

    if (DEBUG_FIRESTORE) {
      console.log(
        `[Firestore][fetchVenueDetailsByName] ms=${Date.now() - t0} matched=${matchedVenue.pagename || matchedVenue.title}`
      );
    }

    return {
      website: matchedVenue.website || matchedVenue.placeDetailsParsed?.website || undefined,
      facebook: matchedVenue.facebookUrl || undefined,
      instagram: matchedVenue.instagramUrl || undefined,
      phone:
        matchedVenue.placeDetailsParsed?.international_phone_number ||
        matchedVenue.phone ||
        undefined,
      email: matchedVenue.email || undefined,
      rating:
        matchedVenue.placeDetailsParsed?.rating ??
        matchedVenue.rating ??
        matchedVenue.ratingOverall ??
        undefined,
    };
  } catch (error) {
    console.error('[Firestore] Error fetching venue by name:', error);
    return null;
  }
}

/**
 * Fetch ALL Firestore events (handles pagination automatically).
 */
export async function fetchAllFirestoreEvents(
  options: FirestoreFetchOptions = {}
): Promise<Event[]> {
  const allRawEvents: FirestoreEvent[] = [];
  let nextPageToken: string | undefined;
  let pageCount = 0;

  const maxPages = options.maxPages ?? FIRESTORE_MAX_PAGES;
  const t0 = Date.now();

  try {
    do {
      const response = await fetchFirestorePage({
        ...options,
        startAfter: nextPageToken,
      });

      if (Array.isArray(response.events)) {
        allRawEvents.push(...response.events);
      }

      nextPageToken = response.nextPageToken;
      pageCount += 1;

      if (pageCount >= maxPages) {
        console.warn(`[Firestore] Reached max page limit (${maxPages}), stopping pagination`);
        break;
      }
    } while (nextPageToken);

    const byId = new Map<string, Event>();
    for (const raw of allRawEvents) {
      const normalized = normalizeFirestoreEvent(raw);
      byId.set(String(normalized.id), normalized);
    }

    const normalizedEvents = Array.from(byId.values());
    const eventsWithoutCoords = normalizedEvents.filter(
      (e) => e.latitude === 0 && e.longitude === 0
    ).length;

    if (DEBUG_FIRESTORE) {
      console.log(
        `[Firestore][fetchAll] totalMs=${Date.now() - t0} pages=${pageCount} rawEvents=${allRawEvents.length} normalized=${normalizedEvents.length}`
      );
      if (eventsWithoutCoords > 0) {
        console.warn(
          `[Firestore] WARNING: ${eventsWithoutCoords}/${normalizedEvents.length} events have no coordinates`
        );
      }
    }

    return normalizedEvents;
  } catch (error) {
    console.error('[Firestore] Error fetching events:', error);
    return [];
  }
}

