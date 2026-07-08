jest.mock('../privateSharedEvents', () => ({
  fetchPrivateSharedEventsForCurrentUser: jest.fn(async () => []),
}));
jest.mock('../../../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  firestore: {},
}));

import { dedupeEvents } from '../events';
import type { Event } from '../../../types/events';

const makeEvent = (overrides: Partial<Event>): Event =>
  ({
    id: 'e1',
    type: 'event',
    category: 'Community',
    title: 'Farm Day in the City',
    description: '',
    venue: 'Confederation Landing',
    address: '1 Great George St',
    startDate: '2026-09-13',
    endDate: '2026-09-13',
    startTime: '10:00 AM',
    endTime: '4:00 PM',
    ticketPrice: '',
    profileUrl: '',
    imageUrl: '',
    SharedPostThumbnail: '',
    latitude: 46.23,
    longitude: -63.12,
    ticketLinkPosts: '',
    ticketLinkEvents: '',
    locationScope: 'venue',
    ...overrides,
  } as Event);

const cityTwin = (overrides: Partial<Event> = {}): Event =>
  makeEvent({
    id: 'city1',
    venue: 'Charlottetown, PEI',
    address: 'Charlottetown, PEI',
    locationScope: 'city',
    locationLabel: 'Charlottetown, PEI',
    locationCity: 'Charlottetown',
    ...overrides,
  });

describe('dedupeEvents scoped-location precedence', () => {
  it('keeps the venue-resolved copy and drops the scoped twin', () => {
    const venueCopy = makeEvent({ id: 'venue1' });
    const result = dedupeEvents([cityTwin(), venueCopy]);
    expect(result.map((e) => e.id)).toEqual(['venue1']);
  });

  it('keeps the venue-resolved copy regardless of input order', () => {
    const venueCopy = makeEvent({ id: 'venue1' });
    const result = dedupeEvents([venueCopy, cityTwin()]);
    expect(result.map((e) => e.id)).toEqual(['venue1']);
  });

  it('keeps a scoped event when no venue twin exists', () => {
    const result = dedupeEvents([cityTwin()]);
    expect(result.map((e) => e.id)).toEqual(['city1']);
  });

  it('collapses multiple scoped copies of the same event to one', () => {
    const a = cityTwin({ id: 'cityA' });
    const b = cityTwin({ id: 'cityB', venue: 'Downtown Charlottetown' });
    const result = dedupeEvents([a, b]);
    expect(result).toHaveLength(1);
  });

  it('does not cross-match different events', () => {
    const venueCopy = makeEvent({ id: 'venue1' });
    const unrelatedCity = cityTwin({ id: 'city2', title: 'Street Feast' });
    const result = dedupeEvents([venueCopy, unrelatedCity]);
    expect(result.map((e) => e.id).sort()).toEqual(['city2', 'venue1']);
  });
});
