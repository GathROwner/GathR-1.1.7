import React from 'react';
import { FlatList } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import InterestsCarousel from '../InterestsCarousel';
import { useMapStore } from '../../../store';
import type { Event, Cluster, Venue } from '../../../types/events';
import { DEFAULT_FILTER_CRITERIA, TimeFilterType } from '../../../types/filter';
import { getAdjacentLightboxIndex } from '../../../utils/lightboxNavigation';
jest.mock('../../../store', () => ({ useMapStore: jest.requireActual('zustand').create(() => ({})) }));
jest.mock('../../../store/clusterInteractionStore', () => { const state = { hasNewContent: () => false, recordInteraction: jest.fn(),
  carouselViewedEventIds: new Set(), markCarouselEventViewed: jest.fn(), markCarouselEventsViewed: jest.fn() };
  return { useClusterInteractionStore: () => state }; });
jest.mock('../../../utils/mapTrace', () => ({ traceMapEvent: jest.fn(), registerMapTraceSampler: () => () => {} }));
jest.mock('../../../utils/interestFilterPerfTrace', () => ({ clearInterestFilterPerfAction: jest.fn(), markInterestFilterPerfAction: jest.fn(), traceInterestFilterPerf: jest.fn() }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('expo-router', () => ({ usePathname: () => '/qa' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'Icon');
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('../EventImageLightbox', () => 'StandardLightbox');
jest.mock('../../common/FallbackImage', () => 'Poster');
jest.mock('../../common/FamilyFriendlyBadge', () => 'Badge');
jest.mock('../../common/EventTimingBadge', () => ({ EventTimingBadge: () => null }));
jest.mock('../../common/EventTimingSummaryText', () => ({ EventTimingSummaryText: () => null }));
jest.mock('../../../hooks/useEventTimingMinute', () => ({ useEventTimingMinute: () => 0 }));
const events = Array.from({ length: 13 }, (_, index) => ({ id: 'qa_' + index, title: 'Event ' + (index + 1), type: 'event',
  category: 'Live Music', venueId: 'qa', venue: 'QA venue', startDate: '2040-10-18', endDate: '2040-10-18', startTime: '12:00', endTime: '14:00' } as Event));
let tree: renderer.ReactTestRenderer;
const seed = (count: number) => {
  const visible = events.slice(0, count), venue = { locationKey: 'qa', venue: 'QA venue', events: visible } as Venue;
  useMapStore.setState({ onScreenEvents: visible, clusters: [{ id: 'qa', venues: [venue] } as Cluster], activeFilterPanel: null,
    filterCriteria: { ...DEFAULT_FILTER_CRITERIA, eventFilters: { ...DEFAULT_FILTER_CRITERIA.eventFilters,
      timeFilter: TimeFilterType.ALL, category: 'Live Music', categoryFilterSource: 'interest-pills' } } });
};
beforeEach(() => { seed(2); act(() => { tree = renderer.create(<InterestsCarousel />); }); });
afterEach(() => act(() => tree.unmount()));
it('renders two finite actual cards and keeps their lightbox looping with the exact source list', () => {
  const list = tree.root.findByType(FlatList).props;
  expect(list.data).toHaveLength(2); expect(list.snapToOffsets).toBeUndefined();
  const card = list.renderItem({ item: list.data[1] }); act(() => card.props.onPress());
  const lightbox = tree.root.findByType('StandardLightbox' as any);
  expect(lightbox.props.currentIndex).toBe(1); expect(lightbox.props.event.id).toBe('qa_1');
  expect(lightbox.props.events.map((event: Event) => event.id)).toEqual(['qa_0','qa_1']);
  expect(lightbox.props.loopNavigation).toBe(true); expect(lightbox.props.interestCarouselPaging).toBe(true);
});
it('keeps the seam passive, snap offsets on real cards, clone taps on original IDs and source positions through data changes', () => {
  act(() => seed(13)); const list = tree.root.findByType(FlatList).props;
  const seamSlot = list.data.find((item: any) => item.kind === 'seam');
  const seam = list.renderItem({ item: seamSlot });
  expect(seam.props.pointerEvents).toBe('none'); expect(seam.props.onPress).toBeUndefined();
  expect(list.snapToOffsets).not.toContain(list.getItemLayout(null, seamSlot.slot).offset);
  const lastClone = list.data.filter((item: any) => item.kind === 'event' && item.index === 12).at(-2);
  act(() => list.renderItem({ item: lastClone }).props.onPress());
  expect(tree.root.findByType('StandardLightbox' as any).props.currentIndex).toBe(12);
  expect(tree.root.findByType('StandardLightbox' as any).props.events).toHaveLength(13);
  act(() => tree.root.findByType('StandardLightbox' as any).props.onNavigate(0));
  expect(tree.root.findByType('StandardLightbox' as any).props.event.id).toBe('qa_0');
  act(() => seed(2)); expect(tree.root.findByType(FlatList).props.data).toHaveLength(2);
  expect(tree.root.findByType('StandardLightbox' as any).props.currentIndex).toBe(0);
  expect(tree.root.findByType('StandardLightbox' as any).props.events).toHaveLength(2);
  act(() => seed(3)); expect(tree.root.findByType(FlatList).props.data.filter((item: any) => item.kind === 'seam')).toHaveLength(5);
  act(() => seed(2)); expect(tree.root.findByType(FlatList).props.data.every((item: any) => item.kind === 'event')).toBe(true);
});
it('gives the first real drag ownership even if native omitted its initial-offset notification', () => {
  act(() => seed(13)); const list = tree.root.findByType(FlatList).props;
  const lastSlot = list.initialScrollIndex + 12;
  act(() => { list.onScrollBeginDrag(); list.onScroll({ nativeEvent: { contentOffset: { x: list.getItemLayout(null, lastSlot).offset + 30 } } }); });
  const surface = tree.root.findAll(node => node.props.pointerEvents === 'box-none' && typeof node.props.onLayout === 'function')[0];
  act(() => surface.props.onLayout({ nativeEvent: { layout: { width: 320 } } }));
  expect(tree.root.findByType(FlatList).props.initialScrollIndex).toBe(lastSlot);
});
it.each([2, 3])('keeps category lightbox boundary identities across %i separate venue contexts and live reordering', count => {
  act(() => {
    seed(count);
    useMapStore.setState({ clusters: events.slice(0, count).map((event, index) => ({ id: 'cluster_' + index,
      venues: [{ locationKey: 'venue_' + index, venue: 'Venue ' + index, events: [event] }] } as Cluster)) });
  });
  const list = tree.root.findByType(FlatList).props;
  act(() => list.renderItem({ item: list.data.find((slot: any) => slot.kind === 'event' && slot.index === 0) }).props.onPress());
  const current = () => tree.root.findByType('StandardLightbox' as any).props;
  act(() => current().onNavigate(getAdjacentLightboxIndex(current().currentIndex, count, -1, current().loopNavigation)));
  expect(current().event.id).toBe(events[count - 1].id);
  expect(current().venue.locationKey).toBe('venue_' + (count - 1));
  act(() => current().onNavigate(getAdjacentLightboxIndex(current().currentIndex, count, 1, current().loopNavigation)));
  expect(current().event.id).toBe(events[0].id);
  act(() => useMapStore.setState({ onScreenEvents: events.slice(0, count).reverse() }));
  expect(current().event.id).toBe(events[0].id);
  expect(current().currentIndex).toBe(count - 1);
  act(() => current().onNavigate(getAdjacentLightboxIndex(current().currentIndex, count, 1, current().loopNavigation)));
  expect(current().event.id).toBe(events[count - 1].id);
  expect(current().currentIndex).toBe(0);
});
