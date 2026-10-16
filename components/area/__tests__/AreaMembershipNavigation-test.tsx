import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AreaMembershipNavigationProvider } from '../AreaMembershipNavigation';
import { AreaEventMembershipLinks, VenueHuntMembershipLinks } from '../AreaMembershipLinks';
import { useMapStore } from '../../../store/mapStore';
import { participationArea } from '../../../utils/__tests__/fixtures/areaParticipation';
import { EVENTS_MINIMAL, EVENT_DETAILS_SCHEMA_VERSION } from '../../../lib/queryKeys';
import { TimeFilterType, DEFAULT_FILTER_CRITERIA } from '../../../types/filter';
import type { Event, Venue } from '../../../types/events';
import { areaMembershipRootKey, getAreaMembershipSnapshot } from '../../../hooks/useAreaMembershipIndex';
import { areaActivityKey } from '../../../utils/areaActivityCache';

jest.mock('../../../config/firebaseConfig', () => ({ auth: {}, firestore: {} }));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'Icon');
jest.mock('../../map/EventImageLightbox', () => 'ParentDetails');
jest.mock('../../../hooks/useEventTimingMinute', () => ({ useEventTimingMinute: () => Math.floor(Date.now() / 60000) }));
jest.mock('../../../store/mapStore', () => ({ useMapStore: jest.requireActual('zustand').create(() => ({
  events: [], allEvents: [], lastFetchedAt: null, filterCriteria: jest.requireActual('../../../types/filter').DEFAULT_FILTER_CRITERIA,
})) }));

const instant = new Date('2040-10-16T15:00:00Z').getTime();
const parent = () => {
  const root = participationArea({ id: 'fb_qa_parent', title: 'Autumn Festival', sourceUrl: 'https://example.com/qa/root' });
  root.areaData!.locations[0].linkedEventIds = ['qa_child']; return root;
};
const child: Event = { ...participationArea(), id: 'fb_qa_child', title: 'Workshop', locationScope: 'venue', areaData: null,
  venueId: 'qa_library', startDate: '2040-10-16', endDate: '2040-10-16', startTime: '18:00', endTime: '21:00' };
let client: QueryClient, tree: renderer.ReactTestRenderer;
const loader = jest.fn();
const pump = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); };
const seed = (root = parent(), age = 0) => {
  const all = [root, child], fetchedAt = instant - age;
  useMapStore.setState({ events: all, allEvents: all, lastFetchedAt: fetchedAt });
  client.setQueryData(EVENTS_MINIMAL, { combinedData: all, fetchedAt });
};
const mount = async (content = <AreaEventMembershipLinks event={child} />) => {
  act(() => { tree = renderer.create(<QueryClientProvider client={client}><AreaMembershipNavigationProvider loadParent={loader}>
    {content}</AreaMembershipNavigationProvider></QueryClientProvider>); }); await pump();
};
const button = () => tree.root.findAll(node => typeof node.props.onPress === 'function'
  && String(node.props.accessibilityLabel || '').startsWith('View '))[0];
const details = () => tree.root.findAllByType('ParentDetails' as any);
beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(instant); client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  useMapStore.setState({ events: [], allEvents: [], lastFetchedAt: null, filterCriteria: DEFAULT_FILTER_CRITERIA }); loader.mockReset(); });
afterEach(() => { act(() => tree?.unmount()); client.clear(); jest.restoreAllMocks(); });

it('opens a ready cached parent synchronously, stops bubbling and locks rapid taps to one modal; close retains origin state', async () => {
  seed(); await mount(); const before = useMapStore.getState(); const stopPropagation = jest.fn();
  act(() => { button().props.onPress({ stopPropagation }); button().props.onPress({ stopPropagation }); });
  expect(stopPropagation).toHaveBeenCalledTimes(2); expect(details()).toHaveLength(1); expect(loader).not.toHaveBeenCalled();
  expect(details()[0].props.event.id).toBe('fb_qa_parent'); expect(details()[0].props.managedEventDetails).toBe(true);
  act(() => details()[0].props.onClose()); expect(details()).toHaveLength(0);
  expect(useMapStore.getState().events).toBe(before.events); expect(useMapStore.getState().filterCriteria).toBe(before.filterCriteria);
});
it('uses newer canonical details despite an older matching store root and closes on membership removal', async () => {
  seed(); const corrected = { ...parent(), title: 'Corrected Festival' };
  client.setQueryData(['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'qa_parent'], [corrected], { updatedAt: instant });
  // Feed and detail clocks differ, so actual detail authority is unambiguous.
  client.setQueryData(EVENTS_MINIMAL, { combinedData: [parent(), child], fetchedAt: instant - 10000 });
  await mount(); act(() => button().props.onPress({ stopPropagation: jest.fn() }));
  expect(details()[0].props.event.title).toBe('Corrected Festival'); expect(loader).not.toHaveBeenCalled();
  const removed = parent(); removed.areaData!.locations[0].linkedEventIds = [];
  act(() => { client.setQueryData(['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'qa_parent'], [removed], { updatedAt: instant + 1 }); });
  await pump(); expect(details()).toHaveLength(0); expect(button()).toBeUndefined();
});
it('validates a stale parent once in background, keeps it open on failure, and removes confirmed 404', async () => {
  seed(parent(), 4 * 60000); loader.mockRejectedValue(new Error('offline')); await mount();
  act(() => { button().props.onPress({ stopPropagation: jest.fn() }); }); expect(details()).toHaveLength(1);
  await pump(); expect(loader).toHaveBeenCalledTimes(1); expect(details()).toHaveLength(1);
  act(() => details()[0].props.onClose()); loader.mockResolvedValue({ status: 'unavailable' });
  act(() => button().props.onPress({ stopPropagation: jest.fn() })); await pump();
  expect(details()).toHaveLength(0); expect(button()).toBeUndefined();
  expect(client.getQueryData(areaMembershipRootKey('qa_parent'))).toMatchObject({ status: 'unavailable' });
});
it('retains a newer root arriving while an older validation response is in flight', async () => {
  seed(parent(), 4 * 60000); let finish!: (result: any) => void;
  loader.mockReturnValue(new Promise(resolve => { finish = resolve; })); await mount();
  act(() => button().props.onPress({ stopPropagation: jest.fn() })); await pump();
  const updated = { ...parent(), title: 'Newer programme' };
  act(() => { client.setQueryData(['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'qa_parent'], [updated], { updatedAt: instant }); });
  finish({ status: 'unavailable' }); await pump();
  expect(details()[0].props.event.title).toBe('Newer programme');
  expect(client.getQueryData(areaMembershipRootKey('qa_parent'))).toMatchObject({ status: 'found', event: { title: 'Newer programme' } });
});
it('cannot revive a newer confirmed absence with an older in-flight successful response', async () => {
  seed(parent(), 4 * 60000); let finish!: (result: any) => void;
  loader.mockReturnValue(new Promise(resolve => { finish = resolve; })); await mount();
  act(() => button().props.onPress({ stopPropagation: jest.fn() })); await pump();
  act(() => { client.setQueryData(areaActivityKey('qa_parent'), { status: 'unavailable', checkedAt: instant }); });
  finish({ status: 'found', event: parent() }); await pump();
  expect(details()).toHaveLength(0); expect(button()).toBeUndefined();
  expect(client.getQueryData(areaMembershipRootKey('qa_parent'))).toMatchObject({ status: 'unavailable' });
});
it('shares one cached reverse index across ordinary component/filter rerenders', async () => {
  seed(); await mount(); const before = getAreaMembershipSnapshot(client);
  act(() => { useMapStore.setState({ filterCriteria: { ...DEFAULT_FILTER_CRITERIA, showEvents: false } }); }); await pump();
  act(() => { useMapStore.setState({ events: [...useMapStore.getState().events] }); }); await pump();
  expect(getAreaMembershipSnapshot(client)).toBe(before); expect(loader).not.toHaveBeenCalled();
});
it('shares one in-flight parent validation when closing and reopening a stale parent', async () => {
  seed(parent(), 4 * 60000); let finish!: (result: any) => void;
  loader.mockReturnValue(new Promise(resolve => { finish = resolve; })); await mount();
  act(() => button().props.onPress({ stopPropagation: jest.fn() })); await pump();
  act(() => details()[0].props.onClose());
  act(() => button().props.onPress({ stopPropagation: jest.fn() })); await pump();
  expect(loader).toHaveBeenCalledTimes(1); expect(details()).toHaveLength(1);
  finish({ status: 'found', event: parent() }); await pump(); expect(details()).toHaveLength(1);
});
it('shows a confirmed partial-hunt panel in a specials-only venue with showEvents false, without adding counts or changing tabs/filters', async () => {
  const hunt = participationArea({ sourceUrl: 'https://example.com/qa/hunt' }); hunt.areaData!.status = 'partial';
  seed(hunt); const special = { ...child, type: 'special' as const };
  useMapStore.setState({ filterCriteria: { ...DEFAULT_FILTER_CRITERIA, showEvents: false } });
  const venue = { venue: 'Example Café', events: [special] } as Venue;
  const before = useMapStore.getState(); await mount(<VenueHuntMembershipLinks venue={venue} filterType="special" />);
  expect(JSON.stringify(tree.toJSON())).toContain('PARTICIPATING IN');
  expect(JSON.stringify(tree.toJSON())).toContain('Check location opening hours');
  act(() => button().props.onPress({ stopPropagation: jest.fn() })); expect(details()).toHaveLength(1);
  act(() => details()[0].props.onClose()); expect(venue.events).toHaveLength(1); expect(venue.events[0].type).toBe('special');
  expect(useMapStore.getState().filterCriteria).toBe(before.filterCriteria);
  act(() => useMapStore.setState({ filterCriteria: { ...before.filterCriteria, specialFilters: { timeFilter: TimeFilterType.UPCOMING,
    upcomingDate: { kind: 'custom', startDate: '2040-11-01', endDate: '2040-11-02' } } } })); await pump();
  expect(tree.root.findAllByProps({ testID: 'venue-hunt-memberships' })).toHaveLength(0);
});
