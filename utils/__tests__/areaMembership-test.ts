import { QueryClient } from '@tanstack/react-query';
import { buildAreaMembershipIndex, getMembershipVenueId } from '../areaMembership';
import { participationArea } from './fixtures/areaParticipation';
import { readAreaMembershipIndex, areaMembershipRootKey } from '../../hooks/useAreaMembershipIndex';
import { EVENTS_MINIMAL, EVENT_DETAILS_SCHEMA_VERSION } from '../../lib/queryKeys';
import { areaActivityKey } from '../areaActivityCache';
import { TimeFilterType } from '../../types/filter';
import type { Event, Venue } from '../../types/events';
import { normalizeFirestoreEvent } from '../../lib/api/firestoreEvents';
import type { FirestoreEvent } from '../../types/firestore';
jest.mock('../../config/firebaseConfig', () => ({ auth: {}, firestore: {} }));
jest.mock('../../store/mapStore', () => ({ useMapStore: jest.requireActual('zustand').create(() => ({ events: [], allEvents: [], lastFetchedAt: null })) }));

const now = new Date('2040-10-16T15:00:00Z'), instant = now.getTime();
const root = () => {
  const parent = participationArea({ id: 'fb_qa_festival', title: 'Autumn Festival', sourceUrl: 'https://example.com/qa/festival' });
  parent.areaData!.locations[0].linkedEventIds = ['qa_child', 'fb_qa_child']; return parent;
};
const child = (): Event => ({ ...participationArea(), id: 'fb_qa_child', title: 'Workshop', locationScope: 'venue', areaData: null,
  venueId: 'qa_library', startDate: '2040-10-16', endDate: '2040-10-16', startTime: '18:00', endTime: '21:00' });
const index = (parents: Event[], current = child()) => buildAreaMembershipIndex(new Map([...parents, current]
  .map(event => [String(event.id).replace(/^fb_/, ''), { event, checkedAt: instant }])));
let client: QueryClient;
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(now); client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }); });
afterEach(() => { client.clear(); jest.useRealTimers(); });
const store = (events: Event[], age = 10000) => ({ events, allEvents: events, lastFetchedAt: instant - age });
const feed = (events: Event[], age = 0) => client.setQueryData(EVENTS_MINIMAL, { combinedData: events, fetchedAt: instant - age });

it('indexes only exact public child and venue ownership, deduplicating aliases and parents', () => {
  const parent = root(), item = child(); const before = JSON.stringify(item);
  expect(index([parent, parent]).forEvent(item, now).map(row => row.parent.id)).toEqual([parent.id]);
  expect(index([parent]).forEvent({ ...item, id: 'unrelated' }, now)).toEqual([]);
  expect(index([parent]).forEvent({ ...item, venueId: 'qa_shop' }, now)).toEqual([]);
  expect(JSON.stringify(item)).toBe(before);
});
it('excludes approximate/no-source/private links and children', () => {
  const approximate = root(); approximate.areaData!.locations[0].certainty = 'approximate';
  const privateRoot = { ...root(), friendEvent: {} } as Event;
  for (const parent of [approximate, { ...root(), sourceUrl: '' }, privateRoot]) expect(index([parent]).forEvent(child(), now)).toEqual([]);
  expect(index([root()]).forEvent({ ...child(), source: 'private_shared' }, now)).toEqual([]);
  expect(index([root()]).forEvent({ ...child(), friendEvent: {} } as Event, now)).toEqual([]);
});
it('orders multiple real parents deterministically and retains future programmes', () => {
  const a = { ...root(), id: 'qa_a', title: 'A Festival' }, b = { ...root(), id: 'qa_b', title: 'B Festival' };
  expect(index([b, a]).forEvent(child(), now).map(row => row.parent.title)).toEqual(['A Festival', 'B Festival']);
  const future = { ...root(), startDate: '2040-10-17', endDate: '2040-10-18' };
  const futureChild = { ...child(), startDate: '2040-10-17', endDate: '2040-10-17' };
  expect(index([future], futureChild).forEvent(futureChild, now)).toHaveLength(1);
  for (const parent of [{ ...root(), isCancelled: true }, { ...root(), isExpired: true }, { ...root(), endDate: '2040-10-15' }])
    expect(index([parent]).forEvent(child(), now)).toEqual([]);
});
it('rejects a stale caller at venue A when authoritative child moved to B, and out-of-parent caller dates', () => {
  const parent = root(); parent.areaData!.locations[0].venueId = 'venue_b';
  expect(index([parent], { ...child(), venueId: 'venue_b' }).forEvent(child(), now)).toEqual([]);
  expect(index([root()]).forEvent({ ...child(), startDate: '2040-10-22', endDate: '2040-10-22' }, now)).toEqual([]);
});
it('uses confirmed points in a partial hunt, including specials-only venues and date overlap without NOW claims', () => {
  const hunt = participationArea({ sourceUrl: 'https://example.com/qa/hunt' }); hunt.areaData!.status = 'partial';
  const lookup = index([hunt]);
  for (const timeFilter of [TimeFilterType.TODAY, TimeFilterType.NOW, TimeFilterType.TOMORROW, TimeFilterType.UPCOMING])
    expect(lookup.forVenue('qa_library', { timeFilter }, now)).toHaveLength(1);
  expect(lookup.forVenue('qa_library', { timeFilter: TimeFilterType.UPCOMING, upcomingDate: { kind: 'custom', startDate: '2040-11-01', endDate: '2040-11-02' } }, now)).toEqual([]);
  const special = { ...child(), type: 'special' as const };
  expect(getMembershipVenueId({ events: [special] } as Venue)).toBe('qa_library');
  expect(getMembershipVenueId({ events: [special, { ...special, venueId: 'other' }] } as Venue)).toBeNull();
  expect(lookup.forEvent(special, now)).toEqual([]);
});
it('lets a fresh complete feed remove old store memberships rather than restamping old objects', () => {
  const old = root(), removed = root(); removed.areaData!.locations[0].linkedEventIds = [];
  feed([removed, child()]);
  expect(readAreaMembershipIndex(client, store([old, child()])).forEvent(child(), now)).toEqual([]);
  feed([root(), child()]);
  expect(readAreaMembershipIndex(client, store([{ ...old, isCancelled: true }, child()])).forEvent(child(), now)).toHaveLength(1);
});
it('takes newer detail removal over an old feed and ignores unsupported detail generations', () => {
  const removed = root(); removed.areaData!.locations[0].linkedEventIds = [];
  feed([root(), child()], 10000);
  client.setQueryData(['event-details', 'old-schema', 'qa_festival'], [removed], { updatedAt: instant });
  expect(readAreaMembershipIndex(client, store([])).forEvent(child(), now)).toHaveLength(1);
  client.setQueryData(['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'qa_festival'], [removed], { updatedAt: instant });
  expect(readAreaMembershipIndex(client, store([])).forEvent(child(), now)).toEqual([]);
});
it('honours confirmed 404/tombstones despite older cache fallbacks and query GC; newer detail can restore', () => {
  feed([root(), child()], 10000); const tombstones = new Map<string, number>();
  client.setQueryData(areaMembershipRootKey('qa_festival'), { status: 'unavailable', checkedAt: instant });
  expect(readAreaMembershipIndex(client, store([root(), child()]), tombstones).forEvent(child(), now)).toEqual([]);
  client.removeQueries({ queryKey: areaMembershipRootKey('qa_festival') });
  expect(readAreaMembershipIndex(client, store([root(), child()]), tombstones).forEvent(child(), now)).toEqual([]);
  jest.setSystemTime(new Date(instant + 1000));
  client.setQueryData(['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'qa_festival'], [root()], { updatedAt: instant + 1000 });
  expect(readAreaMembershipIndex(client, store([]), tombstones).forEvent(child(), new Date(instant + 1000))).toHaveLength(1);
});
it('treats a newer full feed omission and existing area-cache absence as removals', () => {
  client.setQueryData(['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'qa_festival'], [root()], { updatedAt: instant - 10000 });
  feed([child()]); expect(readAreaMembershipIndex(client, store([root(), child()])).forEvent(child(), now)).toEqual([]);
  feed([root(), child()], 10000);
  client.setQueryData(areaActivityKey('qa_festival'), { status: 'unavailable', checkedAt: instant });
  expect(readAreaMembershipIndex(client, store([])).forEvent(child(), now)).toEqual([]);
});
it('retains authoritative root removal after full-feed cache GC instead of reviving old viewport/store copies', () => {
  const retained = new Map(), tombstones = new Map<string, number>();
  const old = root(), removed = root(); removed.areaData!.locations[0].linkedEventIds = [];
  feed([removed, child()]);
  expect(readAreaMembershipIndex(client, store([old, child()]), tombstones, retained).forEvent(child(), now)).toEqual([]);
  client.removeQueries({ queryKey: EVENTS_MINIMAL });
  expect(readAreaMembershipIndex(client, store([old, child()], 0), tombstones, retained).forEvent(child(), now)).toEqual([]);
});
it.each(['programme', 'hunt'])('accepts a synthetic metadata-shaped legacy original-post source for a %s root', mode => {
  const model = mode === 'programme' ? root() : participationArea();
  const raw = { id: 'qa_legacy_parent', title: model.title, description: model.description, isEvent: true,
    startDate: model.startDate, endDate: model.endDate, startTime: '', endTime: '', venueId: null,
    metadata: { locationScope: 'area', areaData: model.areaData, uniqueId: '1234567890123456_qa',
      facebookUrl: 'https://www.facebook.com/ExampleFestival' } } as FirestoreEvent;
  const normalized = normalizeFirestoreEvent(raw);
  expect(normalized.sourceUrl).toBeFalsy();
  const lookup = index([normalized]);
  expect(mode === 'programme' ? lookup.forEvent(child(), now) : lookup.forVenue('qa_library', { timeFilter: TimeFilterType.TODAY }, now)).toHaveLength(1);
});
it('fails closed on malformed cached area inventories without crashing ordinary venue cards', () => {
  for (const locations of ['malformed', [null]]) {
    const malformed = { ...root(), areaData: { ...root().areaData, locations } } as unknown as Event;
    expect(index([malformed]).forEvent(child(), now)).toEqual([]);
  }
});
