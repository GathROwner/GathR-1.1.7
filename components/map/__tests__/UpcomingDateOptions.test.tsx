import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import UpcomingDateOptions from '../UpcomingDateOptions';
import { DEFAULT_FILTER_CRITERIA, TimeFilterType } from '../../../types/filter';
import type { Event } from '../../../types/events';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));

describe.each(['event', 'special'] as const)('Upcoming %s date controls', type => {
  let tree: renderer.ReactTestRenderer;
  const onSelect = jest.fn();
  const button = (label: string) => tree.root.findAll(node => node.props.accessibilityRole === 'button' && (
    node.props.accessibilityLabel?.startsWith(label) ||
    node.findAllByType(Text).some(text => text.props.children === label)))[0];
  const dayLabel = (day: number) => new Date(2026, 9, day, 12).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 13, 12));
    onSelect.mockClear();
    const events = [16, 17, 18, 25].flatMap(day => ['event', 'special'].map(contentType => ({
      id: `${contentType}-${day}`, type: contentType, title: 'Concert', description: '', venue: 'Venue',
      category: 'Live Music', startDate: `2026-10-${day}`, endDate: `2026-10-${day}`,
      startTime: '19:00', endTime: '23:00',
    } as Event)));
    const criteria = { ...DEFAULT_FILTER_CRITERIA,
      eventFilters: { timeFilter: TimeFilterType.UPCOMING },
      specialFilters: { timeFilter: TimeFilterType.UPCOMING },
    };
    act(() => { tree = renderer.create(<UpcomingDateOptions type={type} appearance="dark"
      events={events} criteria={criteria} onSelect={onSelect} />); });
  });
  afterEach(() => { act(() => tree.unmount()); jest.useRealTimers(); });

  it('selects a preset immediately and cancels a calendar draft without applying it', () => {
    expect(button('Next 7 days').props.accessibilityLabel).toContain(`3 ${type === 'event' ? 'events' : 'specials'}`);
    act(() => button('Next 7 days').props.onPress());
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'next7' });
    act(() => button('Choose date').props.onPress());
    act(() => button(dayLabel(16)).props.onPress());
    expect(onSelect).toHaveBeenCalledTimes(1);
    act(() => button('Close date picker').props.onPress());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(button('Close date picker')).toBeUndefined();
  });

  it('applies an inclusive range only after confirmation, with the matching content count', () => {
    act(() => button('Choose date').props.onPress());
    expect(button(dayLabel(13)).props.disabled).toBe(true);
    act(() => button('Date range').props.onPress());
    expect(button('Choose an end date').props.disabled).toBe(true);
    act(() => button(dayLabel(18)).props.onPress());
    const apply = button(`Show 3 ${type === 'event' ? 'events' : 'specials'}`);
    expect(apply.props.disabled).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
    act(() => apply.props.onPress());
    expect(onSelect).toHaveBeenCalledWith({ kind: 'custom', startDate: '2026-10-14', endDate: '2026-10-18' });
    expect(button('Close date picker')).toBeUndefined();
  });
});
