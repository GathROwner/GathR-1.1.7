import { QueryClient } from '@tanstack/react-query';
import type { Event } from '../../types/events';
import { readEventProgrammeData, getVenueProgrammeLocation } from '../eventProgramme';
import { getAvailableAreaLinkedEvents, hasDrawableAreaLocations } from '../areaEvent';
import { buildAreaMembershipIndex } from '../areaMembership';
import { readAreaMembershipIndex, areaMembershipRootKey } from '../../hooks/useAreaMembershipIndex';
import { EVENTS_MINIMAL, EVENT_DETAILS_SCHEMA_VERSION } from '../../lib/queryKeys';
import { normalizeFirestoreEvent } from '../../lib/api/firestoreEvents';
jest.mock('../../store/mapStore', () => ({ useMapStore: { getState: () => ({ events: [], allEvents: [] }) } }));
jest.mock('../../config/firebaseConfig', () => ({ auth: {} }));

const now = new Date('2040-10-16T12:00:00');
const data = { version: 1, status: 'verified', venueId: 'slug_foundersfoodhall',
  linkedEventIds: ['X7fuxHlvFRgWwlEchJ3L', 'qBimPRIGiW8A8EqMHxYj'], sourceUrl: 'https://foundersfoodhall.com/events/harvest-fest-2/' };
const parent = (extra: Partial<Event> = {}) => ({ id: 'fb_01q4d8wzK8R8VH0revQX', type: 'event', title: 'Harvest Fest',
  venueId: data.venueId, venue: 'Founders Food Hall & Market', locationScope: 'venue', locationPrecision: 'exact',
  latitude: 46.23, longitude: -63.12, startDate: '2040-10-17', endDate: '2040-10-17', startTime: '15:00', endTime: '20:00',
  programmeData: data, source: 'firestore', ...extra } as Event);
const first = { ...parent({ programmeData: null }), id: 'fb_X7fuxHlvFRgWwlEchJ3L', title: 'Salty Sailors', endTime: '17:00' };
const second = { ...first, id: 'fb_qBimPRIGiW8A8EqMHxYj', title: 'Vintage 4.0', startTime: '18:00', endTime: '20:00' };
const records = (items: Event[]) => new Map(items.map(event => [String(event.id).replace(/^fb_/, ''), { event, checkedAt: Date.now() }]));

it('validates both public projections, canonicalizes child aliases, and honours top-level null over metadata', () => {
  expect(readEventProgrammeData({ programmeData: { ...data, linkedEventIds: [data.linkedEventIds[0], first.id] } })?.linkedEventIds).toEqual([data.linkedEventIds[0]]);
  expect(readEventProgrammeData({ metadata: { programmeData: data } })).toEqual(data);
  expect(readEventProgrammeData({ programmeData: null, metadata: { programmeData: data } })).toBeNull();
  expect(readEventProgrammeData({ programmeData: { ...data, linkedEventIds: [] } })).toEqual({ ...data, linkedEventIds: [] });
});
it('carries the optional contract through Firestore minimal/detail normalization without changing venue semantics', () => {
  const raw = { ...parent(), isEvent: true, programmeData: undefined, metadata: { programmeData: data } } as any;
  expect(normalizeFirestoreEvent(raw)).toMatchObject({ programmeData: data, locationScope: 'venue', venueId: data.venueId });
  expect(normalizeFirestoreEvent({ ...raw, programmeData: null }).programmeData).toBeNull();
  expect(normalizeFirestoreEvent({ ...raw, programmeData: { ...data, version: 2 } }).programmeData).toBeNull();
});
it.each([{ version: 2 }, { status: 'pending' }, { venueId: '' }, { venueId: 'venues/foo' }, { linkedEventIds: [''] },
  { linkedEventIds: ['fb_'] }, { linkedEventIds: ['events/child'] }, { linkedEventIds: [12] }, { sourceUrl: 'javascript:alert(1)' },
  { sourceUrl: 'https://facebook.com/venue' }, { sourceLabel: 12 }, { verifiedAt: 'no date' }])('rejects malformed optional programme contract %j', patch => {
  expect(readEventProgrammeData({ programmeData: { ...data, ...patch } })).toBeNull();
});
it('adapts only canonical venue membership internally, never makes an area event or injects children', () => {
  const root = parent(), point = getVenueProgrammeLocation(root, now)!;
  expect(point.venueId).toBe(data.venueId); expect(point.linkedEventIds).toEqual(data.linkedEventIds);
  expect(root.locationScope).toBe('venue'); expect(root.locationPrecision).toBe('exact'); expect(root.areaData).toBeUndefined();
  expect(hasDrawableAreaLocations(root)).toBe(false);
  const unrelated = { ...first, id: 'fb_hours', title: 'Food & retail opening hours' };
  expect(getAvailableAreaLinkedEvents(root, point, [second, unrelated, first], now).map(event => event.id)).toEqual([first.id, second.id]);
  expect(getVenueProgrammeLocation(parent({ programmeData: { ...data, linkedEventIds: [] } as any }), now)).toBeNull();
});
it.each([{ venueId: 'wrong' }, { locationScope: 'area' }, { friendEvent: {} }, { source: 'private_shared' },
  { isCancelled: true }, { status: 'deleted' }, { isExpired: true }, { isRecurring: true },
  { programmeData: { ...data, linkedEventIds: ['01q4d8wzK8R8VH0revQX'] } }])('hides an invalid parent %j', patch => {
  expect(getVenueProgrammeLocation(parent(patch as any), now)).toBeNull();
});
it('indexes exact same-venue children without name/date inference and excludes private, cancelled, expired and moved children', () => {
  const root = parent(), index = buildAreaMembershipIndex(records([root, first, second]));
  expect(index.forEvent(first, now)[0].parent.id).toBe(root.id); expect(index.forEvent(second, now)).toHaveLength(1);
  const excluded: Partial<Event>[] = [{ id: 'fb_other' }, { venueId: 'other' }, { source: 'private_shared' }, { isCancelled: true },
    { isExpired: true }, { startDate: '2040-10-18', endDate: '2040-10-18' }, { isRecurringInstance: true }];
  for (const extra of excluded) {
    expect(index.forEvent({ ...first, ...extra }, now)).toEqual([]);
  }
  expect(index.forEvent(first, new Date('2040-10-18T12:00:00'))).toEqual([]);
});
it('new detail removal and a 404 beat older full feed and old store, including query GC', () => {
  const client = new QueryClient(), tombstones = new Map(), retained = new Map(), root = parent();
  const instant = Date.now(), store = { events: [root, first], allEvents: [root, first], lastFetchedAt: instant - 10000 };
  client.setQueryData(EVENTS_MINIMAL, { combinedData: [root, first], fetchedAt: instant - 1000 });
  expect(readAreaMembershipIndex(client, store, tombstones, retained).forEvent(first, now)).toHaveLength(1);
  client.setQueryData(['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'root'], [{ ...root, programmeData: null }], { updatedAt: instant });
  expect(readAreaMembershipIndex(client, store, tombstones, retained).forEvent(first, now)).toEqual([]);
  client.clear(); expect(readAreaMembershipIndex(client, store, tombstones, retained).forEvent(first, now)).toEqual([]);
  client.setQueryData(areaMembershipRootKey(root.id), { status: 'unavailable', checkedAt: instant });
  readAreaMembershipIndex(client, store, tombstones, retained); client.clear();
  expect(readAreaMembershipIndex(client, store, tombstones, retained).forEvent(first, now)).toEqual([]); client.clear();
});
it('retains a newer full-feed removal across GC and ignores old generation details', () => {
  const client = new QueryClient(), tombstones = new Map(), retained = new Map(), root = parent(), instant = Date.now();
  const store = { events: [root, first], allEvents: [root, first], lastFetchedAt: instant - 10000 };
  client.setQueryData(EVENTS_MINIMAL, { combinedData: [root, first], fetchedAt: instant - 1000 });
  readAreaMembershipIndex(client, store, tombstones, retained);
  client.setQueryData(EVENTS_MINIMAL, { combinedData: [{ ...root, programmeData: null }, first], fetchedAt: instant });
  client.setQueryData(['event-details', 'original-source-v2-date-only-activities-v1', 'root'], [root], { updatedAt: instant });
  expect(readAreaMembershipIndex(client, store, tombstones, retained).forEvent(first, now)).toEqual([]);
  client.clear(); expect(readAreaMembershipIndex(client, store, tombstones, retained).forEvent(first, now)).toEqual([]);
  expect(EVENTS_MINIMAL).toContain('venue-programme-v1'); expect(EVENT_DETAILS_SCHEMA_VERSION).toContain('venue-programme-v1');
});
