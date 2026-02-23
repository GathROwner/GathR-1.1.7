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

const DEBUG_FETCH = __DEV__ ?? true;

const LEGACY_EVENTS_URL = `${LEGACY_EVENTS_API_BASE}/minimal?type=event`;
const LEGACY_SPECIALS_URL = `${LEGACY_EVENTS_API_BASE}/minimal?type=special`;

export type FetchMinimalEventsOptions = FirestoreFetchOptions;

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

export function dedupeEvents(events: Event[]): Event[] {
  const seen = new Map<string, Event>();
  for (const event of events) {
    seen.set(getDedupeKey(event), event);
  }
  return Array.from(seen.values());
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
export async function fetchMinimalEvents(
  options: FetchMinimalEventsOptions = {}
): Promise<{
  combinedData: Event[];
  fetchedAt: number;
  sources: { googleSheets: number; firestore: number };
}> {
  const t0 = Date.now();

  if (USE_FIRESTORE_EVENTS) {
    const firestoreEvents = await fetchAllFirestoreEvents(options);
    const combinedData = dedupeEvents(firestoreEvents);

    if (DEBUG_FETCH) {
      console.log(
        `[fetchMinimalEvents] Firestore default path totalMs=${Date.now() - t0} events=${combinedData.length}`
      );
    }

    if (combinedData.length > 0 || !ENABLE_LEGACY_EVENTS_FALLBACK) {
      return {
        combinedData,
        fetchedAt: Date.now(),
        sources: {
          googleSheets: 0,
          firestore: combinedData.length,
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
      },
    };
  }
}

