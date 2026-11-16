import type { Event } from '../types/events';
import { chunkedQueryStorage } from '../utils/chunkedAsyncStorage';
import { createEventTimeContext, getEventFilterTimeFacts } from '../utils/mapEventFilters';
import { FIRESTORE_API_BASE } from './config/backend';
import { EVENTS_MINIMAL } from './queryKeys';

// Separate from the expiring, account-aware React Query snapshot. A schema/API
// mismatch invalidates this copy; elapsed time alone does not.
const KEY = 'gathr-public-event-snapshot-v1';
const compatibility = JSON.stringify([FIRESTORE_API_BASE, EVENTS_MINIMAL]);
type Snapshot = { version: 1; compatibility: string; fetchedAt: number; events: Event[] };
let latestRequest = 0;
let writes = Promise.resolve();

const publicRecord = (event: Event): boolean => Boolean(event && event.source === 'firestore'
  && (typeof event.id === 'string' || typeof event.id === 'number')
  && (event.type === 'event' || event.type === 'special') && !event.friendEvent);

function publicCopy(events: Event[]): Event[] {
  const context = createEventTimeContext();
  return events.filter(publicRecord).filter(event => !getEventFilterTimeFacts(event, context).past)
    .map(event => {
      // Only call the writer on the public API result BEFORE private merging.
      // Public records can also carry contributor-specific submission badges.
      const copy = { ...event };
      delete copy.sharedEventProvenance;
      delete copy.friendEvent;
      return copy;
    });
}

/** Reserve at full-download start, so a slower old request cannot overwrite a newer one. */
export function beginPublicSnapshotRefresh(): number { return ++latestRequest; }

export function savePublicEventSnapshot(events: Event[], fetchedAt: number, request: number): Promise<void> {
  writes = writes.catch(() => undefined).then(async () => {
    if (request !== latestRequest) return;
    const value: Snapshot = { version: 1, compatibility, fetchedAt, events: publicCopy(events) };
    await chunkedQueryStorage.setItem(KEY, JSON.stringify(value));
  }).catch(() => {
    // Storage failure must not turn a successful network response into failure.
    // The chunked writer keeps the previous committed generation intact.
  });
  return writes;
}

export async function readPublicEventSnapshot(): Promise<{ combinedData: Event[]; fetchedAt: number } | null> {
  try {
    const raw = await chunkedQueryStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Snapshot;
    if (value.version !== 1 || value.compatibility !== compatibility || !Array.isArray(value.events)
      || !Number.isFinite(value.fetchedAt) || value.fetchedAt <= 0) return null;
    return { combinedData: publicCopy(value.events), fetchedAt: value.fetchedAt };
  } catch { return null; }
}
