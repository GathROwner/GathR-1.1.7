import { collection, getDocs } from 'firebase/firestore';

import { auth, firestore } from '../../config/firebaseConfig';
import { Event } from '../../types/events';
import { FIRESTORE_API_BASE } from '../config/backend';

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
  pagename?: string;
  title?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  profileImage?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  website?: string;
  phone?: string;
  categories?: string[];
  category1?: string;
  placeDetailsParsed?: {
    formatted_address?: string;
    international_phone_number?: string;
    website?: string;
    rating?: number;
  };
  rating?: number;
  ratingOverall?: number;
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

const hasUsableDate = (event: PrivateSharedEventDoc): boolean =>
  Boolean(String(event.startDate || '').trim());

const isExpiredForDisplay = (event: PrivateSharedEventDoc): boolean => {
  if (event.status === 'expired' || event.isExpired) return true;
  const endDate = String(event.endDate || event.startDate || '').trim();
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
  const text = normalizeText(`${event.title || ''} ${event.description || ''}`);
  if (/\b(happy hour|specials?|deal|discount|menu|brunch|patio|food|burger|bbq|wing night)\b/.test(text)) {
    return 'special';
  }
  return 'event';
};

const inferCategory = (event: PrivateSharedEventDoc): string => {
  const text = normalizeText(`${event.title || ''} ${event.description || ''}`);
  if (/\b(comedy|trivia|karaoke)\b/.test(text)) return 'Comedy';
  if (/\b(music|band|dj|concert|jazz|acoustic|singer|songwriter)\b/.test(text)) return 'Music';
  if (/\b(food|bbq|burger|brunch|patio|happy hour|menu|drink|beer|wine)\b/.test(text)) return 'Food & Drink';
  if (/\b(run|soccer|football|sport|game|match|wellness|yoga)\b/.test(text)) return 'Sports';
  if (/\b(festival|market|vendors|fair)\b/.test(text)) return 'Festival';
  return 'Other';
};

const fetchVenueDirectory = async (): Promise<VenueDirectoryEntry[]> => {
  if (venueDirectoryPromise) return venueDirectoryPromise;

  venueDirectoryPromise = fetch(`${FIRESTORE_API_BASE}/venues`)
    .then(async (response) => {
      if (!response.ok) return [];
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : payload?.venues;
      return Array.isArray(rows) ? rows : [];
    })
    .catch((error) => {
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
  const address = normalizeText(firstText(event.address, event.visibilityEvidence?.address));

  if (!locationName && !address) return null;

  return venues.find((venue) => {
    const venueName = normalizeText(firstText(venue.pagename, venue.title));
    const venueAddress = normalizeText(firstText(venue.address, venue.placeDetailsParsed?.formatted_address));
    const nameMatches =
      Boolean(locationName && venueName) &&
      (venueName === locationName ||
        venueName.includes(locationName) ||
        locationName.includes(venueName));
    const addressMatches =
      Boolean(address && venueAddress) &&
      (venueAddress.includes(address) || address.includes(venueAddress));

    return nameMatches || addressMatches;
  }) ?? null;
};

const normalizePrivateSharedEvent = (
  id: string,
  event: PrivateSharedEventDoc,
  venue: VenueDirectoryEntry
): Event | null => {
  if (!hasUsableDate(event) || isExpiredForDisplay(event)) return null;

  const latitude = Number(venue.latitude);
  const longitude = Number(venue.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
    return null;
  }

  const venueName = firstText(event.locationName, event.visibilityEvidence?.locationName, venue.pagename, venue.title);
  const address = firstText(event.address, event.visibilityEvidence?.address, venue.address, venue.placeDetailsParsed?.formatted_address);
  const mediaUrls = Array.isArray(event.mediaUrls) ? event.mediaUrls.filter(Boolean) : [];
  const imageUrl = firstText(mediaUrls[0], event.visibilityEvidence?.imageUrl);

  return {
    id: `shared_${id}`,
    type: inferType(event),
    source: 'private_shared',
    category: inferCategory(event),
    title: firstText(event.title, 'Shared event'),
    description: firstText(event.description),
    venueId: venue.id ?? null,
    venue: venueName,
    address,
    latitude,
    longitude,
    startDate: String(event.startDate || ''),
    endDate: String(event.endDate || event.startDate || ''),
    startTime: String(event.startTime || ''),
    endTime: String(event.endTime || ''),
    ticketPrice: '',
    profileUrl: firstText(venue.profileImage),
    imageUrl,
    SharedPostThumbnail: '',
    ticketLinkPosts: '',
    ticketLinkEvents: '',
    mediaUrls,
    facebookUrl: firstText(event.sourceUrl),
    venueWebsite: firstText(venue.website, venue.placeDetailsParsed?.website),
    venuePhone: firstText(venue.phone, venue.placeDetailsParsed?.international_phone_number),
    venueFacebookUrl: firstText(venue.facebookUrl),
    venueInstagramUrl: firstText(venue.instagramUrl),
    venueCategories: venue.categories || (venue.category1 ? [venue.category1] : []),
    venueRating: venue.placeDetailsParsed?.rating ?? venue.rating ?? venue.ratingOverall,
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

export const isSharedEventFromCurrentUser = (event: Pick<Event, 'sharedEventProvenance'>): boolean =>
  event.sharedEventProvenance?.sharedByCurrentUser === true;

export const isPrivateSharedEventId = (id: string | number | null | undefined): boolean =>
  String(id ?? '').startsWith('shared_');

export async function fetchPrivateSharedEventsForCurrentUser(): Promise<Event[]> {
  const user = auth.currentUser;
  if (!user?.uid) return [];

  const snapshot = await getDocs(collection(firestore, 'users', user.uid, 'privateSharedEvents'));
  const candidates = snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() as PrivateSharedEventDoc }))
    .filter(({ data }) => hasUsableDate(data) && !isExpiredForDisplay(data));

  if (candidates.length === 0) return [];

  const venues = await fetchVenueDirectory();
  const events: Event[] = [];
  candidates.forEach(({ id, data }) => {
    const venue = matchVenue(data, venues);
    if (!venue) return;

    const normalized = normalizePrivateSharedEvent(id, data, venue);
    if (normalized) events.push(normalized);
  });

  return events;
}
