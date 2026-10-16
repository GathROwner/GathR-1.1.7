import React from 'react';
import { AppState } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Event } from '../../../types/events';
import AreaLocationBrowser from '../AreaLocationBrowser';
import { useMapStore } from '../../../store/mapStore';
import { areaActivityKey } from '../../../utils/areaActivityCache';
import { EVENTS_MINIMAL, EVENT_DETAILS_SCHEMA_VERSION } from '../../../lib/queryKeys';
import { participationArea } from '../../../utils/__tests__/fixtures/areaParticipation';

jest.mock('../../../config/firebaseConfig', () => ({ auth: { currentUser: null }, firestore: {} }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'Icon');
jest.mock('../../../hooks/useEventTimingMinute', () => ({ useEventTimingMinute: () => 0 }));
jest.mock('../../common/FallbackImage', () => 'Poster');
jest.mock('../EventImageLightbox', () => 'StandardLightbox');
jest.mock('../../../store/mapStore', () => ({ useMapStore: jest.requireActual('zustand').create(() => ({ events: [], allEvents: [], lastFetchedAt: null })) }));

const venue = { id: 'tivoli', label: 'Tivoli', venueId: 'tivoli', certainty: 'confirmed' as const,
  coordinates: { latitude: 46.23, longitude: -63.12 }, linkedEventIds: ['film', 'second'] };
const group = { id: 'shared', coordinates: venue.coordinates, locations: [venue,
  { ...venue, id: 'dali', label: 'Dali', venueId: 'dali', linkedEventIds: [] }] };
const umbrella = { id: 'festival', title: 'Anchor Fest', startDate: '2040-10-14', endDate: '2040-10-18', startTime: '', endTime: '',
  locationScope: 'area', areaData: { version: 1, status: 'verified', locations: group.locations } } as Event;
const film = { id: 'fb_film', type: 'event', title: 'Film One', venue: 'Tivoli', venueId: 'tivoli', category: 'Cinema',
  startDate: '2040-10-16', endDate: '2040-10-16', startTime: '19:00', endTime: '21:00' } as Event;
const second = { ...film, id: 'fb_second', title: 'Film Two', startTime: '22:00', endTime: '23:00' };
const pump = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); };
const pending = () => { let resolve!: (value: any) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let tree: renderer.ReactTestRenderer;
let client: QueryClient;
const load = jest.fn();
const close = jest.fn();
const seed = (records: Event[], age = 0) => useMapStore.setState({ events: records, allEvents: records, lastFetchedAt: Date.now() - age });
async function mount(props: Partial<React.ComponentProps<typeof AreaLocationBrowser>> = {}, setup?: (query: QueryClient) => void) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); setup?.(client);
  act(() => { tree = renderer.create(<QueryClientProvider client={client}><AreaLocationBrowser umbrella={umbrella} group={group}
    loadActivity={load} onClose={close} {...props} /></QueryClientProvider>); }); await pump();
}
const press = async (label: string) => { await act(async () => { tree.root.findByProps({ accessibilityLabel: label }).props.onPress(); }); await pump(); };
const rows = () => [...new Map(tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Open ') && typeof node.props.onPress === 'function').map(node => [node.props.accessibilityLabel, node])).values()];
const text = () => JSON.stringify(tree.toJSON());
const count = () => tree.root.findByProps({ testID: 'festival-activity-count' }).props.children;
beforeEach(() => { seed([]); load.mockReset(); close.mockReset(); load.mockImplementation(async id => ({ status: 'found', event: id === 'second' ? second : film })); });
afterEach(() => { act(() => tree?.unmount()); client?.clear(); });

it('shows instructions, address and source for a public-shaped participation hunt without a fake missing programme', async () => {
  const hunt = participationArea(); const point = hunt.areaData!.locations[0];
  await mount({ umbrella: hunt, group: { id: point.id, coordinates: point.coordinates, locations: [point] } });
  expect(text()).toContain('Participating hunt location'); expect(text()).toContain('Take part here');
  expect(text()).toContain('Take a selfie'); expect(text()).toContain('Check location opening hours before visiting.');
  expect(text()).toContain(point.address!); expect(text()).toContain(hunt.areaData!.sourceLabel!);
  expect(text()).not.toContain('Festival activities'); expect(text()).not.toContain('No linked activities');
  expect(tree.root.findAllByProps({ testID: 'festival-activity-count' })).toHaveLength(0);
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Refresh festival programme' })).toHaveLength(0);
  expect(load).not.toHaveBeenCalled();
});
it('keeps a genuinely unlinked festival programme honest', async () => {
  const festival = participationArea({ title: 'Autumn Arts Festival', description: 'A festival across local venues.' });
  const point = festival.areaData!.locations[0];
  await mount({ umbrella: festival, group: { id: point.id, coordinates: point.coordinates, locations: [point] } });
  expect(count()).toBe(0); expect(text()).toContain('Confirmed festival location');
  expect(text()).toContain('no upcoming activities have been linked here yet'); expect(text()).not.toContain('Take part here');
});
it('uses neutral details for an unrelated area instead of festival assumptions', async () => {
  const generic = participationArea({ title: 'Outdoor Art Walk', description: 'Artwork around the neighbourhood.' });
  const point = generic.areaData!.locations[0];
  await mount({ umbrella: generic, group: { id: point.id, coordinates: point.coordinates, locations: [point] } });
  expect(text()).toContain('Confirmed event location'); expect(text()).toContain('About this location');
  expect(text()).not.toContain('Festival activities'); expect(text()).not.toContain('Take part here');
});
it.each(['unavailable', 'expired'])('keeps explicit hunt-title links in programme mode even when every linked child is %s', async status => {
  const hunt = participationArea(); const point = { ...hunt.areaData!.locations[0], linkedEventIds: ['qa_missing'] };
  hunt.areaData!.locations[0] = point;
  load.mockResolvedValue(status === 'unavailable' ? { status: 'unavailable' }
    : { status: 'found', event: { ...film, id: 'fb_qa_missing', venueId: point.venueId, isExpired: true } });
  await mount({ umbrella: hunt, group: { id: point.id, coordinates: point.coordinates, locations: [point] } });
  expect(load).toHaveBeenCalledTimes(1); expect(count()).toBe(0); expect(text()).toContain('No linked activities available');
  expect(text()).not.toContain('Take part here'); expect(tree.root.findByProps({ accessibilityLabel: 'Refresh festival programme' })).toBeTruthy();
});

it('requires a venue choice and fetches only its explicit IDs', async () => {
  await mount(); expect(load).not.toHaveBeenCalled(); await press('View festival activities at Tivoli');
  expect(load.mock.calls.map(call => call[0])).toEqual(['film', 'second']); expect(count()).toBe(2);
});
it('shows preloaded cards immediately without requests and opens/pages/returns synchronously', async () => {
  seed([film, second]); await mount({ group: { ...group, locations: [venue] } });
  expect(count()).toBe(2); expect(load).not.toHaveBeenCalled(); expect(text()).not.toContain('Loading activities');
  expect(rows().every(row => !row.props.disabled)).toBe(true);
  act(() => rows()[0].props.onPress());
  const lightbox = tree.root.findByType('StandardLightbox' as any);
  expect(lightbox.props.event.id).toBe('fb_film'); expect(lightbox.props.calloutPaging).toBe(true);
  act(() => lightbox.props.onNavigate(1)); expect(tree.root.findByType('StandardLightbox' as any).props.event.id).toBe('fb_second');
  act(() => tree.root.findByType('StandardLightbox' as any).props.onClose());
  expect(tree.root.findAllByType('StandardLightbox' as any)).toHaveLength(0); expect(count()).toBe(2);
  expect(load).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
it('loads only a missing ID while known cards remain usable and the count is explicitly partial', async () => {
  seed([film]); const next = pending(); load.mockReturnValue(next.promise);
  await mount({ group: { ...group, locations: [venue] } });
  expect(load.mock.calls.map(call => call[0])).toEqual(['second']); expect(count()).toBe('1+');
  act(() => rows()[0].props.onPress()); expect(tree.root.findByType('StandardLightbox' as any).props.event.id).toBe('fb_film');
  next.resolve({ status: 'found', event: second }); await pump(); expect(count()).toBe(2);
});
it('shows an honest cold state and each result immediately, without a Promise.all list barrier', async () => {
  const first = pending(), next = pending(); load.mockImplementation(id => id === 'film' ? first.promise : next.promise);
  await mount({ group: { ...group, locations: [venue] } });
  expect(count()).toBe('…'); expect(text()).toContain('Loading activities'); expect(text()).not.toContain('No linked activities');
  first.resolve({ status: 'found', event: film }); await pump(); expect(count()).toBe('1+'); expect(rows().length).toBe(1);
  next.resolve({ status: 'found', event: second }); await pump(); expect(count()).toBe(2);
});
it('keeps stale cards enabled during bounded background refresh and avoids a duplicate open fetch', async () => {
  seed([film, second], 4 * 60000); const first = pending(), next = pending();
  load.mockImplementation(id => id === 'film' ? first.promise : next.promise);
  await mount({ group: { ...group, locations: [venue] } }); expect(count()).toBe(2);
  expect(text()).not.toContain('Loading activities'); expect(rows().every(row => !row.props.disabled)).toBe(true);
  act(() => rows()[0].props.onPress()); expect(load).toHaveBeenCalledTimes(2);
  first.resolve({ status: 'found', event: { ...film, title: 'Updated film' } }); await pump(); expect(text()).toContain('Updated film');
  next.resolve({ status: 'found', event: second }); await pump();
});
it('explicit refresh removes confirmed 404/cancellation, closes unavailable selection and prevents stale revival', async () => {
  seed([film, second]); await mount({ group: { ...group, locations: [venue] } }); act(() => rows()[0].props.onPress());
  load.mockImplementation(async id => id === 'film' ? { status: 'unavailable' } : { status: 'found', event: { ...second, isCancelled: true } });
  await press('Refresh festival programme'); expect(count()).toBe(0);
  expect(tree.root.findAllByType('StandardLightbox' as any)).toHaveLength(0);
  act(() => seed([film], 8 * 60000)); await pump(); expect(count()).toBe(0);
  expect(client.getQueryData(areaActivityKey('film'))).toMatchObject({ status: 'unavailable' });
  load.mockImplementation(async id => ({ status: 'found', event: id === 'film' ? film : second }));
  await press('Refresh festival programme'); expect(count()).toBe(2); expect(tree.root.findAllByType('StandardLightbox' as any)).toHaveLength(0);
});
it('retains valid cached cards after a network failure and still opens them', async () => {
  seed([film, second], 4 * 60000); load.mockRejectedValue(new Error('offline'));
  await mount({ group: { ...group, locations: [venue] } }); expect(count()).toBe(2); expect(text()).toContain('could not be refreshed');
  act(() => rows()[0].props.onPress()); expect(tree.root.findAllByType('StandardLightbox' as any)).toHaveLength(1);
});
it('treats legacy/custom nullable loading as uncertainty instead of confirmed deletion', async () => {
  seed([film, second], 4 * 60000); await mount({ group: { ...group, locations: [venue] }, loadActivity: undefined, loadEvent: async () => null });
  expect(count()).toBe(2); expect(text()).toContain('could not be refreshed');
});
it('reuses current-version details and ignores older unsupported query generations', async () => {
  await mount({ group: { ...group, locations: [venue] } }, query => {
    query.setQueryData(['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'film,second'], [film, second]);
    query.setQueryData(['event-details', 'original-source-v2', 'film'], [{ ...film, title: 'Wrong old cache' }]);
  }); expect(count()).toBe(2); expect(load).not.toHaveBeenCalled(); expect(text()).not.toContain('Wrong old cache');
});
it('newer corrected details beat older cancelled feed/store copies; newer cancellation then wins', async () => {
  const old = Date.now() - 60000; seed([{ ...film, isCancelled: true }], 60000);
  await mount({ group: { ...group, locations: [{ ...venue, linkedEventIds: ['film'] }] } }, query => {
    query.setQueryData(EVENTS_MINIMAL, { combinedData: [{ ...film, isCancelled: true }], fetchedAt: old });
    query.setQueryData(['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'film'], [film]);
  }); expect(count()).toBe(1); expect(load).not.toHaveBeenCalled();
  act(() => { client.setQueryData(['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'film'], [{ ...film, isCancelled: true }]); });
  await pump(); expect(count()).toBe(0);
});
it('does not overwrite newer canonical detail arriving during an older request', async () => {
  seed([film], 4 * 60000); const request = pending(); load.mockReturnValue(request.promise);
  await mount({ group: { ...group, locations: [{ ...venue, linkedEventIds: ['film'] }] } });
  act(() => { client.setQueryData(['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'film'], [{ ...film, title: 'Newer canonical' }]); });
  await pump(); request.resolve({ status: 'found', event: { ...film, title: 'Older response' } }); await pump();
  expect(text()).toContain('Newer canonical'); expect(text()).not.toContain('Older response');
});
it('does not mistake a recreated old object for newer freshness during a request', async () => {
  const old = Date.now() - 4 * 60000; seed([film], 4 * 60000); const request = pending(); load.mockReturnValue(request.promise);
  await mount({ group: { ...group, locations: [{ ...venue, linkedEventIds: ['film'] }] } });
  act(() => useMapStore.setState({ events: [{ ...film }], allEvents: [{ ...film }], lastFetchedAt: old }));
  request.resolve({ status: 'found', event: { ...film, title: 'Fresh response' } }); await pump();
  expect(text()).toContain('Fresh response');
});
it('does not admit unrelated/other-venue/recurring or expired cached records', async () => {
  const invalid = [{ ...film, venueId: 'other' }, { ...second, isRecurring: true }, { ...film, id: 'nonlinked' }];
  seed(invalid); await mount({ group: { ...group, locations: [venue] } }); expect(count()).toBe(0); expect(rows()).toHaveLength(0);
});
it('ignores late work after venue navigation and never opens a late lightbox', async () => {
  const request = pending(); load.mockReturnValue(request.promise); await mount(); await press('View festival activities at Tivoli');
  await press('Back to venues at this location'); await press('View festival activities at Dali');
  request.resolve({ status: 'found', event: film }); await pump();
  expect(tree.root.findAllByType('StandardLightbox' as any)).toHaveLength(0); expect(text()).not.toContain('Film One');
  expect(count()).toBe(0);
});
it('limits concurrent requests and renders early arrivals while later IDs are queued', async () => {
  const jobs = Array.from({ length: 6 }, pending); load.mockImplementation(id => jobs[Number(id)].promise);
  const many = { ...venue, linkedEventIds: jobs.map((_, index) => String(index)) };
  await mount({ group: { ...group, locations: [many] } }); expect(load).toHaveBeenCalledTimes(4);
  jobs[0].resolve({ status: 'found', event: { ...film, id: 'fb_0' } }); await pump();
  expect(load).toHaveBeenCalledTimes(5); expect(count()).toBe('1+');
  jobs.forEach((job, index) => job.resolve({ status: 'found', event: { ...film, id: 'fb_' + index } })); await pump(); expect(count()).toBe(6);
});

it('revalidates stale entries on foreground without an independent polling cycle', async () => {
  let activate: ((state: 'active') => void) | undefined;
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => {
    activate = callback; return { remove: jest.fn() };
  });
  seed([film, second]); await mount({ group: { ...group, locations: [venue] } }); expect(load).not.toHaveBeenCalled();
  const old = Date.now() - 4 * 60000;
  act(() => {
    useMapStore.setState({ lastFetchedAt: old });
    client.setQueryData(areaActivityKey('film'), { status: 'found', event: film, checkedAt: old }, { updatedAt: old });
    client.setQueryData(areaActivityKey('second'), { status: 'found', event: second, checkedAt: old }, { updatedAt: old });
    activate?.('active');
  }); await pump(); expect(load).toHaveBeenCalledTimes(2); expect(count()).toBe(2);
  listener.mockRestore();
});
