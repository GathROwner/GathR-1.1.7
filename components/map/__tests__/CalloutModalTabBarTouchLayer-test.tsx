import React from 'react';
import renderer, { act } from 'react-test-renderer';

import CalloutModalTabBarTouchLayer from '../CalloutModalTabBarTouchLayer';

describe('CalloutModalTabBarTouchLayer', () => {
  it('forwards all three visible tab targets while a native callout modal is open', () => {
    const onSelect = jest.fn();
    let component: renderer.ReactTestRenderer;

    act(() => {
      component = renderer.create(
        <CalloutModalTabBarTouchLayer height={82} onSelect={onSelect} />
      );
    });

    act(() => component!.root.findByProps({ testID: 'callout-modal-tab-events' }).props.onPress());
    act(() => component!.root.findByProps({ testID: 'callout-modal-tab-map' }).props.onPress());
    act(() => component!.root.findByProps({ testID: 'callout-modal-tab-specials' }).props.onPress());

    expect(onSelect.mock.calls).toEqual([['events'], ['map'], ['specials']]);
    expect(component!.root.findByProps({ testID: 'callout-modal-tab-touch-layer' }).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 82 })])
    );
    expect(component!.root.findByProps({ testID: 'callout-modal-tab-touch-layer' }).props.pointerEvents)
      .toBe('auto');
  });
});
