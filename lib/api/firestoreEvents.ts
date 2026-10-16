/**
 * Firestore Events API Service
 * Handles fetching, filtering, and pagination for Firestore-sourced events.
 */

import { Event, EventTiming } from '../../types/events';
import { FirestoreEvent, FirestoreEventsResponse } from '../../types/firestore';
import { auth } from '../../config/firebaseConfig';
import {
  FIRESTORE_API_BASE,
  FIRESTORE_INCLUDE_EXPIRED_DEFAULT,
  FIRESTORE_MAX_PAGES,
  FIRESTORE_PAGE_LIMIT,
} from '../config/backend';
import { isScopedLocationScope } from '../../utils/locationScope';
import { resolvePeiCityCentroid } from '../../utils/peiCityCentroids';
import {
  getTicketUrl,
  normalizeTicketPurchaseUrl,
  normalizeTicketUrl,
} from '../../utils/ticketUrls';
import { createLegacyTimingContract, getEventTiming } from '../../utils/eventTiming';
import { readEventAreaData, isExplicitTrue } from '../../utils/eventAreaData';
import { normalizeRecurrenceFlag } from '../../utils/eventRecurrence';
import { toFirestoreEventId, toAppEventId } from '../../utils/firestoreEventIds';
export { toFirestoreEventId, toAppEventId, areEventIdsEquivalent } from '../../utils/firestoreEventIds';

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

export interface EventFeedVersion {
  version: number | null;
  updatedAt: string | null;
}

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

const chooseProfileUrl = (
  venueProfileImage: string,
  eventProfileUrl: string
): string => {
  const venueUrl = String(venueProfileImage || '').trim();
  const eventUrl = String(eventProfileUrl || '').trim();

  // Venue profile is canonical and should win when available.
  if (venueUrl) return venueUrl;
  return eventUrl;
};

const firstText = (...values: Array<unknown>): string => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeContractTime = (value: unknown): string | null => {
  const raw = firstText(value);
  return raw ? convert24to12Hour(raw) : null;
};

export const normalizeFirestoreTiming = (fsEvent: FirestoreEvent): EventTiming => {
  const metadata = fsEvent.metadata || {};
  const rawTiming = fsEvent.timing ?? metadata.timing;
  if (rawTiming?.version === 2 && rawTiming.schedule?.start && rawTiming.schedule?.end) {
    return {
      ...rawTiming,
      timeZone: rawTiming.timeZone || 'America/Halifax',
      schedule: {
        start: {
          ...rawTiming.schedule.start,
          localDate: rawTiming.schedule.start.localDate || fsEvent.startDate,
          localTime: normalizeContractTime(rawTiming.schedule.start.localTime || fsEvent.startTime),
          timeZone: rawTiming.schedule.start.timeZone || rawTiming.timeZone || 'America/Halifax',
        },
        end: {
          ...rawTiming.schedule.end,
          localDate: rawTiming.schedule.end.localDate || null,
          localTime: normalizeContractTime(rawTiming.schedule.end.localTime),
          timeZone: rawTiming.schedule.end.timeZone || rawTiming.timeZone || 'America/Halifax',
        },
      },
      estimate: rawTiming.estimate
        ? {
            ...rawTiming.estimate,
            displayEndTime: normalizeContractTime(rawTiming.estimate.displayEndTime),
            discoveryCutoffTime: normalizeContractTime(rawTiming.estimate.discoveryCutoffTime),
          }
        : null,
    };
  }

  const timeFlags = isRecord(fsEvent.timeFlags)
    ? fsEvent.timeFlags
    : isRecord(metadata.timeFlags)
      ? metadata.timeFlags
      : null;
  const timeResolution = isRecord(fsEvent.timeResolution)
    ? fsEvent.timeResolution
    : isRecord(metadata.timeResolution)
      ? metadata.timeResolution
      : null;
  const endFlags = isRecord(timeFlags?.end) ? timeFlags.end : null;
  const endFlagSource = firstText(endFlags?.source).toLowerCase();
  const endResolutionMethod = firstText(timeResolution?.endFromHours);
  const inferredByLegacyResolver =
    endResolutionMethod === 'category_default' || endResolutionMethod === 'duration_default';
  const untilClose = endFlags?.toClose === true || endResolutionMethod === 'to_close';
  const explicitEnd =
    !inferredByLegacyResolver &&
    (endFlagSource === 'explicit' || Boolean(timeResolution?.endFromFacebookEvent));
  const endStatus = untilClose
    ? 'until_close'
    : explicitEnd
      ? 'observed'
      : 'unknown';

  return createLegacyTimingContract(
    {
      startDate: fsEvent.startDate || '',
      startTime: convert24to12Hour(fsEvent.startTime),
      endDate: fsEvent.endDate || fsEvent.startDate || '',
      endTime: fsEvent.endTime ? convert24to12Hour(fsEvent.endTime) : '',
    },
    {
      endStatus,
      scheduleKind: untilClose ? 'until_close' : undefined,
      endResolutionMethod: endResolutionMethod || null,
      endEvidence: firstText(endFlags?.evidence) || null,
      sourceUrl: firstText(fsEvent.sourceUrl, metadata.sourceUrl, metadata.facebookUrl) || null,
      estimateConfidence: 'low',
    }
  );
};

const normalizeSourcePlatform = (
  value: unknown
): NonNullable<Event['sharedEventProvenance']>['sourcePlatform'] => {
  const raw = String(value || '').toLowerCase();
  if (raw === 'facebook' || raw === 'instagram' || raw === 'web') return raw;
  return 'unknown';
};

const normalizeSourceVisibility = (
  value: unknown
): NonNullable<Event['sharedEventProvenance']>['sourceVisibility'] => {
  const raw = String(value || '').toLowerCase();
  if (
    raw === 'public_verified' ||
    raw === 'restricted_unverified' ||
    raw === 'user_private'
  ) {
    return raw;
  }
  return 'public_verified';
};

const normalizeRouting = (
  value: unknown
): NonNullable<Event['sharedEventProvenance']>['routing'] => {
  const raw = String(value || '').toLowerCase();
  if (
    raw === 'private_only' ||
    raw === 'public_candidate' ||
    raw === 'not_public_candidate'
  ) {
    return raw;
  }
  return 'public_candidate';
};

const sharedEventProvenanceForCurrentUser = (
  fsEvent: FirestoreEvent
): Event['sharedEventProvenance'] | undefined => {
  const metadata = fsEvent.metadata || {};
  const ownerUid = firstText(
    fsEvent.sharedEventOwnerUid,
    metadata.sharedEventOwnerUid
  );

  if (!ownerUid || ownerUid !== auth.currentUser?.uid) {
    return undefined;
  }

  return {
    sharedByCurrentUser: true,
    privateEventId: firstText(
      fsEvent.sharedEventPrivateEventId,
      metadata.sharedEventPrivateEventId
    ) || undefined,
    ingestId: firstText(
      fsEvent.sharedEventIngestId,
      metadata.sharedEventIngestId
    ) || undefined,
    publicCandidateId: firstText(
      fsEvent.sharedEventCandidateId,
      metadata.sharedEventCandidateId
    ) || undefined,
    sourcePlatform: normalizeSourcePlatform(
      fsEvent.sharedEventSourcePlatform ?? metadata.sharedEventSourcePlatform ?? 'facebook'
    ),
    sourceVisibility: normalizeSourceVisibility(
      fsEvent.sharedEventSourceVisibility ?? metadata.sharedEventSourceVisibility
    ),
    routing: normalizeRouting(fsEvent.sharedEventRouting ?? metadata.sharedEventRouting),
    sourceUrl: firstText(
      fsEvent.sourceUrl,
      metadata.sourceUrl,
      metadata.facebookUrl,
      metadata.cleanedFacebookUrl
    ) || undefined,
    label: 'Shared by you',
  };
};

/**
 * Normalize a Firestore event to match the app Event interface.
 */
export function normalizeFirestoreEvent(fsEvent: FirestoreEvent): Event {
  const rawVenue = fsEvent.venue;
  const venueRecord = isRecord(rawVenue) ? rawVenue : null;
  const venueText = typeof rawVenue === 'string' ? rawVenue : '';
  let latitude = fsEvent.venueInfo?.coordinates?.latitude ?? fsEvent.latitude ?? 0;
  let longitude = fsEvent.venueInfo?.coordinates?.longitude ?? fsEvent.longitude ?? 0;
  const locationScope = fsEvent.locationScope ?? fsEvent.metadata?.locationScope ?? null;
  const locationLabel = fsEvent.locationLabel ?? fsEvent.metadata?.locationLabel ?? null;
  const locationCity = fsEvent.locationCity ?? fsEvent.metadata?.locationCity ?? null;
  const scopedLocation = isScopedLocationScope(locationScope);
  const provinceScoped = locationScope === 'province';

  // A province projection can carry an internal discovery anchor, but that is
  // not a physical event destination. Keep it coordinate-less in app state;
  // the viewport partition handles province-wide discovery explicitly.
  if (provinceScoped) {
    latitude = 0;
    longitude = 0;
  } else if (scopedLocation && latitude === 0 && longitude === 0) {
    // Legacy city/area events were published without coordinates; place them
    // at their canonical local centroid so they can reach the Area experience.
    const centroid = resolvePeiCityCentroid({ locationScope, locationCity, locationLabel });
    if (centroid) {
      latitude = centroid.latitude;
      longitude = centroid.longitude;
    }
  }
  const venueProfileImage = fsEvent.venueInfo?.profileImage || venueRecord?.profileImage || '';
  const rawEventProfileUrl = fsEvent.profileUrl || fsEvent.metadata?.icon || '';
  const eventProfileUrl = chooseProfileUrl(venueProfileImage, rawEventProfileUrl);
  const eventImageUrl =
    fsEvent.imageUrl ||
    fsEvent.relevantImageUrl ||
    fsEvent.metadata?.image ||
    '';
  const sharedPostThumbnail = fsEvent.SharedPostThumbnail || '';

  if (latitude === 0 && longitude === 0 && DEBUG_FIRESTORE) {
    console.log(`[Firestore] Event with no coordinates: ${fsEvent.id} - ${fsEvent.title}`);
  }

  const rawOriginalEventId = fsEvent.originalEventId ?? fsEvent.metadata?.originalEventId ?? null;

  const rawDescription =
    fsEvent.fullDescription ??
    fsEvent.metadata?.fullDescription ??
    fsEvent.description ??
    '';
  const venueName = scopedLocation
    ? firstText(locationLabel, venueText, fsEvent.metadata?.establishment, fsEvent.address)
    : firstText(fsEvent.venueInfo?.name, fsEvent.metadata?.venueName, venueText, venueRecord?.pagename, 'Unknown Venue');
  const address = scopedLocation
    ? firstText(fsEvent.address, locationLabel, fsEvent.metadata?.address, venueRecord?.address)
    : firstText(fsEvent.venueInfo?.address, fsEvent.metadata?.address, fsEvent.address, venueRecord?.address);
  const ticketsBuyUrl =
    normalizeTicketPurchaseUrl(fsEvent.ticketsBuyUrl) ||
    normalizeTicketPurchaseUrl(fsEvent.metadata?.ticketsBuyUrl);
  const resolvedTicketUrl = getTicketUrl(fsEvent);

  return {
    // Preserve existing app expectation that Firestore IDs are namespaced.
    id: toAppEventId(fsEvent.id),

    // Type mapping: isEvent=false -> 'special', otherwise 'event' (including null)
    type: fsEvent.isEvent === false ? 'special' : 'event',

    // Source tracking
    source: 'firestore' as const,

    // Basic event info
    category: fsEvent.category || 'Other',
    familyFriendlyScore:
      fsEvent.familyFriendlyScore ?? fsEvent.metadata?.familyFriendlyScore ?? null,
    familyFriendlyLevel:
      fsEvent.familyFriendlyLevel ?? fsEvent.metadata?.familyFriendlyLevel ?? null,
    familyFriendlyReasons:
      fsEvent.familyFriendlyReasons ?? fsEvent.metadata?.familyFriendlyReasons ?? [],
    familyFriendlyScoringVersion:
      fsEvent.familyFriendlyScoringVersion ??
      fsEvent.metadata?.familyFriendlyScoringVersion ??
      null,
    title: fsEvent.title || '',
    description: rawDescription,
    // The collection-group endpoint derives a parent key such as
    // "province_pei" for feed projections. It is not a claimable venue.
    venueId: provinceScoped ? null : fsEvent.venueId ?? null,

    // Venue info (flattened from nested structure)
    venue: venueName,
    address,
    latitude,
    longitude,
    locationScope,
    locationLabel,
    locationCity,
    locationProvince: fsEvent.locationProvince ?? fsEvent.metadata?.locationProvince ?? null,
    locationPrecision: fsEvent.locationPrecision ?? fsEvent.metadata?.locationPrecision ?? null,
    locationReviewStatus:
      fsEvent.locationReviewStatus ?? fsEvent.metadata?.locationReviewStatus ?? null,
    mapMode: provinceScoped ? 'none' : fsEvent.mapMode ?? fsEvent.metadata?.mapMode ?? null,
    routeData: fsEvent.routeData ?? fsEvent.metadata?.routeData ?? null,
    areaData: readEventAreaData(fsEvent),
    status: fsEvent.status ?? fsEvent.metadata?.status,
    isCancelled: [fsEvent.isCancelled, fsEvent.cancelled, fsEvent.canceled, fsEvent.metadata?.isCancelled, fsEvent.metadata?.cancelled, fsEvent.metadata?.canceled].some(isExplicitTrue),
    isExpired: [fsEvent.isExpired, fsEvent.metadata?.isExpired].some(isExplicitTrue),

    // Date/time
    startDate: fsEvent.startDate || '',
    startTime: convert24to12Hour(fsEvent.startTime),
    endDate: fsEvent.endDate || fsEvent.startDate || '',
    endTime: fsEvent.endTime ? convert24to12Hour(fsEvent.endTime) : '',
    timing: getEventTiming({ startDate: fsEvent.startDate || '', startTime: fsEvent.startTime || '',
      endDate: fsEvent.endDate || fsEvent.startDate || '', endTime: fsEvent.endTime || '',
      locationScope, timing: normalizeFirestoreTiming(fsEvent) }),

    // Media
    imageUrl: eventImageUrl,
    relevantImageUrl: fsEvent.relevantImageUrl || fsEvent.metadata?.relevantImageUrl,
    profileUrl: eventProfileUrl,
    SharedPostThumbnail: sharedPostThumbnail,

    // Engagement metrics
    likes: fsEvent.metadata?.likes ?? 0,
    shares: fsEvent.metadata?.shares ?? 0,
    comments: fsEvent.metadata?.comments ?? 0,
    topReactionsCount: fsEvent.metadata?.topReactionsCount ?? 0,
    usersResponded: fsEvent.metadata?.usersResponded ?? '0',

    // Ticketing
    // `ticketsBuyUrl` explicitly represents a purchase action. When the
    // backend has no display price, reuse the app's existing non-price marker
    // so the CTA says "Buy Tickets" rather than "Register".
    ticketPrice: fsEvent.price || (ticketsBuyUrl ? 'Ticketed Event' : ''),
    ticketLinkPosts:
      normalizeTicketUrl(fsEvent.ticketLinkPosts) ||
      normalizeTicketUrl(fsEvent.metadata?.ticketLinkPosts),
    // Canonicalize the best backend ticket URL into the field consumed by all
    // existing app surfaces. This also keeps older clients/components working.
    ticketLinkEvents: resolvedTicketUrl,
    ticketsBuyUrl,
    ticketLink:
      normalizeTicketUrl(fsEvent.ticketLink) ||
      normalizeTicketUrl(fsEvent.metadata?.ticketLink),
    actionLinks: Array.isArray(fsEvent.actionLinks)
      ? fsEvent.actionLinks
      : Array.isArray(fsEvent.metadata?.actionLinks)
        ? fsEvent.metadata.actionLinks
        : [],

    // Additional media/details
    mediaUrls: Array.isArray(fsEvent.mediaUrls)
      ? fsEvent.mediaUrls
      : fsEvent.metadata?.mediaUrls || [],
    sourceUrl: firstText(fsEvent.sourceUrl, fsEvent.metadata?.sourceUrl) || undefined,
    sourceUniqueId: firstText(fsEvent.metadata?.uniqueId) || undefined,
    facebookUrl: firstText(
      fsEvent.metadata?.facebookUrl,
      fsEvent.metadata?.cleanedFacebookUrl
    ),
    eventType: fsEvent.metadata?.eventType || '',
    ageRestriction: fsEvent.metadata?.ageRestriction || '',

    // Recurrence metadata (top-level backend contract, metadata fallback for safety)
    isRecurring: normalizeRecurrenceFlag(fsEvent.isRecurring ?? fsEvent.metadata?.isRecurring),
    recurringPattern: fsEvent.recurringPattern ?? fsEvent.metadata?.recurringPattern,
    recurrenceUntilDate:
      fsEvent.recurrenceUntilDate ?? fsEvent.metadata?.recurrenceUntilDate,
    isRecurringInstance:
      normalizeRecurrenceFlag(fsEvent.isRecurringInstance ?? fsEvent.metadata?.isRecurringInstance),
    originalEventId: rawOriginalEventId ? toAppEventId(rawOriginalEventId) : null,

    // Venue details
    venueWebsite: fsEvent.venueInfo?.website || venueRecord?.website || '',
    venueRating: venueRecord?.placeDetailsParsed?.rating ?? venueRecord?.rating,
    venuePhone:
      venueRecord?.placeDetailsParsed?.international_phone_number || venueRecord?.phone || '',
    venueFacebookUrl: venueRecord?.facebookUrl || '',
    venueInstagramUrl: venueRecord?.instagramUrl || '',
    venueCategories: venueRecord?.categories || (venueRecord?.category1 ? [venueRecord.category1] : []),
    sharedEventProvenance: sharedEventProvenanceForCurrentUser(fsEvent),
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
  // Declare only alongside the reviewed date-only UI and calendar safeguards.
  params.set('dateOnlyActivities', 'v1');

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
 * Fetch the compact parser-maintained feed marker. This is used by the active
 * 10-minute refresh loop to avoid re-downloading every event when nothing has
 * changed. Callers must fall back to a full fetch if it is unavailable.
 */
export async function fetchEventFeedVersion(): Promise<EventFeedVersion> {
  const response = await fetch(`${FIRESTORE_API_BASE}/events/version`);
  if (!response.ok) {
    throw new Error(`Firestore event feed version error: ${response.status}`);
  }

  const payload = await response.json();
  const version = Number(payload?.version);
  return {
    version: Number.isFinite(version) ? version : null,
    updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : null,
  };
}

/**
 * Fetch a single Firestore event by ID using the detail endpoint.
 */
export async function fetchFirestoreEventById(
  eventId: string | number
): Promise<Event | null> {
  const firestoreId = toFirestoreEventId(eventId);
  if (!firestoreId) return null;

  const url = `${FIRESTORE_API_BASE}/events/${encodeURIComponent(firestoreId)}?dateOnlyActivities=v1`;

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
  profileImage?: string;
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

    const payload = await response.json();
    const venue = payload?.venue || payload;

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
      profileImage: venue.profileImage || undefined,
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
      profileImage: matchedVenue.profileImage || undefined,
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

export type FirestoreEventStatus = { status: 'found'; event: Event } | { status: 'unavailable' };

/** Only explicit absence may remove a cached activity; transient failures must throw. */
export async function fetchFirestoreEventStatus(eventId: string | number, signal?: AbortSignal): Promise<FirestoreEventStatus> {
  const id = toFirestoreEventId(eventId);
  if (!id) throw new Error('Invalid event identity');
  const response = await fetch(`${FIRESTORE_API_BASE}/events/${encodeURIComponent(id)}?dateOnlyActivities=v1`, { signal });
  if (response.status === 404 || response.status === 410) return { status: 'unavailable' };
  if (!response.ok) throw new Error('Event detail request failed: ' + response.status);
  const payload = await response.json();
  const raw = payload?.event || payload;
  const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(new Date(value + 'T00:00:00Z').getTime())
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  if (!raw || toFirestoreEventId(raw.id) !== id || typeof raw.title !== 'string' || !raw.title.trim()
    || typeof raw.venueId !== 'string' || !raw.venueId.trim() || !validDate(raw.startDate)
    || (raw.endDate && !validDate(raw.endDate))) throw new Error('Malformed event detail response');
  return { status: 'found', event: normalizeFirestoreEvent(raw as FirestoreEvent) };
}

/** Parent detail validation accepts area roots without a venue ID. Child loader contract stays unchanged. */
export async function fetchFirestoreMembershipRoot(eventId: string | number, signal?: AbortSignal): Promise<FirestoreEventStatus> {
  const id = toFirestoreEventId(eventId);
  if (!id) throw new Error('Invalid parent identity');
  const response = await fetch(`${FIRESTORE_API_BASE}/events/${encodeURIComponent(id)}?dateOnlyActivities=v1`, { signal });
  if (response.status === 404 || response.status === 410) return { status: 'unavailable' };
  if (!response.ok) throw new Error('Parent detail request failed: ' + response.status);
  const payload = await response.json();
  const raw = payload?.event || payload;
  const scope = raw?.locationScope ?? raw?.metadata?.locationScope;
  const area = raw ? readEventAreaData(raw) : null;
  const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(new Date(value + 'T00:00:00Z').getTime())
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  if (!raw || toFirestoreEventId(raw.id) !== id || typeof raw.title !== 'string' || !raw.title.trim()
    || !date(raw.startDate) || raw.endDate && !date(raw.endDate)
    || !(['area', 'city', 'venue', 'route', 'province'].includes(scope) || typeof raw.venueId === 'string' && raw.venueId.trim())
    || area != null && (typeof area !== 'object' || area.version !== 1 || !Array.isArray(area.locations))) throw new Error('Malformed parent detail response');
  return { status: 'found', event: normalizeFirestoreEvent(raw as FirestoreEvent) };
}
