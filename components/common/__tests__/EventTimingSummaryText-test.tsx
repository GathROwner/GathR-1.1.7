import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { createLegacyTimingContract } from '../../../utils/eventTiming';
import { EventTimingSummaryText } from '../EventTimingSummaryText';

const estimatedEndEvent = () => {
  const timing = createLegacyTimingContract(
    { startDate: '2099-09-05', startTime: '7:00 PM', endDate: '2099-09-05', endTime: '' },
    { endStatus: 'unknown' }
  );
  timing.estimate = {
    confidence: 'high',
    displayEndDate: '2099-09-05',
    displayEndTime: '9:00 PM',
    discoveryCutoffDate: '2099-09-05',
    discoveryCutoffTime: '9:15 PM',
    method: 'official_runtime',
  };
  return {
    startDate: '2099-09-05',
    startTime: '7:00 PM',
    endDate: '2099-09-05',
    endTime: '',
    timing,
  };
};

describe('EventTimingSummaryText', () => {
  it('puts the info control after the estimated end and expands its explanation', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<EventTimingSummaryText event={estimatedEndEvent()} />);
    });

    expect(component!.root.findAllByProps({ testID: 'estimated-start-info' })).toHaveLength(0);
    const endInfo = component!.root.findByProps({ testID: 'estimated-end-info' });
    expect(endInfo.props.accessibilityLabel).toBe('Explain estimated end time');

    const stopPropagation = jest.fn();
    act(() => endInfo.props.onPress({ stopPropagation }));
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(component!.root.findByProps({ testID: 'estimated-time-disclosure' })).toBeTruthy();

    act(() => component!.unmount());
  });

  it('marks both endpoints when the start and end are estimated', () => {
    const event = estimatedEndEvent();
    event.timing.schedule.start = {
      ...event.timing.schedule.start,
      status: 'estimated',
      confidence: 'medium',
      method: 'official_schedule_context',
    };
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<EventTimingSummaryText event={event} />);
    });

    expect(component!.root.findByProps({ testID: 'estimated-start-info' })).toBeTruthy();
    expect(component!.root.findByProps({ testID: 'estimated-end-info' })).toBeTruthy();

    act(() => component!.unmount());
  });
});
