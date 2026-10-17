import type { Event } from '../../types/events';
import { groupVenueFeedEvents, getVenueFeedKey } from '../venueFeedGroups';
import { createLegacyTimingContract } from '../eventTiming';

const event = (id: string, overrides: Partial<Event> = {}): Event => ({
  id, type: 'event', venue: 'Soul Fit PEI', address: '10 Main St, Charlottetown, PE, Canada',
  latitude: 46.2, longitude: -63.1, startDate: '2026-10-12', startTime: '18:00',
  endDate: '2026-10-12', endTime: '20:00', title: id, ...overrides,
} as Event);

it('keeps ranked venue positions but orders each venue chronologically without mutating inputs', () => {
  const later = event('7pm', { startTime: '19:00' });
  const earlier = event('6pm');
  const other = event('other', { venue: 'The Guild', address: '111 Queen St, Charlottetown' });
  const ranked = [later, other, earlier];
  const grouped = groupVenueFeedEvents(ranked);
  expect(grouped.map(group => group.events.map(item => item.id))).toEqual([['6pm', '7pm'], ['other']]);
  expect(ranked).toEqual([later, other, earlier]);
});

it('uses resolved v2 occurrence timing rather than stale legacy dates or recurrence boundaries', () => {
  const timing = createLegacyTimingContract(event('contract', { startTime: '19:00' }));
  const stale = event('v2', { startTime: '10:00', timing });
  expect(groupVenueFeedEvents([stale, event('6pm')])[0].events.map(item => item.id)).toEqual(['6pm', 'v2']);
});

it('does not merge different locations, event types, private events, or broad-location listings', () => {
  const records = [event('a'), event('b', { address: '99 Main St, Charlottetown' }),
    event('special', { type: 'special' }), event('private', { friendEvent: { eventId: 'private' } as Event['friendEvent'] }),
    event('area', { locationScope: 'area' }), event('province', { locationScope: 'province' }),
    event('route', { locationScope: 'route' }), event('missing', { address: '', latitude: NaN, longitude: NaN })];
  expect(groupVenueFeedEvents(records)).toHaveLength(records.length);
});

it('deduplicates IDs, keeps complete matching siblings beyond a ranked page, and never adds unseeded venues', () => {
  const first = event('a');
  const sibling = event('b', { startTime: '19:00' });
  const hidden = event('other', { venue: 'Other' });
  expect(groupVenueFeedEvents([first], [first, first, sibling, hidden])[0].events).toEqual([first, sibling]);
  expect(groupVenueFeedEvents([first], [first, sibling, hidden])).toHaveLength(1);
});

it('contains only filtered inputs, with a single-card result after narrowing the category or time', () => {
  const fit = event('fit', { category: 'Workshops & Classes' });
  const dance = event('dance', { category: 'Gatherings & Parties', startTime: '19:00' });
  const tomorrow = event('tomorrow', { startDate: '2026-10-13' });
  const today = [fit, dance, tomorrow].filter(item => item.startDate === '2026-10-12');
  expect(groupVenueFeedEvents(today)[0].events).toEqual([fit, dance]);
  expect(groupVenueFeedEvents(today.filter(item => item.category === fit.category))[0].events).toEqual([fit]);
  expect(groupVenueFeedEvents([])).toEqual([]);
});

it('keeps the group key stable when the earliest event disappears and uses coordinates without an address', () => {
  expect(getVenueFeedKey(event('a'))).toBe(getVenueFeedKey(event('b', { startTime: '19:00' })));
  expect(getVenueFeedKey(event('a', { address: '' }))).not.toBe(getVenueFeedKey(event('b', { address: '', latitude: 47 })));
});
