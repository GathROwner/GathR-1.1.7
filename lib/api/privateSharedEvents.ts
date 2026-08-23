import { collection, getDocs, getDocsFromServer, query, where } from 'firebase/firestore';

import { auth, firestore } from '../../config/firebaseConfig';
import { Event } from '../../types/events';
import {
  FIRESTORE_API_BASE,
  FIRESTORE_MAX_PAGES,
  FIRESTORE_PAGE_LIMIT,
} from '../config/backend';
import { convert24to12Hour } from './firestoreEvents';
import { normalizeVenueIdentityText } from '../../utils/venueIdentity';
import type {
  EventCategory,
  GathrCategory,
  SpecialCategory,
} from '../../constants/eventCategories';

type SharedEventSourcePlatform = 'facebook' | 'instagram' | 'web' | 'unknown';
type SharedEventSourceVisibility =
  | 'public_verified'
  | 'restricted_unverified'
  | 'user_private'
  | 'unknown';
type SharedEventRouting = 'private_only' | 'public_candidate' | 'not_public_candidate';

type PrivateSharedEventDoc = {
  ownerUid?: string;
  ingestId?: string;
  publicCandidateId?: string;
  sourceUrl?: string;
  sourcePlatform?: SharedEventSourcePlatform;
  sourceVisibility?: SharedEventSourceVisibility;
  routing?: SharedEventRouting;
  status?: 'needs_user_review' | 'saved' | 'submitted_public_candidate' | 'expired';
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  locationPrecision?: 'exact' | 'approximate' | 'none';
  locationScope?: 'venue' | 'route' | 'unknown';
  mapMode?: 'venue' | 'route' | 'none';
  contentKind?: 'event' | 'special';
  price?: string;
  recurringPattern?: string;
  recurringDaysOfWeek?: string[];
  recurrenceUntilDate?: string;
  mediaUrls?: string[];
  timezone?: string;
  reviewReasons?: string[];
  isExpired?: boolean;
  visibilityEvidence?: {
    imageUrl?: string;
    locationName?: string;
    address?: string;
    sourcePostId?: string;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
};

type VenueDirectoryEntry = {
  id?: string;
  name?: string;
  pagename?: string;
  title?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  profileImage?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  website?: string;
  phone?: string;
  categories?: string[];
  category1?: string;
  aliases?: string[];
  aliasesNormalized?: string[];
  normalizedName?: string;
  coordinates?: {
    latitude?: number;
    longitude?: number;
    lat?: number;
    lng?: number;
  };
  placeDetailsParsed?: {
    formatted_address?: string;
    international_phone_number?: string;
    website?: string;
    rating?: number;
  };
  rating?: number;
  ratingOverall?: number;
};

type VenueDirectoryResponse = {
  venues?: VenueDirectoryEntry[];
  nextPageToken?: string;
  pageLimit?: number;
};

let venueDirectoryPromise: Promise<VenueDirectoryEntry[]> | null = null;

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const firstFiniteNumber = (...values: unknown[]): number => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return Number.NaN;
};

const toTitleCase = (value: string): string =>
  value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

const extractLocationDetail = (rawLocation: string, canonicalVenueName: string): string => {
  const normalizedLocation = normalizeText(rawLocation);
  const normalizedVenue = normalizeText(canonicalVenueName);
  if (!normalizedLocation || !normalizedVenue || normalizedLocation === normalizedVenue) {
    return '';
  }

  const locationTokens = normalizedLocation.split(' ').filter(Boolean);
  const venueTokens = normalizedVenue.split(' ').filter(Boolean);
  const startsWithVenue =
    venueTokens.length > 0 &&
    venueTokens.every((token, index) => locationTokens[index] === token);

  if (!startsWithVenue) {
    return '';
  }

  const detail = locationTokens.slice(venueTokens.length).join(' ').trim();
  return detail ? toTitleCase(detail) : '';
};

const withLocationDetail = (description: string, locationDetail: string): string => {
  if (!locationDetail) return description;
  if (normalizeText(description).includes(normalizeText(locationDetail))) {
    return description;
  }
  return firstText(description)
    ? `Location: ${locationDetail}. ${description}`
    : `Location: ${locationDetail}.`;
};

const hasUsableDate = (event: PrivateSharedEventDoc): boolean =>
  Boolean(String(event.startDate || '').trim());

const isExpiredForDisplay = (event: PrivateSharedEventDoc): boolean => {
  if (event.status === 'expired' || event.isExpired) return true;
  const endDate = String(event.recurrenceUntilDate || event.endDate || event.startDate || '').trim();
  if (!endDate) return false;

  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  return endDate < todayKey;
};

const inferType = (event: PrivateSharedEventDoc): Event['type'] => {
  if (event.contentKind === 'event' || event.contentKind === 'special') return event.contentKind;
  const text = normalizeText(`${event.title || ''} ${event.description || ''}`);
  if (/\b(happy hour|specials?|deal|discount|menu|brunch|patio|food|burger|bbq|wing night)\b/.test(text)) {
    return 'special';
  }
  return 'event';
};

const inferEventCategoryFromText = (text: string): EventCategory | null => {
  if (/\btrivia\b/.test(text)) return 'Trivia Night';
  if (/\b(comedy|comedian|stand up|improv)\b/.test(text)) return 'Comedy';
  if (/\b(workshops?|classes?|lessons?|courses?|seminars?)\b/.test(text)) return 'Workshops & Classes';
  if (/\b(church|religious|worship|faith|service)\b/.test(text)) return 'Religious';
  if (/\b(run|race|soccer|football|hockey|baseball|basketball|sports?|game|match|wellness|yoga)\b/.test(text)) return 'Sports';
  if (/\b(family|families|kids?|children|all ages)\b/.test(text)) return 'Family Friendly';
  if (/\b(cinema|movie|movies|film|screening)\b/.test(text)) return 'Cinema';
  if (/\b(live entertainment|music|musical|band|dj|concert|jazz|acoustic|singer|songwriter|performer)\b/.test(text)) return 'Live Music';
  if (/\b(gathering|party|dance|festival|market|vendors?|fair|social)\b/.test(text)) return 'Gatherings & Parties';
  return null;
};

const inferSpecialCategory = (text: string): SpecialCategory => {
  if (/\bhappy hour\b/.test(text)) return 'Happy Hour';
  if (/\b(drinks?|beverages?|cocktails?|beer|wine|shots?|spirits?|pints?)\b/.test(text)) return 'Drink Special';
  return 'Food Special';
};

export const inferPrivateSharedCategoryForRegression = (
  event: PrivateSharedEventDoc
): GathrCategory => {
  const type = inferType(event);
  const title = normalizeText(event.title);
  const text = normalizeText(`${event.title || ''} ${event.description || ''}`);

  if (type === 'special') return inferSpecialCategory(text);

  // Let the event's own title define a component before consulting supporting
  // flyer copy. This keeps an Inside Market parent distinct from its nested
  // live-music event even though each description may mention the other.
  return inferEventCategoryFromText(title) ??
    inferEventCategoryFromText(text) ??
    'Gatherings & Parties';
};

const fetchVenueDirectory = async (): Promise<VenueDirectoryEntry[]> => {
  if (venueDirectoryPromise) return venueDirectoryPromise;

  venueDirectoryPromise = (async () => {
    const venues: VenueDirectoryEntry[] = [];
    let nextPageToken: string | undefined;
    let pageCount = 0;

    do {
      const params = new URLSearchParams();
      params.set('limit', String(FIRESTORE_PAGE_LIMIT));
      if (nextPageToken) {
        params.set('startAfter', nextPageToken);
      }

      const response = await fetch(`${FIRESTORE_API_BASE}/venues?${params.toString()}`);
      if (!response.ok) break;

      const payload = (await response.json()) as VenueDirectoryResponse | VenueDirectoryEntry[];
      const rows = Array.isArray(payload) ? payload : payload?.venues;
      if (Array.isArray(rows)) {
        venues.push(...rows);
      }

      nextPageToken = Array.isArray(payload) ? undefined : payload?.nextPageToken;
      pageCount += 1;
    } while (nextPageToken && pageCount < FIRESTORE_MAX_PAGES);

    return venues;
  })().catch((error) => {
      console.warn('[PrivateSharedEvents] Failed to fetch venue directory:', error);
      return [];
    });

  return venueDirectoryPromise;
};

const matchVenue = (
  event: PrivateSharedEventDoc,
  venues: VenueDirectoryEntry[]
): VenueDirectoryEntry | null => {
  const locationName = normalizeText(
    firstText(event.locationName, event.visibilityEvidence?.locationName)
  );
  const locationIdentity = normalizeVenueIdentityText(
    firstText(event.locationName, event.visibilityEvidence?.locationName)
  );
  const address = normalizeText(firstText(event.address, event.visibilityEvidence?.address));

  if (!locationName && !address) return null;

  return venues.find((venue) => {
    const venueNames = [
      firstText(venue.pagename, venue.name, venue.title),
      venue.normalizedName,
      ...(Array.isArray(venue.aliases) ? venue.aliases : []),
      ...(Array.isArray(venue.aliasesNormalized) ? venue.aliasesNormalized : []),
    ].map(normalizeVenueIdentityText).filter(Boolean);
    const venueAddress = normalizeText(firstText(venue.address, venue.placeDetailsParsed?.formatted_address));
    const nameMatches =
      Boolean(locationIdentity && venueNames.length) &&
      venueNames.some((venueName) =>
        venueName === locationIdentity ||
        venueName.includes(locationIdentity) ||
        locationIdentity.includes(venueName)
      );
    const addressMatches =
      Boolean(address && venueAddress) &&
      (venueAddress.includes(address) || address.includes(venueAddress));

    return nameMatches || addressMatches;
  }) ?? null;
};

export const normalizePrivateSharedEventForRegression = (
  id: string,
  event: PrivateSharedEventDoc,
  venue: VenueDirectoryEntry | null
): Event | null => {
  if (!hasUsableDate(event) || isExpiredForDisplay(event)) return null;

  const resolvedVenue = venue || {};
  const latitude = firstFiniteNumber(
    event.latitude,
    resolvedVenue.latitude,
    resolvedVenue.lat,
    resolvedVenue.coordinates?.latitude,
    resolvedVenue.coordinates?.lat
  );
  const longitude = firstFiniteNumber(
    event.longitude,
    resolvedVenue.longitude,
    resolvedVenue.lng,
    resolvedVenue.coordinates?.longitude,
    resolvedVenue.coordinates?.lng
  );
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
    return null;
  }

  const canonicalVenueName = firstText(resolvedVenue.pagename, resolvedVenue.name, resolvedVenue.title, event.locationName, event.visibilityEvidence?.locationName, 'Shared location');
  const parsedLocationName = firstText(event.locationName, event.visibilityEvidence?.locationName);
  const locationDetail = extractLocationDetail(parsedLocationName, canonicalVenueName);
  const address = firstText(event.address, event.visibilityEvidence?.address, resolvedVenue.address, resolvedVenue.placeDetailsParsed?.formatted_address);
  const mediaUrls = Array.isArray(event.mediaUrls) ? event.mediaUrls.filter(Boolean) : [];
  const imageUrl = firstText(mediaUrls[0], event.visibilityEvidence?.imageUrl);
  const description = withLocationDetail(firstText(event.description), locationDetail);
  const startTime = convert24to12Hour(String(event.startTime || ''));
  const endTime = convert24to12Hour(String(event.endTime || ''));

  return {
    id: `shared_${id}`,
    type: inferType(event),
    source: 'private_shared',
    category: inferPrivateSharedCategoryForRegression(event),
    title: firstText(event.title, 'Shared event'),
    description,
    venueId: resolvedVenue.id ?? null,
    venue: canonicalVenueName,
    address,
    latitude,
    longitude,
    startDate: String(event.startDate || ''),
    endDate: String(event.endDate || event.startDate || ''),
    startTime,
    endTime,
    ticketPrice: firstText(event.price),
    profileUrl: firstText(resolvedVenue.profileImage),
    imageUrl,
    SharedPostThumbnail: '',
    ticketLinkPosts: '',
    ticketLinkEvents: '',
    mediaUrls,
    locationLabel: locationDetail || null,
    locationScope: event.locationScope || (resolvedVenue.id ? 'venue' : 'unknown'),
    locationPrecision: event.locationPrecision || (resolvedVenue.id ? 'exact' : null),
    mapMode: event.mapMode || 'venue',
    isRecurring: Boolean(event.recurringPattern && event.recurringPattern !== 'none'),
    recurringPattern: event.recurringPattern,
    facebookUrl: firstText(event.sourceUrl),
    venueWebsite: firstText(resolvedVenue.website, resolvedVenue.placeDetailsParsed?.website),
    venuePhone: firstText(resolvedVenue.phone, resolvedVenue.placeDetailsParsed?.international_phone_number),
    venueFacebookUrl: firstText(resolvedVenue.facebookUrl),
    venueInstagramUrl: firstText(resolvedVenue.instagramUrl),
    venueCategories: resolvedVenue.categories || (resolvedVenue.category1 ? [resolvedVenue.category1] : []),
    venueRating: resolvedVenue.placeDetailsParsed?.rating ?? resolvedVenue.rating ?? resolvedVenue.ratingOverall,
    sharedEventProvenance: {
      sharedByCurrentUser: true,
      privateEventId: id,
      ingestId: event.ingestId,
      publicCandidateId: event.publicCandidateId,
      sourcePlatform: event.sourcePlatform || 'unknown',
      sourceVisibility: event.sourceVisibility || 'unknown',
      routing: event.routing,
      sourceUrl: event.sourceUrl,
      label: 'Shared by you',
    },
  };
};

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const PRIVATE_RECURRENCE_HORIZON_DAYS = 180;
const PRIVATE_RECURRENCE_MAX_OCCURRENCES = 400;

const parseDateKeyUtc = (value: string): Date | null => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateKeyUtc = (date: Date): string => date.toISOString().slice(0, 10);

const addUtcDays = (date: Date, days: number): Date => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const recurrenceWeekdays = (event: PrivateSharedEventDoc): Set<number> => {
  const explicit = Array.isArray(event.recurringDaysOfWeek)
    ? event.recurringDaysOfWeek
      .map((day) => WEEKDAY_INDEX[normalizeText(day)])
      .filter((day): day is number => Number.isInteger(day))
    : [];
  if (explicit.length > 0) return new Set(explicit);
  const match = String(event.recurringPattern || '').toLowerCase().match(/^weekly_([a-z]+)$/);
  const single = match ? WEEKDAY_INDEX[match[1]] : undefined;
  return Number.isInteger(single) ? new Set([single!]) : new Set();
};

export const expandPrivateSharedEventRecurrenceForRegression = (
  base: Event,
  event: PrivateSharedEventDoc,
  options?: { todayKey?: string; horizonDays?: number }
): Event[] => {
  const pattern = String(event.recurringPattern || '').trim().toLowerCase();
  if (!pattern || pattern === 'none') return [base];
  const start = parseDateKeyUtc(base.startDate);
  if (!start) return [base];

  const explicitEnd = parseDateKeyUtc(String(event.recurrenceUntilDate || ''));
  const today = parseDateKeyUtc(String(options?.todayKey || '')) || new Date();
  const horizonDays = Math.max(1, Math.min(366, options?.horizonDays || PRIVATE_RECURRENCE_HORIZON_DAYS));
  const horizon = addUtcDays(today, horizonDays);
  const end = explicitEnd || horizon;
  if (end < start) return [];

  const baseEnd = parseDateKeyUtc(base.endDate) || start;
  const durationDays = Math.max(0, Math.round((baseEnd.getTime() - start.getTime()) / 86400000));
  const weekdays = recurrenceWeekdays(event);
  const occursOn = (date: Date): boolean => {
    if (pattern === 'daily') return true;
    if (pattern === 'weekly_custom' || pattern.startsWith('weekly_')) {
      return weekdays.has(date.getUTCDay());
    }
    return dateKeyUtc(date) === base.startDate;
  };

  const originalEventId = String(base.id);
  const occurrences: Event[] = [];
  for (let cursor = start; cursor <= end && occurrences.length < PRIVATE_RECURRENCE_MAX_OCCURRENCES; cursor = addUtcDays(cursor, 1)) {
    if (!occursOn(cursor)) continue;
    const startDate = dateKeyUtc(cursor);
    occurrences.push({
      ...base,
      id: `${originalEventId}_${startDate}`,
      startDate,
      endDate: dateKeyUtc(addUtcDays(cursor, durationDays)),
      isRecurring: true,
      isRecurringInstance: true,
      originalEventId,
    });
  }
  return occurrences.length > 0 ? occurrences : [base];
};

export const isSharedEventFromCurrentUser = (event: Pick<Event, 'sharedEventProvenance'>): boolean =>
  event.sharedEventProvenance?.sharedByCurrentUser === true;

export const isPrivateSharedEventId = (id: string | number | null | undefined): boolean =>
  String(id ?? '').startsWith('shared_');

export async function fetchPrivateSharedEventsForCurrentUser(
  options: { forceServer?: boolean } = {}
): Promise<Event[]> {
  const user = auth.currentUser;
  if (!user?.uid) return [];

  try {
    const privateEventsQuery = query(
      collection(firestore, 'users', user.uid, 'privateSharedEvents'),
      where('ownerUid', '==', user.uid)
    );
    const snapshot = options.forceServer
      ? await getDocsFromServer(privateEventsQuery)
      : await getDocs(privateEventsQuery);
    const candidates = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() as PrivateSharedEventDoc }))
      .filter(({ data }) => hasUsableDate(data) && !isExpiredForDisplay(data));

    if (candidates.length === 0) return [];

    const venues = await fetchVenueDirectory();
    const events: Event[] = [];
    candidates.forEach(({ id, data }) => {
      const venue = matchVenue(data, venues);
      const normalized = normalizePrivateSharedEventForRegression(id, data, venue);
      if (normalized) {
        events.push(...expandPrivateSharedEventRecurrenceForRegression(normalized, data));
      }
    });

    return events;
  } catch (error) {
    console.warn('[PrivateSharedEvents] Failed to fetch private shared events:', error);
    return [];
  }
}
