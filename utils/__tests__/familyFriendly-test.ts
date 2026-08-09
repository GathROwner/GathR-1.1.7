import type { Event } from '../../types/events';
import {
  doesEventMatchAnyInterest,
  doesEventMatchCategoryOrFacet,
  getEventFacetKeys,
  isFamilyFriendlyEvent,
} from '../familyFriendly';

const event = (overrides: Partial<Event> = {}): Event => ({
  id: 'event-1',
  type: 'event',
  category: 'Live Music',
  title: 'All-ages concert',
  description: '',
  venue: 'Some Venue',
  address: '',
  startDate: '2026-09-01',
  endDate: '2026-09-01',
  startTime: '7:00 PM',
  endTime: '9:00 PM',
  ticketPrice: '',
  profileUrl: '',
  imageUrl: '',
  SharedPostThumbnail: '',
  latitude: 46.2,
  longitude: -63.1,
  ticketLinkPosts: '',
  ticketLinkEvents: '',
  ...overrides,
});

describe('family-friendly app facet', () => {
  it('matches a scored music event as both music and family friendly', () => {
    const scored = event({ familyFriendlyScore: 85 });
    expect(doesEventMatchCategoryOrFacet(scored, 'Live Music')).toBe(true);
    expect(doesEventMatchCategoryOrFacet(scored, 'Family Friendly')).toBe(true);
    expect(getEventFacetKeys(scored)).toEqual(['Live Music', 'Family Friendly']);
  });

  it('uses the score as authoritative over the legacy category', () => {
    const falsePositive = event({ category: 'Family Friendly', familyFriendlyScore: 30 });
    expect(isFamilyFriendlyEvent(falsePositive)).toBe(false);
    expect(getEventFacetKeys(falsePositive)).toEqual([]);
  });

  it('keeps legacy documents working before backfill', () => {
    expect(isFamilyFriendlyEvent(event({ category: 'Family Friendly', familyFriendlyScore: null }))).toBe(true);
  });

  it('matches family interest through the score without losing primary-interest matching', () => {
    const scored = event({ category: 'Sports', familyFriendlyScore: 70 });
    expect(doesEventMatchAnyInterest(scored, ['Family Friendly'])).toBe(true);
    expect(doesEventMatchAnyInterest(scored, ['Sports'])).toBe(true);
    expect(doesEventMatchAnyInterest(scored, ['Cinema'])).toBe(false);
  });
});
