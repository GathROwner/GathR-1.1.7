import type { Event } from '../../types/events';
import { createVenueFeedGrouping, groupVenueFeedEvents } from '../venueFeedGroups';
import * as timing from '../eventTiming';

const event = (id: string | number, venue: string, overrides: Partial<Event> = {}): Event => ({
  id, type: 'event', venue, address: `${venue} Main St, Charlottetown`, latitude: 46.2, longitude: -63.1,
  title: String(id), startDate: '2026-10-18', endDate: '2026-10-18', startTime: '18:00', endTime: '20:00', ...overrides,
} as Event);
const reference = (viewport: Event[], outside: Event[], rankedViewport: Event[], rankedOutside: Event[], limit: number) => {
  const groups = groupVenueFeedEvents(rankedViewport, [...viewport, ...outside]);
  const visible = new Set(groups.map(group => group.key));
  const outsideGroups = groupVenueFeedEvents([...rankedOutside, ...outside]).filter(group => !visible.has(group.key));
  return { viewport: groups, outside: { totalCount: outsideGroups.length, groups: outsideGroups.slice(0, limit) } };
};

it('keeps viewport siblings, complete outside pages, partial-ranking order and total count separate from pagination', () => {
  const viewport = [event('a-late', 'A', { startTime: '19:00' })];
  const outside = [event('b-late', 'B', { startTime: '20:00' }), event('a-early', 'A'),
    event('c', 'C'), event('b-early', 'B', { startTime: '17:00' }), event('d', 'D')];
  const index = createVenueFeedGrouping(viewport, outside);
  const v = index.groupViewport(viewport);
  expect(v[0].events.map(e => e.id)).toEqual(['a-early', 'a-late']);
  const page = index.groupOutside([outside[2]], v, 2);
  expect(page.totalCount).toBe(3);
  expect(page.groups.map(g => g.events.map(e => e.id))).toEqual([['c'], ['b-early', 'b-late']]);
  expect(index.groupOutside([outside[2]], v, 0)).toEqual({ totalCount: 3, groups: [] });
});

it('reuses page arrays without resolving dates again when only pagination or ranking changes', () => {
  const records = Array.from({ length: 24 }, (_, i) => event(String(i), String(Math.floor(i / 3))));
  const spy = jest.spyOn(timing, 'getEventScheduleStartLocalScalar');
  try {
    const index = createVenueFeedGrouping([], records);
    expect(spy).not.toHaveBeenCalled();
    const first = index.groupOutside([], [], 2);
    expect(spy).toHaveBeenCalledTimes(6);
    const expanded = index.groupOutside([], [], 3);
    expect(spy).toHaveBeenCalledTimes(9);
    expect(expanded.totalCount).toBe(8);
    expect(expanded.groups[0]).toBe(first.groups[0]);
    expect(expanded.groups[1].events).toBe(first.groups[1].events);
    const reordered = index.groupOutside([records[6]], [], 3);
    expect(reordered.groups.map(group => group.key)).toEqual([expanded.groups[2].key, expanded.groups[0].key, expanded.groups[1].key]);
    expect(spy).toHaveBeenCalledTimes(9);
  } finally { spy.mockRestore(); }
});

it('rebuilds after a filtered snapshot changes and keeps duplicate-ID precedence', () => {
  const before = event('same', 'A');
  const sibling = event('sibling', 'A', { startTime: '19:00' });
  const changed = event('same', 'A', { startTime: '20:00', title: 'Updated' });
  const index = createVenueFeedGrouping([before], [changed, sibling]);
  expect(index.groupViewport([before])[0].events).toEqual([before, sibling]);
  expect(index.groupOutside([changed], [], 10).groups[0].events).toEqual([sibling, changed]);
  const refreshed = createVenueFeedGrouping([changed], [sibling]);
  expect(refreshed.groupViewport([changed])[0].events).toEqual([sibling, changed]);
  expect(index.groupViewport([before])[0].events).toEqual([before, sibling]);
});

it('matches full legacy results across 480 mixed identity/timing/pagination cases without mutating inputs', () => {
  let seed = 104729;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trial = 0; trial < 120; trial++) {
    const records = Array.from({ length: 20 + trial % 40 }, (_, i) => {
      const e = event(i % 29 === 0 ? i : String(i), String(i % 7), {
        type: trial % 2 === 0 ? 'event' : 'special', startTime: `${8 + i % 14}:00`,
      });
      if (trial % 2 === 0) e.timing = timing.createLegacyTimingContract(e);
      if (i % 11 === 0) e.locationScope = ['area', 'city', 'route', 'province'][i % 4] as Event['locationScope'];
      if (i % 13 === 0) e.friendEvent = { eventId: String(e.id) } as Event['friendEvent'];
      if (i % 17 === 0) { e.address = ''; e.latitude = NaN; e.longitude = NaN; }
      if (i % 19 === 0) { e.startDate = 'bad'; e.startTime = ''; }
      if (i % 23 === 0) e.mapMode = 'none';
      if (i % 31 === 0) e.venue = '';
      return e;
    });
    if (trial % 3 === 0) records.push({ ...records[1], title: 'Changed duplicate', startTime: '05:00' });
    const viewport = records.filter(() => random() < 0.3);
    const outside = records.filter(record => !viewport.includes(record));
    const rankedViewport = viewport.slice().sort(() => random() - 0.5);
    const index = createVenueFeedGrouping(viewport, outside);
    const snapshot = JSON.stringify(records);
    records.forEach(Object.freeze);
    Object.freeze(viewport); Object.freeze(outside);
    for (const limit of [1, 10, 30, 100]) {
      const rankedOutside = outside.slice(0, limit + 20).sort(() => random() - 0.5);
      const groups = index.groupViewport(rankedViewport);
      expect({ viewport: groups, outside: index.groupOutside(rankedOutside, groups, limit) })
        .toEqual(reference(viewport, outside, rankedViewport, rankedOutside, limit));
    }
    expect(JSON.stringify(records)).toBe(snapshot);
  }
});
