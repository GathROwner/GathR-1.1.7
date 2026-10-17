import type { Event, EventProgrammeData, EventAreaLocation } from '../types/events';
import { isOriginalEventSourceUrl } from './eventSourceUrl';
import { toFirestoreEventId } from './firestoreEventIds';
import { getEventDateKey, isEventPast } from './eventExpiry';

type ProgrammeRecord = { programmeData?: unknown; metadata?: { programmeData?: unknown } };
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const identity = (value: unknown): value is string => text(value) && !value.includes('/') && value.trim() === value;

/** Top-level null/removal wins over older metadata. Optional malformed contracts fail closed. */
export function readEventProgrammeData(record: ProgrammeRecord): EventProgrammeData | null {
  const raw = record.programmeData !== undefined ? record.programmeData : record.metadata?.programmeData;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (data.version !== 1 || (data.status !== 'verified' && data.status !== 'partial') || !identity(data.venueId)
    || !Array.isArray(data.linkedEventIds) || data.linkedEventIds.some(id => !identity(id))
    || !text(data.sourceUrl) || !isOriginalEventSourceUrl(data.sourceUrl)
    || data.sourceLabel !== undefined && !text(data.sourceLabel)
    || data.verifiedAt !== undefined && (!text(data.verifiedAt) || !Number.isFinite(Date.parse(data.verifiedAt)))) return null;
  const ids = [...new Set(data.linkedEventIds.map(toFirestoreEventId))];
  if (ids.some(id => !identity(id))) return null;
  return { version: 1, status: data.status as EventProgrammeData['status'], venueId: data.venueId,
    linkedEventIds: ids, sourceUrl: data.sourceUrl.trim(),
    ...(data.sourceLabel === undefined ? {} : { sourceLabel: (data.sourceLabel as string).trim() }),
    ...(data.verifiedAt === undefined ? {} : { verifiedAt: data.verifiedAt as string }) };
}

/** Internal browser adapter only: never changes public scope, geometry or occurrence counts. */
export function getVenueProgrammeLocation(event: Event, now = new Date()): EventAreaLocation | null {
  const data = readEventProgrammeData(event);
  const start = getEventDateKey(event.startDate), end = getEventDateKey(event.endDate || event.startDate);
  if (!data || event.type !== 'event' || event.locationScope !== 'venue' || event.venueId !== data.venueId
    || !text(event.title) || !start || !end || end < start
    || event.friendEvent || ['private_shared', 'friend_event'].includes(event.source || '')
    || event.isRecurring || event.isRecurringInstance || event.originalEventId || event.isCancelled || event.isExpired
    || ['cancelled', 'canceled', 'deleted', 'expired'].includes(String(event.status || '').trim().toLowerCase())
    || isEventPast(event, now) || !data.linkedEventIds.length
    || data.linkedEventIds.includes(toFirestoreEventId(event.id))) return null;
  return { id: 'programme:' + toFirestoreEventId(event.id), label: event.venue, venueId: data.venueId,
    certainty: 'confirmed', coordinates: { latitude: event.latitude, longitude: event.longitude },
    linkedEventIds: data.linkedEventIds, address: event.address, sourceLabel: data.sourceLabel };
}
