import type { GestureResponderEvent } from 'react-native';
import { createMapTouchTrace } from '../mapTouchTrace';
import { beginMapTraceGestureSession, traceMapEvent } from '../mapTrace';

jest.mock('../mapTrace', () => ({ MAP_TRACE_ENABLED: true,
  beginMapTraceGestureSession: jest.fn(() => 'tap-1'), traceMapEvent: jest.fn() }));
const contact = (x = 100, y = 200, id = 1) => ({ identifier: String(id), pageX: x, pageY: y });
const event = (timestamp: number, touches: ReturnType<typeof contact>[], changed = [contact()]) =>
  ({ nativeEvent: { timestamp, touches, changedTouches: changed } }) as unknown as GestureResponderEvent;
let recorder: ReturnType<typeof createMapTouchTrace>;
const session = jest.fn();
beforeEach(() => { jest.clearAllMocks(); recorder = createMapTouchTrace('hybrid', session); });
const labels = () => (traceMapEvent as jest.Mock).mock.calls.map(call => call[0]);

it('records a completed stationary tap without coordinates or responder ownership', () => {
  recorder.onTouchStart(event(0, [contact()]));
  recorder.onTouchEnd(event(100, []));
  expect(labels()).toEqual(['map_touch_started', 'map_tap_released']);
  expect(session).toHaveBeenCalledWith('tap-1');
  expect(beginMapTraceGestureSession).toHaveBeenCalledWith('map_touch', { mapStyle: 'hybrid' });
  expect(traceMapEvent).toHaveBeenLastCalledWith('map_tap_released',
    { mapStyle: 'hybrid', nativeTouchDurationMs: 100 }, { gestureSessionId: 'tap-1' });
  expect(Object.keys(recorder).some(key => /Responder|Press/.test(key))).toBe(false);
});

it('excludes pan gestures even when the finger returns to its starting position', () => {
  recorder.onTouchStart(event(0, [contact()]));
  recorder.onTouchMove(event(40, [contact(125)]));
  recorder.onTouchEnd(event(100, []));
  expect(labels()).toEqual(['map_touch_started', 'map_touch_non_tap']);
});

it('excludes pinches including staggered finger releases', () => {
  recorder.onTouchStart(event(0, [contact()]));
  recorder.onTouchStart(event(10, [contact(), contact(200, 200, 2)]));
  recorder.onTouchEnd(event(80, [contact()]));
  recorder.onTouchEnd(event(100, []));
  expect(labels()).toEqual(['map_touch_started', 'map_touch_non_tap']);
});

it('excludes long presses and resets cleanly after cancellation', () => {
  recorder.onTouchStart(event(0, [contact()]));
  recorder.onTouchEnd(event(900, []));
  expect(labels()).not.toContain('map_tap_released');
  recorder.onTouchStart(event(1000, [contact()]));
  recorder.onTouchCancel();
  recorder.onTouchEnd(event(1100, []));
  recorder.onTouchStart(event(2000, [contact()]));
  recorder.onTouchEnd(event(2100, []));
  expect(labels().slice(-3)).toEqual(['map_touch_cancelled', 'map_touch_started', 'map_tap_released']);
});
