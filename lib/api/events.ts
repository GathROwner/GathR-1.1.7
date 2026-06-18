/**
 * Unified Events API
 * Firestore is the default source; legacy minimal endpoints are fallback-only.
 */

import { Event } from '../../types/events';
import {
  FirestoreFetchOptions,
  fetchAllFirestoreEvents,
} from './firestoreEvents';
import {
  ENABLE_LEGACY_EVENTS_FALLBACK,
  LEGACY_EVENTS_API_BASE,
  USE_FIRESTORE_EVENTS,
} from '../config/backend';
import { fetchPrivateSharedEventsForCurrentUser } from './privateSharedEvents';

const DEBUG_FETCH = __DEV__ ?? true;

const LEGACY_EVENTS_URL = `${LEGACY_EVENTS_API_BASE}/minimal?type=event`;
const LEGACY_SPECIALS_URL = `${LEGACY_EVENTS_API_BASE}/minimal?type=special`;

export type FetchMinimalEventsOptions = FirestoreFetchOptions;
type FetchMinimalEventsResult = {
  combinedData: Event[];
  fetchedAt: number;
  sources: { googleSheets: number; firestore: number; privateShared: number };
};

let minimalEventsInFlight:
  | { key: string; startedAt: number; promise: Promise<FetchMinimalEventsResult> }
  | null = null;

const getFetchMinimalEventsKey = (options: FetchMinimalEventsOptions = {}) =>
  JSON.stringify(options ?? {});

/**
 * Stronger dedupe key to avoid collapsing distinct same-day occurrences.
 */
export function getDedupeKey(event: Event): string {
  const normalizedTitle = (event.title || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const venuePart = (event.venue || '').split('|')[0];
  const normalizedVenue = venuePart.toLowerCase().trim().replace(/\s+/g, ' ');
  const normalizedStartTime = (event.startTime || '').toLowerCase().trim();
  const normalizedType = (event.type || 'event').toLowerCase().trim();
  return `${normalizedTitle}|${event.startDate}|${normalizedStartTime}|${normalizedVenue}|${normalizedType}`;
}

function normalizeMergeText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getEventIdentityKey(event: Event): string {
  const normalizedTitle = (event.title || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const normalizedStartTime = (event.startTime || '').toLowerCase().trim();
  const normalizedType = (event.type || 'event').toLowerCase().trim();
  return `${normalizedTitle}|${event.startDate}|${normalizedStartTime}|${normalizedType}`;
}

const isScopedLocationEvent = (event: Event): boolean =>
  event.locationScope === 'city' || event.locationScope === 'area' || event.locationScope === 'route';

export function dedupeEvents(events: Event[]): Event[] {
  const seen = new Map<string, Event>();
  for (const event of events) {
    seen.set(getDedupeKey(event), event);
  }

  const venueDeduped = Array.from(seen.values());
  const scopedByIdentity = new Map<string, Event>();

  for (const event of venueDeduped) {
    if (isScopedLocationEvent(event)) {
      scopedByIdentity.set(getEventIdentityKey(event), event);
    }
  }

  if (scopedByIdentity.size === 0) {
    return venueDeduped;
  }

  return venueDeduped.filter((event) => {
    const scopedTwin = scopedByIdentity.get(getEventIdentityKey(event));
    return !scopedTwin || scopedTwin.id === event.id;
  });
}

function mergePrivateSharedEvents(publicEvents: Event[], privateSharedEvents: Event[]): Event[] {
  if (privateSharedEvents.length === 0) return publicEvents;

  const merged = dedupeEvents(publicEvents);
  const indexByDedupeKey = new Map<string, number>();
  merged.forEach((event, index) => {
    indexByDedupeKey.set(getDedupeKey(event), index);
  });

  for (const privateEvent of privateSharedEvents) {
    const privateKey = getDedupeKey(privateEvent);
    const privateIdentityKey = getEventIdentityKey(privateEvent);
    const privateVenue = normalizeMergeText(privateEvent.venue);
    let existingIndex = indexByDedupeKey.get(privateKey);
    if (existingIndex === undefined) {
      const looseIndex = merged.findIndex((event) => {
        const venue = normalizeMergeText(event.venue);
        const venueMatches =
          Boolean(privateVenue && venue) &&
          (privateVenue === venue || privateVenue.includes(venue) || venue.includes(privateVenue));
        return getEventIdentityKey(event) === privateIdentityKey && venueMatches;
      });
      if (looseIndex >= 0) {
        existingIndex = looseIndex;
      }
    }
    if (existingIndex === undefined) {
      indexByDedupeKey.set(privateKey, merged.length);
      merged.push(privateEvent);
      continue;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = {
      ...existing,
      sharedEventProvenance: privateEvent.sharedEventProvenance,
      imageUrl: existing.imageUrl || privateEvent.imageUrl,
      profileUrl: existing.profileUrl || privateEvent.profileUrl,
      mediaUrls: existing.mediaUrls?.length ? existing.mediaUrls : privateEvent.mediaUrls,
      facebookUrl: existing.facebookUrl || privateEvent.facebookUrl,
    };
  }

  return dedupeEvents(merged);
}

async function fetchLegacyMinimalByType(type: 'event' | 'special'): Promise<Event[]> {
  const url = type === 'event' ? LEGACY_EVENTS_URL : LEGACY_SPECIALS_URL;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Legacy API error ${res.status} for ${url}`);
  }

  const text = await res.clone().text();
  const data = JSON.parse(text);
  const rows = Array.isArray(data) ? data : data?.data || [];

  return rows.map((row: any) => {
    const { _original, ...rest } = row;
    return { ...rest, type, source: 'google_sheets' as const };
  });
}

async function fetchLegacyMinimalEvents(): Promise<Event[]> {
  const t0 = Date.now();
  const [events, specials] = await Promise.all([
    fetchLegacyMinimalByType('event'),
    fetchLegacyMinimalByType('special'),
  ]);

  if (DEBUG_FETCH) {
    console.log(
      `[Legacy][fetch] ms=${Date.now() - t0} events=${events.length} specials=${specials.length}`
    );
  }

  return dedupeEvents([...events, ...specials]);
}

/**
 * Fetch minimal events for app consumption.
 * Firestore path is default. Legacy endpoints are fallback-only.
 */
async function fetchMinimalEventsFromSource(
  options: FetchMinimalEventsOptions = {}
): Promise<FetchMinimalEventsResult> {
  const t0 = Date.now();

  if (USE_FIRESTORE_EVENTS) {
    const [firestoreEvents, privateSharedEvents] = await Promise.all([
      fetchAllFirestoreEvents(options),
      fetchPrivateSharedEventsForCurrentUser(),
    ]);
    const combinedData = mergePrivateSharedEvents(firestoreEvents, privateSharedEvents);

    if (DEBUG_FETCH) {
      console.log(
        `[fetchMinimalEvents] Firestore default path totalMs=${Date.now() - t0} events=${combinedData.length} privateShared=${privateSharedEvents.length}`
      );
    }

    if (combinedData.length > 0 || !ENABLE_LEGACY_EVENTS_FALLBACK) {
      return {
        combinedData,
        fetchedAt: Date.now(),
        sources: {
          googleSheets: 0,
          firestore: firestoreEvents.length,
          privateShared: privateSharedEvents.length,
        },
      };
    }

    console.warn(
      '[fetchMinimalEvents] Firestore returned no rows; attempting legacy fallback because ENABLE_LEGACY_EVENTS_FALLBACK=true'
    );
  }

  if (!ENABLE_LEGACY_EVENTS_FALLBACK) {
    return {
      combinedData: [],
      fetchedAt: Date.now(),
      sources: {
        googleSheets: 0,
        firestore: 0,
        privateShared: 0,
      },
    };
  }

  try {
    const legacyEvents = await fetchLegacyMinimalEvents();
    return {
      combinedData: legacyEvents,
      fetchedAt: Date.now(),
      sources: {
        googleSheets: legacyEvents.length,
        firestore: 0,
        privateShared: 0,
      },
    };
  } catch (error) {
    console.error('[fetchMinimalEvents] Legacy fallback failed:', error);
    return {
      combinedData: [],
      fetchedAt: Date.now(),
      sources: {
        googleSheets: 0,
        firestore: 0,
        privateShared: 0,
      },
    };
  }
}

export function fetchMinimalEvents(
  options: FetchMinimalEventsOptions = {}
): Promise<FetchMinimalEventsResult> {
  const key = getFetchMinimalEventsKey(options);
  if (minimalEventsInFlight?.key === key) {
    if (DEBUG_FETCH) {
      console.log(
        `[fetchMinimalEvents] Reusing in-flight request key=${key} ageMs=${Date.now() - minimalEventsInFlight.startedAt}`
      );
    }
    return minimalEventsInFlight.promise;
  }

  const startedAt = Date.now();
  const promise = fetchMinimalEventsFromSource(options).finally(() => {
    if (minimalEventsInFlight?.promise === promise) {
      minimalEventsInFlight = null;
    }
  });
  minimalEventsInFlight = { key, startedAt, promise };

  return promise;
}

