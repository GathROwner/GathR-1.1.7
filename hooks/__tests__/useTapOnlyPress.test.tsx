import React from 'react';
import { TouchableOpacity, View, type GestureResponderEvent } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { useTapOnlyPress } from '../useTapOnlyPress';

const openCard = jest.fn();
const openImage = jest.fn();
function Harness() {
  const tap = useTapOnlyPress();
  return <View testID="touch-observer" {...tap.touchHandlers}>
    <TouchableOpacity testID="card" onPress={event => { if (tap.isTap(event)) openCard(); }} onAccessibilityTap={openCard}>
      <TouchableOpacity testID="image" onPress={event => { if (tap.isTap(event)) openImage(); }} onAccessibilityTap={openImage} />
    </TouchableOpacity>
  </View>;
}

const touch = (x: number, y: number, fingers = 1) => ({
  nativeEvent: { pageX: x, pageY: y, touches: Array.from({ length: fingers }, () => ({})) },
} as GestureResponderEvent);
let tree: renderer.ReactTestRenderer;
const observer = () => tree.root.findAllByProps({ testID: 'touch-observer' })[0];
function press(target: 'card' | 'image', event = touch(100, 100, 0)) {
  act(() => tree.root.findAllByProps({ testID: target })[0].props.onPress(event));
}
beforeEach(() => {
  openCard.mockClear(); openImage.mockClear();
  act(() => { tree = renderer.create(<Harness />); });
});
afterEach(() => act(() => tree.unmount()));

it('allows deliberate taps with small natural finger jitter', () => {
  act(() => observer().props.onTouchStart(touch(100, 100)));
  act(() => observer().props.onTouchMove(touch(103, 104)));
  press('image', touch(103, 104, 0));
  expect(openImage).toHaveBeenCalledTimes(1);
});

it.each([[80, 100], [120, 100], [100, 80], [100, 120]])(
  'blocks both lightbox entry points after movement to %s,%s even when no page can scroll', (x, y) => {
    act(() => observer().props.onTouchStart(touch(100, 100)));
    act(() => observer().props.onTouchMove(touch(x, y)));
    // A native edge pager may still deliver onPress. Neither path may open.
    press('image', touch(x, y, 0)); press('card', touch(x, y, 0));
    expect(openImage).not.toHaveBeenCalled(); expect(openCard).not.toHaveBeenCalled();
  },
);

it('remembers a swipe that returns to its origin, but allows the very next fresh tap', () => {
  act(() => observer().props.onTouchStart(touch(100, 100)));
  act(() => observer().props.onTouchMove(touch(180, 100)));
  act(() => observer().props.onTouchEnd(touch(100, 100, 0)));
  press('image'); expect(openImage).not.toHaveBeenCalled();
  act(() => observer().props.onTouchStart(touch(100, 100)));
  press('image'); expect(openImage).toHaveBeenCalledTimes(1);
});

it('checks release coordinates when a fast swipe has no delivered move event', () => {
  act(() => observer().props.onTouchStart(touch(100, 100)));
  press('image', touch(180, 100, 0));
  expect(openImage).not.toHaveBeenCalled();
});

it('rejects cancelled and multi-touch gestures', () => {
  act(() => observer().props.onTouchStart(touch(100, 100)));
  act(() => observer().props.onTouchCancel());
  press('card'); expect(openCard).not.toHaveBeenCalled();
  act(() => observer().props.onTouchStart(touch(100, 100)));
  act(() => observer().props.onTouchStart(touch(110, 100, 2)));
  press('image'); expect(openImage).not.toHaveBeenCalled();
});

it('keeps explicit accessibility activation available after a cancelled gesture', () => {
  act(() => observer().props.onTouchStart(touch(100, 100)));
  act(() => observer().props.onTouchCancel());
  act(() => tree.root.findAllByProps({ testID: 'image' })[0].props.onAccessibilityTap());
  expect(openImage).toHaveBeenCalledTimes(1);
});

it('allows a native accessibility click without touch coordinates after a swipe', () => {
  act(() => observer().props.onTouchStart(touch(100, 100)));
  act(() => observer().props.onTouchMove(touch(180, 100)));
  press('image', { nativeEvent: { target: 1 } } as GestureResponderEvent);
  expect(openImage).toHaveBeenCalledTimes(1);
});
