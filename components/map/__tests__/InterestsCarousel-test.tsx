import React from 'react';
import { FlatList } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import InterestsCarousel from '../InterestsCarousel';
import { useMapStore } from '../../../store';
import type { Event, Cluster, Venue } from '../../../types/events';
import { DEFAULT_FILTER_CRITERIA, TimeFilterType } from '../../../types/filter';
import { getAdjacentLightboxIndex } from '../../../utils/lightboxNavigation';
import { createLegacyTimingContract, getEventScheduleState, getEventTimingBadge } from '../../../utils/eventTiming';
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
jest.mock('../../common/EventTimingBadge', () => ({ ...jest.requireActual('../../common/EventTimingBadge'), EventTimingBadge: () => null }));
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
afterEach(() => { act(() => tree.unmount()); jest.useRealTimers(); });
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

const currentLightbox = () => tree.root.findByType('StandardLightbox' as any).props;
const pressSourceCard = (index: number) => {
  const list = tree.root.findByType(FlatList).props;
  act(() => list.renderItem({ item: list.data.find((slot: any) => slot.kind === 'event' && slot.index === index) }).props.onPress());
};

it.each([0, 1, 2])('opens and traverses a status-unknown card at source position %i without map context', position => {
  jest.useFakeTimers({ now: new Date('2040-10-18T19:00:00Z') });
  const unknown = { ...events[0], id: 'soulfit', title: 'SoulFit PEI Rebound Fit', startTime: '08:30', endTime: '' };
  unknown.timing = createLegacyTimingContract(unknown, { endStatus: 'unknown' });
  const started = { ...events[1], id: 'bachata', title: 'Bachata Level 1', startTime: '15:00', endTime: '' };
  started.timing = createLegacyTimingContract(started, { endStatus: 'unknown' });
  const ongoing = { ...events[2], id: 'ongoing', startTime: '14:00', endTime: '18:00' };
  ongoing.timing = createLegacyTimingContract(ongoing, { endStatus: 'observed' });
  const ended = { ...events[3], id: 'ended', startTime: '12:00', endTime: '13:00' };
  ended.timing = createLegacyTimingContract(ended, { endStatus: 'observed' });
  const now = new Date('2040-10-18T19:00:00Z');
  expect(getEventScheduleState(unknown, now)).toMatchObject({ code: 'unknown_cutoff_passed', defaultMapEligible: false, todayEligible: true });
  expect(getEventTimingBadge(unknown, now)?.text).toBe('STATUS\nUNKNOWN');
  expect(getEventScheduleState(started, now).code).toBe('started_unknown_end');
  expect(getEventScheduleState(ongoing, now).code).toBe('happening_confirmed');
  expect(getEventScheduleState(ended, now).code).toBe('confirmed_ended');
  const visible = [started, ongoing]; visible.splice(position, 0, unknown);
  act(() => useMapStore.setState({ onScreenEvents: [...visible, ended], clusters: [{ id: 'eligible', venues: [{ locationKey: 'eligible', events: [started, ongoing] }] } as Cluster] }));
  pressSourceCard(position);
  expect(currentLightbox().event.id).toBe('soulfit');
  expect(currentLightbox().venue).toBeUndefined();
  expect(currentLightbox().events).toHaveLength(3);
  for (const direction of [-1, 1] as const) {
    for (let step = 0; step < visible.length * 2; step++) {
      const next = getAdjacentLightboxIndex(currentLightbox().currentIndex, visible.length, direction, true);
      expect(next).not.toBeNull();
      act(() => currentLightbox().onNavigate(next));
      expect(currentLightbox().event.id).toBe(visible[next!].id);
      expect(currentLightbox().currentIndex).toBe(next);
    }
  }
});

it('keeps an available selection when map context disappears and closes it only on source removal', () => {
  pressSourceCard(1);
  act(() => useMapStore.setState({ clusters: [] }));
  expect(currentLightbox().event.id).toBe('qa_1');
  expect(currentLightbox().venue).toBeUndefined();
  act(() => currentLightbox().onNavigate(0));
  expect(currentLightbox().event.id).toBe('qa_0');
  act(() => useMapStore.setState({ onScreenEvents: [events[1]] }));
  expect(tree.root.findAllByType('StandardLightbox' as any)).toHaveLength(0);
});

it('resolves delayed swipes by destination identity after reorder and rejects removed destinations and stale card taps', () => {
  act(() => seed(3)); pressSourceCard(0);
  const retainedNavigate = currentLightbox().onNavigate;
  const oldList = tree.root.findByType(FlatList).props;
  const retainedPress = oldList.renderItem({ item: oldList.data.find((slot: any) => slot.kind === 'event' && slot.index === 1) }).props.onPress;
  act(() => useMapStore.setState({ onScreenEvents: [events[2], events[0], events[1]] }));
  act(() => retainedNavigate(1));
  expect(currentLightbox().event.id).toBe('qa_1');
  expect(currentLightbox().currentIndex).toBe(2);
  act(() => useMapStore.setState({ onScreenEvents: [events[2], events[0]] }));
  expect(tree.root.findAllByType('StandardLightbox' as any)).toHaveLength(0);
  act(() => { retainedNavigate(1); retainedPress(); });
  expect(tree.root.findAllByType('StandardLightbox' as any)).toHaveLength(0);
  pressSourceCard(0);
  act(() => currentLightbox().onClose());
  pressSourceCard(1);
  expect(currentLightbox().event.id).toBe('qa_0');
});

it('ignores delayed navigation from a closed lightbox and preserves a newer open session', () => {
  pressSourceCard(0);
  const retainedNavigate = currentLightbox().onNavigate;
  const retainedClose = currentLightbox().onClose;
  act(() => currentLightbox().onClose());
  act(() => retainedNavigate(1));
  expect(tree.root.findAllByType('StandardLightbox' as any)).toHaveLength(0);
  pressSourceCard(0);
  act(() => { retainedNavigate(1); retainedClose(); });
  expect(currentLightbox().event.id).toBe('qa_0');
  act(() => currentLightbox().onNavigate(1));
  expect(currentLightbox().event.id).toBe('qa_1');
});
