import React, { useState } from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import VenueEventRow from '../VenueEventRow';
import type { Event } from '../../../types/events';
import { TimeFilterType } from '../../../types/filter';

const mockScrollTo = jest.fn();
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return { ScrollView: React.forwardRef(function MockPager(props: any, ref: any) {
    React.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
    return <View {...props} />;
  }) };
});
jest.mock('@expo/vector-icons', () => ({ MaterialIcons: () => null }));
jest.mock('../FallbackImage', () => () => null);
jest.mock('../VenueFavoriteButton', () => ({ VenueFavoriteButton: () => null }));
jest.mock('../../../hooks/useReduceMotion', () => ({ useReduceMotion: () => false }));

const events = Array.from({ length: 8 }, (_, index) => ({
  id: `event-${index}`, venue: 'Soul Fit PEI', address: '10 Main St, Charlottetown',
  title: `Event ${index}`, type: 'event', startTime: `${18 + index}:00`,
} as Event));
const rendered = jest.fn((event: Event, grouped: boolean) => <Text>{`${event.id}:${grouped}`}</Text>);
const selection = jest.fn();
function Harness({ records = events, initial = events[0].id }: { records?: Event[]; initial?: Event['id'] }) {
  const [id, setId] = useState(String(initial));
  return <VenueEventRow group={{ key: 'venue', events: records }} timeFilter={TimeFilterType.TODAY}
    selectedEventId={id} onSelectEvent={event => { selection(event.id); setId(String(event.id)); }} renderEvent={rendered} />;
}
let tree: renderer.ReactTestRenderer;
beforeEach(() => { rendered.mockClear(); selection.mockClear(); mockScrollTo.mockClear(); });
afterEach(() => { if (tree) act(() => tree.unmount()); });
function mount(props = {}) {
  act(() => { tree = renderer.create(<Harness {...props} />); });
  act(() => tree.root.findAllByProps({ testID: 'venue-event-viewport' })[0].props.onLayout({ nativeEvent: { layout: { width: 360 } } }));
}
function settle(x: number) {
  act(() => tree.root.findAllByProps({ testID: 'venue-event-pager' })[0].props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x } } }));
}

it('renders only the current and adjacent event cards, not every heavy card in a large venue', () => {
  mount();
  expect(new Set(rendered.mock.calls.map(([event]) => event.id))).toEqual(new Set(['event-0', 'event-1']));
  rendered.mockClear(); settle(360 * 3);
  expect(selection).toHaveBeenLastCalledWith('event-3');
  expect(new Set(rendered.mock.calls.map(([event]) => event.id))).toEqual(new Set(['event-2', 'event-3', 'event-4']));
});

it('settles to matching events, clamps both ends, and does not loop', () => {
  mount(); settle(-20); expect(selection).not.toHaveBeenCalled();
  settle(360); expect(selection).toHaveBeenLastCalledWith('event-1');
  settle(9999); expect(selection).toHaveBeenLastCalledWith('event-7');
  expect(tree.root.findAllByProps({ testID: 'venue-event-next' })).toHaveLength(0);
});

it('restores a selected event by ID and falls back to the first when filters remove it', () => {
  mount({ initial: 'event-3' });
  expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 1080, animated: false });
  act(() => tree.update(<Harness records={events.slice(5)} initial="event-3" />));
  expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 0, animated: false });
});

it('renders a single matching event with the existing normal-card treatment', () => {
  act(() => { tree = renderer.create(<Harness records={[events[0]]} />); });
  expect(rendered).toHaveBeenCalledWith(events[0], false);
  expect(tree.root.findAllByProps({ testID: 'venue-event-row' })).toHaveLength(0);
});

it('shows only available hero arrows and taps use the same animated pager as swipes', () => {
  mount({ records: events.slice(0, 3) });
  expect(tree.root.findAllByProps({ testID: 'venue-event-previous' })).toHaveLength(0);
  act(() => tree.root.findAllByProps({ testID: 'venue-event-next' })[0].props.onPress());
  expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 360, animated: true });
  settle(360);
  act(() => tree.root.findAllByProps({ testID: 'venue-event-previous' })[0].props.onPress());
  expect(mockScrollTo).toHaveBeenLastCalledWith({ x: 0, animated: true });
  expect(tree.root.findAllByProps({ testID: 'venue-event-next' }).length).toBeGreaterThan(0);
  settle(720);
  expect(tree.root.findAllByProps({ testID: 'venue-event-next' })).toHaveLength(0);
  expect(tree.root.findAllByProps({ testID: 'venue-event-previous' }).length).toBeGreaterThan(0);
});
