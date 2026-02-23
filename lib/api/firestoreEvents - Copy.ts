/**
 * Firestore Events API Service
 * Handles fetching and pagination for Firestore-sourced events
 */

import { Event } from '../../types/events';
import { FirestoreEvent, FirestoreEventsResponse } from '../../types/firestore';

const FIRESTORE_API_BASE = 'https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore';

// Debug flag for logging
const DEBUG_FIRESTORE = __DEV__ ?? true;

/**
 * Convert 24-hour time format to 12-hour format with AM/PM
 * "14:00" -> "2:00:00 PM"
 * "09:30" -> "9:30:00 AM"
 * "00:00" -> "12:00:00 AM"
 */
export function convert24to12Hour(time24: string): string {
  if (!time24) return '';

  const parts = time24.split(':');
  if (parts.length < 2) return time24;

  let hour = parseInt(parts[0], 10);
  const minute = parts[1] || '00';

  if (isNaN(hour)) return time24;

  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12; // Convert 0 to 12, 13-23 to 1-11

  return `${hour}:${minute}:00 ${period}`;
}

/**
 * Normalize a Firestore event to match the unified Event interface
 */
export function normalizeFirestoreEvent(fsEvent: FirestoreEvent): Event {
  // Extract coordinates with fallback
  const latitude = fsEvent.venueInfo?.coordinates?.latitude ?? 0;
  const longitude = fsEvent.venueInfo?.coordinates?.longitude ?? 0;

  // Log events without valid coordinates (for debugging)
  if (latitude === 0 && longitude === 0) {
    if (DEBUG_FIRESTORE) {
      console.log(`[Firestore] Event with no coordinates: ${fsEvent.id} - ${fsEvent.title}`);
    }
  }

  // Get venue object if present (from single-event endpoint)
  const venue = fsEvent.venue;

  return {
    // ID: ensure it has fb_ prefix for identification
    id: fsEvent.id.startsWith('fb_') ? fsEvent.id : `fb_${fsEvent.id}`,

    // Type mapping: isEvent=false -> 'special', otherwise 'event' (including null)
    type: fsEvent.isEvent === false ? 'special' : 'event',

    // Source tracking
    source: 'firestore' as const,

    // Basic event info
    category: fsEvent.category || 'Other',
    title: fsEvent.title || '',
    description: fsEvent.description || '',

    // Venue info (flattened from nested structure)
    venue: fsEvent.venueInfo?.name || fsEvent.metadata?.venueName || venue?.pagename || 'Unknown Venue',
    address: fsEvent.venueInfo?.address || fsEvent.metadata?.address || venue?.address || '',
    latitude,
    longitude,

    // Date/time (convert 24h to 12h format for consistency)
    startDate: fsEvent.startDate || '',
    startTime: convert24to12Hour(fsEvent.startTime),
    endDate: fsEvent.endDate || fsEvent.startDate || '',
    endTime: fsEvent.endTime ? convert24to12Hour(fsEvent.endTime) : '',

    // Media - use venue.profileImage as fallback for profileUrl
    imageUrl: fsEvent.metadata?.image || '',
    profileUrl: fsEvent.metadata?.icon || venue?.profileImage || '',
    SharedPostThumbnail: '',

    // Engagement metrics (from metadata)
    likes: fsEvent.metadata?.likes ?? 0,
    shares: fsEvent.metadata?.shares ?? 0,
    comments: fsEvent.metadata?.comments ?? 0,
    topReactionsCount: fsEvent.metadata?.topReactionsCount ?? 0,
    usersResponded: fsEvent.metadata?.usersResponded ?? '0',

    // Placeholder fields (match existing interface requirements)
    ticketPrice: fsEvent.price || '',
    ticketLinkPosts: '',
    ticketLinkEvents: '',

    // NEW: Additional media (multiple images)
    mediaUrls: fsEvent.metadata?.mediaUrls || [],

    // NEW: Event details from metadata
    facebookUrl: fsEvent.metadata?.facebookUrl || '',
    eventType: fsEvent.metadata?.eventType || '',
    ageRestriction: fsEvent.metadata?.ageRestriction || '',

    // NEW: Venue details (from venueInfo and venue object if present)
    venueWebsite: fsEvent.venueInfo?.website || venue?.website || '',
    venueRating: venue?.placeDetailsParsed?.rating ?? venue?.rating,
    venuePhone: venue?.placeDetailsParsed?.international_phone_number || venue?.phone || '',
    venueFacebookUrl: venue?.facebookUrl || '',
    venueInstagramUrl: venue?.instagramUrl || '',
    venueCategories: venue?.categories || (venue?.category1 ? [venue.category1] : []),
  };
}

/**
 * Fetch a single page of Firestore events
 */
async function fetchFirestorePage(
  startAfter?: string
): Promise<FirestoreEventsResponse> {
  // Build URL with optional pagination cursor
  const params = new URLSearchParams();
  params.set('limit', '100'); // Max allowed by API

  if (startAfter) {
    params.set('startAfter', startAfter);
  }

  const url = `${FIRESTORE_API_BASE}/events?${params.toString()}`;

  const t0 = Date.now();
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Firestore API error: ${response.status} - ${errorText}`);
  }

  const data: FirestoreEventsResponse = await response.json();

  if (DEBUG_FIRESTORE) {
    console.log(`[Firestore][fetch] ms=${Date.now() - t0} events=${data.events?.length ?? 0} hasMore=${!!data.nextPageToken}`);
  }

  return data;
}

/**
 * Venue contact info structure returned by fetchVenueDetails
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
 * Fetch venue details by venue ID
 * Returns contact info (website, social links, phone, rating)
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
        console.log(`[Firestore][fetchVenueDetails] Venue not found: ${venueId} (${response.status})`);
      }
      return null;
    }

    const venue = await response.json();

    if (DEBUG_FIRESTORE) {
      console.log(`[Firestore][fetchVenueDetails] ms=${Date.now() - t0} venue=${venue.pagename || venueId}`);
    }

    // Extract contact info from venue object
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
 * Fetch venue details by venue name (searches all venues)
 * Useful when we only have the venue name, not the ID
 */
export async function fetchVenueDetailsByName(venueName: string): Promise<VenueContactInfo | null> {
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

    // API returns { venues: [...] } not a direct array
    const venues = data.venues || data;

    if (!Array.isArray(venues)) {
      console.error('[Firestore] Unexpected venues response format:', typeof venues);
      return null;
    }

    // Find venue by name (case-insensitive partial match)
    // Check both 'pagename' and 'title' fields as the API may use either
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
      console.log(`[Firestore][fetchVenueDetailsByName] ms=${Date.now() - t0} matched=${matchedVenue.pagename || matchedVenue.title}`);
    }

    return {
      website: matchedVenue.website || matchedVenue.placeDetailsParsed?.website || undefined,
      facebook: matchedVenue.facebookUrl || undefined,
      instagram: matchedVenue.instagramUrl || undefined,
      phone: matchedVenue.placeDetailsParsed?.international_phone_number || matchedVenue.phone || undefined,
      email: matchedVenue.email || undefined,
      rating: matchedVenue.placeDetailsParsed?.rating ?? matchedVenue.rating ?? matchedVenue.ratingOverall ?? undefined,
    };
  } catch (error) {
    console.error('[Firestore] Error fetching venue by name:', error);
    return null;
  }
}

/**
 * Fetch ALL Firestore events (handles pagination automatically)
 *
 * @param maxPages - Safety limit to prevent infinite loops (default: 10)
 * @returns Normalized Event[] array
 */
export async function fetchAllFirestoreEvents(maxPages: number = 10): Promise<Event[]> {
  const allRawEvents: FirestoreEvent[] = [];
  let nextPageToken: string | undefined = undefined;
  let pageCount = 0;

  const t0 = Date.now();

  try {
    do {
      const response = await fetchFirestorePage(nextPageToken);

      if (response.events && Array.isArray(response.events)) {
        allRawEvents.push(...response.events);
      }

      nextPageToken = response.nextPageToken;
      pageCount++;

      // Safety check to prevent infinite loops
      if (pageCount >= maxPages) {
        console.warn(`[Firestore] Reached max page limit (${maxPages}), stopping pagination`);
        break;
      }
    } while (nextPageToken);

    // Normalize all events to unified format
    const normalizedEvents = allRawEvents.map(normalizeFirestoreEvent);

    // Count events without coordinates (need backend fix)
    const eventsWithoutCoords = normalizedEvents.filter(e => e.latitude === 0 && e.longitude === 0).length;

    if (DEBUG_FIRESTORE) {
      console.log(`[Firestore][fetchAll] totalMs=${Date.now() - t0} pages=${pageCount} rawEvents=${allRawEvents.length} normalized=${normalizedEvents.length}`);
      if (eventsWithoutCoords > 0) {
        console.warn(`[Firestore] WARNING: ${eventsWithoutCoords}/${normalizedEvents.length} events have no coordinates (backend needs to return venueInfo.coordinates)`);
      }
    }

    return normalizedEvents;

  } catch (error) {
    console.error('[Firestore] Error fetching events:', error);
    // Return empty array on error - graceful degradation
    return [];
  }
}
