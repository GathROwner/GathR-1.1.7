/**
 * Unified Events API
 * Fetches and merges events from multiple sources (Google Sheets + Firestore)
 */

import { Event } from '../../types/events';
import { fetchAllFirestoreEvents } from './firestoreEvents';

// Debug flag for logging
const DEBUG_FETCH = __DEV__ ?? true;

// Google Sheets API endpoints (existing)
const GOOGLE_SHEETS_EVENTS_URL =
  'https://gathr-backend-951249927221.northamerica-northeast1.run.app/api/v2/events/minimal?type=event';
const GOOGLE_SHEETS_SPECIALS_URL =
  'https://gathr-backend-951249927221.northamerica-northeast1.run.app/api/v2/events/minimal?type=special';

/**
 * Fetch events from Google Sheets backend (existing logic preserved)
 */
async function fetchGoogleSheetsEvents(): Promise<Event[]> {
  const t0 = Date.now();

  const fetchJson = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error ${res.status} for ${url}`);
    const text = await res.clone().text();
    const data = JSON.parse(text);
    return { data, ms: Date.now() - t0 };
  };

  const [ev, sp] = await Promise.all([
    fetchJson(GOOGLE_SHEETS_EVENTS_URL),
    fetchJson(GOOGLE_SHEETS_SPECIALS_URL)
  ]);

  const events = (Array.isArray(ev.data) ? ev.data : ev.data?.data || []).map((e: any) => {
    const { _original, ...rest } = e;
    return { ...rest, type: 'event' as const, source: 'google_sheets' as const };
  });

  const specials = (Array.isArray(sp.data) ? sp.data : sp.data?.data || []).map((s: any) => ({
    ...s,
    type: 'special' as const,
    source: 'google_sheets' as const,
  }));

  if (DEBUG_FETCH) {
    console.log(`[GoogleSheets][fetch] ms=${Date.now() - t0} events=${events.length} specials=${specials.length}`);
  }

  return [...events, ...specials];
}

/**
 * Generate a deduplication key for an event
 * Match on: title (normalized) + startDate + venue name (normalized)
 */
function getDedupeKey(event: Event): string {
  const normalizedTitle = (event.title || '').toLowerCase().trim().replace(/\s+/g, ' ');
  // Extract venue name before the pipe character (e.g., "Venue Name | City PE" -> "venue name")
  const venuePart = (event.venue || '').split('|')[0];
  const normalizedVenue = venuePart.toLowerCase().trim().replace(/\s+/g, ' ');
  return `${normalizedTitle}|${event.startDate}|${normalizedVenue}`;
}

/**
 * Merge and deduplicate events from multiple sources
 * Priority: Google Sheets events take precedence (more established data)
 */
function mergeAndDeduplicateEvents(
  googleSheetsEvents: Event[],
  firestoreEvents: Event[]
): Event[] {
  const seenKeys = new Map<string, Event>();

  // First pass: Add Google Sheets events (higher priority)
  for (const event of googleSheetsEvents) {
    const key = getDedupeKey(event);
    seenKeys.set(key, event);
  }

  // Second pass: Add Firestore events only if no duplicate
  let duplicatesSkipped = 0;
  for (const event of firestoreEvents) {
    const key = getDedupeKey(event);
    if (!seenKeys.has(key)) {
      seenKeys.set(key, event);
    } else {
      duplicatesSkipped++;
    }
  }

  if (DEBUG_FETCH && duplicatesSkipped > 0) {
    console.log(`[Merge] Skipped ${duplicatesSkipped} duplicate Firestore events`);
  }

  return Array.from(seenKeys.values());
}

/**
 * Fetch minimal events from ALL sources (unified API)
 * Performs parallel fetches and merges results with deduplication
 */
export async function fetchMinimalEvents(): Promise<{
  combinedData: Event[];
  fetchedAt: number;
  sources: { googleSheets: number; firestore: number };
}> {
  const t0 = Date.now();

  // Parallel fetch from both sources using Promise.allSettled for graceful degradation
  const [googleSheetsResult, firestoreResult] = await Promise.allSettled([
    fetchGoogleSheetsEvents(),
    fetchAllFirestoreEvents()
  ]);

  // Extract successful results (graceful degradation)
  const gsEvents = googleSheetsResult.status === 'fulfilled'
    ? googleSheetsResult.value
    : [];
  const fsEvents = firestoreResult.status === 'fulfilled'
    ? firestoreResult.value
    : [];

  // Log any failures
  if (googleSheetsResult.status === 'rejected') {
    console.error('[fetchMinimalEvents] Google Sheets fetch failed:', googleSheetsResult.reason);
  }
  if (firestoreResult.status === 'rejected') {
    console.error('[fetchMinimalEvents] Firestore fetch failed:', firestoreResult.reason);
  }

  // Merge and deduplicate
  const combinedData = mergeAndDeduplicateEvents(gsEvents, fsEvents);

  // Count events by source in merged data
  const mergedFirestoreCount = combinedData.filter(e => e.source === 'firestore').length;
  const mergedGoogleSheetsCount = combinedData.filter(e => e.source === 'google_sheets').length;

  if (DEBUG_FETCH) {
    console.log(`[fetchMinimalEvents] totalMs=${Date.now() - t0} gs=${gsEvents.length} fs=${fsEvents.length} merged=${combinedData.length}`);
    console.log(`[fetchMinimalEvents] After merge: firestore=${mergedFirestoreCount} google_sheets=${mergedGoogleSheetsCount}`);

    // Log sample Firestore event to verify source field
    const sampleFs = combinedData.find(e => e.source === 'firestore');
    if (sampleFs) {
      console.log(`[fetchMinimalEvents] Sample Firestore event: id=${sampleFs.id} title="${sampleFs.title}" source=${sampleFs.source}`);
    }
  }

  return {
    combinedData,
    fetchedAt: Date.now(),
    sources: {
      googleSheets: gsEvents.length,
      firestore: fsEvents.length
    }
  };
}
