import React from 'react';
import { Alert } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { createLegacyTimingContract } from '../../../utils/eventTiming';
import { EventTimingBadge } from '../EventTimingBadge';

const unknownEndEvent = () => ({
  startDate: '2099-09-06',
  startTime: '7:00 PM',
  endDate: '2099-09-06',
  endTime: '',
  timing: createLegacyTimingContract(
    { startDate: '2099-09-06', startTime: '7:00 PM', endDate: '2099-09-06', endTime: '' },
    { endStatus: 'unknown' }
  ),
});

describe('EventTimingBadge', () => {
  it('makes an unknown ending visibly informational and explains it without opening the card', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<EventTimingBadge event={unknownEndEvent()} compact />);
    });

    const badge = component!.root.findByProps({ testID: 'event-timing-badge' });
    expect(badge.props.accessibilityRole).toBe('button');
    expect(component!.root.findByProps({ testID: 'event-timing-badge-info' })).toBeTruthy();

    const stopPropagation = jest.fn();
    act(() => badge.props.onPress({ stopPropagation }));
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      'End time not provided',
      'The organizer provided a start time but no end time. GathR will not guess an ending.'
    );

    alert.mockRestore();
    act(() => component!.unmount());
  });

  it('uses a supplied disclosure handler when the surface owns expanded details', () => {
    const onInfoPress = jest.fn();
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <EventTimingBadge event={unknownEndEvent()} compact onInfoPress={onInfoPress} />
      );
    });

    const badge = component!.root.findByProps({ testID: 'event-timing-badge' });
    act(() => badge.props.onPress({ stopPropagation: jest.fn() }));
    expect(onInfoPress).toHaveBeenCalledTimes(1);

    act(() => component!.unmount());
  });
});
