import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { createLegacyTimingContract } from '../../../utils/eventTiming';
import { EventTimingBadge } from '../EventTimingBadge';
import { dateOnlyActivity } from '../../../utils/__tests__/fixtures/dateOnlyActivity';
import { continuousDonationCampaign } from '../../../utils/__tests__/fixtures/continuousDonationCampaign';

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
  it('uses the existing amber END UNKNOWN on carousel after cutoff while default surfaces keep STATUS UNKNOWN', () => {
    jest.useFakeTimers({ now: new Date('2099-09-07T01:30:00Z') });
    let component: renderer.ReactTestRenderer;
    act(() => { component = renderer.create(<EventTimingBadge event={unknownEndEvent()} carousel />); });
    expect(JSON.stringify(component!.toJSON())).toContain('END\\nUNKNOWN');
    const badge = component!.root.findByProps({ testID: 'event-timing-badge' });
    expect(StyleSheet.flatten(badge.props.style({ pressed: false })).backgroundColor).toBe('#B87800');
    act(() => component!.update(<EventTimingBadge event={unknownEndEvent()} />));
    expect(JSON.stringify(component!.toJSON())).toContain('STATUS\\nUNKNOWN');
    expect(component!.root.findAllByProps({ testID: 'carousel-end-unknown-separator' })).toHaveLength(0);
    act(() => component!.unmount());
    jest.useRealTimers();
  });
  it('keeps ordinary unknown finishes and suppresses finite campaign uncertainty only on date-range surfaces', () => {
    let component: renderer.ReactTestRenderer;
    act(() => { component = renderer.create(<EventTimingBadge event={unknownEndEvent()} carousel showInfoIndicator={false} />); });
    expect(JSON.stringify(component!.toJSON())).toContain('END\\nUNKNOWN');
    expect(component!.root.findByProps({ testID: 'event-timing-badge' }).props.accessibilityRole).toBe('text');
    act(() => component!.update(<EventTimingBadge event={dateOnlyActivity()} carousel />));
    expect(JSON.stringify(component!.toJSON())).toContain('TIMES\\nUNKNOWN');
    expect(component!.root.findAllByProps({ testID: 'carousel-end-unknown-separator' })).toHaveLength(0);
    act(() => component!.update(<EventTimingBadge event={continuousDonationCampaign()} carousel />));
    expect(component!.toJSON()).toBeNull();
    act(() => component!.update(<EventTimingBadge event={continuousDonationCampaign()} compact remainingCampaignDates />));
    expect(component!.toJSON()).toBeNull();
    act(() => component!.update(<EventTimingBadge event={continuousDonationCampaign()} compact />));
    expect(component!.root.findAllByProps({ testID: 'event-timing-badge' }).length).toBeGreaterThan(0);
    act(() => component!.update(<EventTimingBadge event={unknownEndEvent()} compact remainingCampaignDates />));
    expect(component!.root.findAllByProps({ testID: 'event-timing-badge' }).length).toBeGreaterThan(0);
    expect(component!.root.findAllByProps({ testID: 'event-timing-badge-info' }).length).toBeGreaterThan(0);
    expect(component!.root.findAllByProps({ testID: 'carousel-end-unknown-separator' })).toHaveLength(0);
    act(() => component!.unmount());
  });
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

  it('claims the touch before a containing event card can open', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<EventTimingBadge event={unknownEndEvent()} compact />);
    });

    const badge = component!.root.findByProps({ testID: 'event-timing-badge' });
    const stopPropagation = jest.fn();
    act(() => badge.props.onPressIn({ stopPropagation }));

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    act(() => component!.unmount());
  });

  it('renders as status text when another control owns the timing explanation', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <EventTimingBadge event={unknownEndEvent()} compact showInfoIndicator={false} />
      );
    });

    const badge = component!.root.findByProps({ testID: 'event-timing-badge' });
    expect(badge.props.accessibilityRole).toBe('text');
    expect(component!.root.findAllByProps({ testID: 'event-timing-badge-info' })).toHaveLength(0);

    act(() => component!.unmount());
  });
});
