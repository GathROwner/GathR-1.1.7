import type { Cluster, Event, Venue } from '../../types/events';
import { buildHybridVenues, usesCurrentBasemap, visibleHybridCategories } from '../hybridClusterPresentation';

const event = (id: string, category = 'Music', type: 'event' | 'special' = 'event') => ({ id, category, type, profileUrl: '' } as Event);
const venue = (key: string, events: Event[]) => ({ locationKey: key, venue: key, events } as Venue);
const cluster = (venues: Venue[]) => ({ venues } as Cluster);

describe('Hybrid marker data and basemap isolation', () => {
  it('uses Current for Hybrid without changing Standard/GathR imports', () => {
    expect(['current', 'standard', 'gathr', 'hybrid'].map(usesCurrentBasemap)).toEqual([true, false, false, true]);
  });
  it('keeps venue positions stable and includes venues without photos/content', () => {
    const a = venue('a', [event('one')]), b = venue('b', []);
    expect(buildHybridVenues(cluster([b, a]), () => false).map(v => [v.key, v.photo])).toEqual([['a', ''], ['b', '']]);
  });
  it('counts unique filtered items and keeps event/special categories distinct', () => {
    const item = event('one');
    const result = buildHybridVenues(cluster([venue('a', [item, item, event('two'), event('offer', 'Music', 'special')])]), () => false)[0];
    expect(result.categories.map(c => [c.type, c.count])).toEqual([['event', 2], ['special', 1]]);
  });
  it('uses the venue tracking key and actual category item IDs for newness', () => {
    const fresh = jest.fn((key: string, ids: string[]) => key === 'a' && ids.includes('new'));
    const result = buildHybridVenues(cluster([venue('a', [event('new'), event('old', 'Trivia')])]), fresh)[0];
    expect(result.categories.find(c => c.category === 'Music')?.isNew).toBe(true);
    expect(result.categories.find(c => c.category === 'Trivia')?.isNew).toBe(false);
    expect(fresh).toHaveBeenCalledWith('a', ['new']);
  });
  it('binds authorized friends to their venue rather than the displayed photo', () => {
    const data = { ...cluster([venue('b', []), venue('a', [])]), friendPresence: { venues: { a: { friendCount: 2 } } } } as unknown as Cluster;
    expect(buildHybridVenues(data, () => false).map(v => v.friendCount)).toEqual([2, 0]);
  });
  it('prefers profile images and refuses local/invalid URLs', () => {
    const events = [{ ...event('one'), profileUrl: 'file:///private/image' }, { ...event('two'), profileUrl: 'https://example.com/avatar.jpg' }];
    expect(buildHybridVenues(cluster([venue('a', events)]), () => false)[0].photo).toBe('https://example.com/avatar.jpg');
  });
  it('keeps hidden-category newness visible through the existing overflow cue', () => {
    const categories = Array.from({ length: 6 }, (_, i) => ({ key: String(i), category: String(i), type: 'event' as const, count: 6 - i, isNew: i === 5 }));
    expect(visibleHybridCategories(categories)).toMatchObject({ overflow: 3, hiddenNew: true });
    expect(visibleHybridCategories(categories).visible.map(c => c.key)).toEqual(['0', '1', '2']);
  });
});
