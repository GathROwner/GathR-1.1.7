import React from 'react';
import renderer, { act } from 'react-test-renderer';

import CalloutModalTabBarTouchLayer from '../CalloutModalTabBarTouchLayer';

jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');

describe('CalloutModalTabBarTouchLayer', () => {
  it('forwards all three visible tab targets while a native callout modal is open', () => {
    const onSelect = jest.fn();
    let component: renderer.ReactTestRenderer;

    act(() => {
      component = renderer.create(
        <CalloutModalTabBarTouchLayer height={52} bottomOffset={28} edgeInset="7%" onSelect={onSelect} />
      );
    });

    act(() => component!.root.findByProps({ testID: 'callout-modal-tab-events' }).props.onPress());
    act(() => component!.root.findByProps({ testID: 'callout-modal-tab-map' }).props.onPress());
    act(() => component!.root.findByProps({ testID: 'callout-modal-tab-specials' }).props.onPress());

    expect(onSelect.mock.calls).toEqual([['events'], ['map'], ['specials']]);
    expect(component!.root.findByProps({ testID: 'callout-modal-tab-touch-layer' }).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 52, bottom: 28, left: '7%', right: '7%' })])
    );
    expect(component!.root.findByProps({ testID: 'callout-modal-tab-touch-layer' }).props.pointerEvents)
      .toBe('auto');
    expect(component!.root.findByProps({ testID: 'callout-modal-tab-map' }).props.accessibilityState)
      .toEqual({ selected: true });
    expect(component!.root.findAllByType('Ionicons' as any)).toHaveLength(3);
  });
});
