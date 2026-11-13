import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, View, type GestureResponderEvent } from 'react-native';
import HybridMarkerTouchTarget from '../HybridMarkerTouchTarget';

const touch = (x = 20, y = 20, identifier = '1') => ({ pageX: x, pageY: y, identifier });
const event = (timestamp: number, touches = [touch()], changedTouches = touches) => ({ nativeEvent: { timestamp, touches, changedTouches } } as GestureResponderEvent);
let tree: renderer.ReactTestRenderer;
let press: jest.Mock, pressIn: jest.Mock;
const target = () => tree.root.findByType(View);
const send = (name: string, e?: GestureResponderEvent) => act(() => target().props[name](e));
beforeEach(() => {
  press = jest.fn(); pressIn = jest.fn();
  act(() => { tree = renderer.create(<HybridMarkerTouchTarget onPress={press} onPressIn={pressIn} accessibilityRole="button" hitSlop={10}><Text>Marker</Text></HybridMarkerTouchTarget>); });
});
afterEach(() => act(() => tree.unmount()));

it('does not acquire the JS responder or expand its invisible touch area', () => {
  for (const name of ['onStartShouldSetResponder', 'onMoveShouldSetResponder', 'onStartShouldSetResponderCapture', 'onMoveShouldSetResponderCapture', 'onResponderGrant', 'onShouldBlockNativeResponder']) {
    expect(target().props[name]).toBeUndefined();
  }
  expect(target().props.hitSlop).toBeUndefined();
});

it('opens the existing cluster action once for a short stationary tap', () => {
  send('onTouchStart', event(100));
  send('onTouchEnd', event(200, [], [touch(22, 21)]));
  expect(pressIn).toHaveBeenCalledTimes(1); expect(press).toHaveBeenCalledTimes(1);
});

it('cancels a drag even if the finger returns to its starting position', () => {
  send('onTouchStart', event(100));
  send('onTouchMove', event(120, [touch(35)]));
  send('onTouchEnd', event(200, [], [touch()]));
  expect(press).not.toHaveBeenCalled();
});

it('cancels a pinch when the second touch arrives, without reactivating on finger release', () => {
  send('onTouchStart', event(100));
  send('onTouchStart', event(110, [touch(), touch(80, 20, '2')]));
  send('onTouchEnd', event(130, [touch()], [touch(80, 20, '2')]));
  send('onTouchEnd', event(150, [], [touch()]));
  expect(press).not.toHaveBeenCalled();
  send('onTouchStart', event(300)); send('onTouchEnd', event(400, [], [touch()]));
  expect(press).toHaveBeenCalledTimes(1);
});

it('cancels when a second finger starts outside the marker and joins the move', () => {
  send('onTouchStart', event(100));
  send('onTouchMove', event(120, [touch(), touch(80, 20, '2')]));
  send('onTouchEnd', event(200, [], [touch()]));
  expect(press).not.toHaveBeenCalled();
});

it('does not open during a remaining touch, a native cancellation, or a long hold', () => {
  send('onTouchStart', event(100)); send('onTouchEnd', event(200, [touch(80, 20, '2')], [touch()]));
  send('onTouchStart', event(300)); send('onTouchCancel'); send('onTouchEnd', event(400, [], [touch()]));
  send('onTouchStart', event(500)); send('onTouchEnd', event(1500, [], [touch()]));
  expect(press).not.toHaveBeenCalled();
});

it('preserves accessibility activation and readiness/processing gates', () => {
  send('onAccessibilityTap'); expect(press).toHaveBeenCalledTimes(1);
  send('onTouchStart', event(100));
  act(() => tree.update(<HybridMarkerTouchTarget disabled onPress={press}><Text>Marker</Text></HybridMarkerTouchTarget>));
  send('onTouchEnd', event(200, [], [touch()]));
  expect(press).toHaveBeenCalledTimes(1);
  expect(target().props.onAccessibilityTap).toBeUndefined();
});
