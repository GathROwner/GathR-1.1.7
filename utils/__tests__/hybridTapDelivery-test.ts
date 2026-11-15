import type { GestureResponderEvent } from 'react-native';
import { createHybridTapDelivery, type HybridTapOptions, type HybridTapSurface } from '../hybridTapDelivery';

const contact = (x = 120, y = 260, id = '1') => ({ identifier: id, pageX: x, pageY: y });
const coordinate: [number, number] = [-63.1, 46.2];
const feature = (coords: [number, number] = coordinate) => ({ id: 'native-sdk-uuid', geometry: { type: 'Point', coordinates: coords } });
const event = (timestamp: number, touches = [contact()], changedTouches = [contact()]) =>
  ({ nativeEvent: { timestamp, touches, changedTouches } }) as unknown as GestureResponderEvent;
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let delivery: ReturnType<typeof createHybridTapDelivery<string>>;
let context: HybridTapOptions<string>, surface: HybridTapSurface, press: jest.Mock, query: jest.Mock, canOpen: boolean;
beforeEach(() => {
  press = jest.fn(); query = jest.fn().mockResolvedValue({ features: [feature()] }); canOpen = true;
  surface = { identity: {}, layout: { x: 20, y: 60, width: 402, height: 812 }, zoom: 12, query };
  context = { active: true, canOpen: () => canOpen, surface: () => surface, onPress: press };
  delivery = createHybridTapDelivery(() => context);
  delivery.register('marker-1', 'venue-1', coordinate);
});
const tap = () => { delivery.onTouchStart(event(0)); delivery.onTouchEnd(event(80, [])); };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

it('delivers a rendered annotation after release without waiting for the delayed native callback', async () => {
  tap(); await flush();
  expect(query).toHaveBeenCalledTimes(1);
  expect(query).toHaveBeenCalledWith([100, 200]);
  expect(press).toHaveBeenCalledWith('venue-1', 'release');
  delivery.onNativePress('marker-1', 'venue-1');
  delivery.onNativePress('marker-1', 'venue-1');
  expect(press).toHaveBeenCalledTimes(1);
  expect(Object.keys(delivery).some(key => /Responder|Capture/.test(key))).toBe(false);
});

it('lets native selection win when the query has not finished, then discards its result', async () => {
  const pending = deferred<{ features: ReturnType<typeof feature>[] }>(); query.mockReturnValue(pending.promise);
  tap(); delivery.onNativePress('marker-1', 'venue-1');
  pending.resolve({ features: [feature()] }); await flush();
  expect(press.mock.calls).toEqual([['venue-1', 'native']]);
});

it('retains native fallback on query failure and a fresh native action after reset', async () => {
  query.mockRejectedValue(new Error('native query failed'));
  tap(); await flush(); expect(press).not.toHaveBeenCalled();
  delivery.onNativePress('marker-1', 'venue-1'); expect(press).toHaveBeenCalledTimes(1);
  delivery.reset(); delivery.onNativePress('marker-1', 'venue-1'); expect(press).toHaveBeenCalledTimes(2);
});

it('does not query or dispatch for a pinch with staggered finger release', async () => {
  delivery.onTouchStart(event(0));
  delivery.onTouchStart(event(20, [contact(), contact(220, 260, '2')]));
  delivery.onTouchEnd(event(60, [contact()]));
  delivery.onTouchEnd(event(80, [])); await flush();
  expect(query).not.toHaveBeenCalled(); expect(press).not.toHaveBeenCalled();
});

it.each(['pan', 'cancel', 'long press'] as const)('does not query for %s', async kind => {
  delivery.onTouchStart(event(0));
  if (kind === 'pan') delivery.onTouchMove(event(30, [contact(150)]));
  if (kind === 'cancel') delivery.onTouchCancel();
  delivery.onTouchEnd(event(kind === 'long press' ? 800 : 80, [])); await flush();
  expect(query).not.toHaveBeenCalled(); expect(press).not.toHaveBeenCalled();
});

it('leaves unmatched native geometry and empty-map taps alone', async () => {
  query.mockResolvedValue({ features: [feature([-64, 47])] });
  tap(); await flush(); expect(press).not.toHaveBeenCalled();
});

it('resolves independent SDK UUIDs and small tile quantization without enlarging hit bounds', async () => {
  query.mockResolvedValue({ features: [feature([-63.0999, 46.2])] });
  tap(); await flush(); expect(press).toHaveBeenCalledWith('venue-1', 'release');
  press.mockClear(); query.mockResolvedValue({ features: [feature([-63.09, 46.2])] });
  tap(); await flush(); expect(press).not.toHaveBeenCalled();
});

it('retains native selection for ambiguous or multiple painted annotations', async () => {
  const cleanup = delivery.register('overlap', 'other-venue', [-63.10001, 46.2]);
  tap(); await flush(); expect(press).not.toHaveBeenCalled(); cleanup();
  delivery.register('second', 'second-venue', [-63.11, 46.2]);
  query.mockResolvedValue({ features: [feature(), feature([-63.11, 46.2])] });
  tap(); await flush(); expect(press).not.toHaveBeenCalled();
});

it('keeps compact annotations registered for identity resolution while retaining their native hit path', async () => {
  delivery.register('marker-1', 'compact', coordinate, false);
  tap(); await flush(); expect(press).not.toHaveBeenCalled();
  delivery.onNativePress('marker-1', 'compact'); expect(press).toHaveBeenCalledWith('compact', 'native');
});

it('bounds native duplicate suppression without latching future accessibility/native activations', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    tap(); await flush(); delivery.onNativePress('marker-1', 'venue-1');
    expect(press).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(2300); delivery.onNativePress('marker-1', 'venue-1');
    expect(press).toHaveBeenCalledTimes(2);
  } finally { clock.mockRestore(); }
});

it('requires a measured valid absolute layout and a point inside the map', async () => {
  surface.layout.x = NaN; tap(); await flush(); expect(query).not.toHaveBeenCalled();
  surface.layout.x = 150; tap(); await flush(); expect(query).not.toHaveBeenCalled();
  context.surface = () => null; tap(); await flush(); expect(query).not.toHaveBeenCalled();
  delivery.onNativePress('marker-1', 'venue-1'); expect(press).toHaveBeenCalledWith('venue-1', 'native');
});

it.each(['camera', 'map', 'layout', 'mutated layout', 'gating', 'mode'] as const)('rejects a pending hit after %s changes', async kind => {
  const pending = deferred<{ features: ReturnType<typeof feature>[] }>(); query.mockReturnValue(pending.promise);
  tap();
  if (kind === 'camera') delivery.invalidate();
  if (kind === 'map') surface = { ...surface, identity: {} };
  if (kind === 'layout') surface = { ...surface, layout: { ...surface.layout, y: 80 } };
  if (kind === 'mutated layout') surface.layout.y = 80;
  if (kind === 'gating') canOpen = false;
  if (kind === 'mode') context.active = false;
  pending.resolve({ features: [feature()] }); await flush();
  expect(press).not.toHaveBeenCalled();
});

it('rejects stale responses from the previous touch and permits a new deliberate tap', async () => {
  const first = deferred<{ features: ReturnType<typeof feature>[] }>(), second = deferred<{ features: ReturnType<typeof feature>[] }>();
  query.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  tap(); tap(); first.resolve({ features: [feature()] }); await flush(); expect(press).not.toHaveBeenCalled();
  second.resolve({ features: [feature()] }); await flush(); expect(press).toHaveBeenCalledTimes(1);
});

it('drops unmounted markers but keeps a replacement target when an old registration cleans up', async () => {
  const cleanup = delivery.register('marker-1', 'old-venue', coordinate);
  const latestCleanup = delivery.register('marker-1', 'current-venue', coordinate); cleanup();
  tap(); await flush(); expect(press).toHaveBeenCalledWith('current-venue', 'release');
  press.mockClear(); query.mockClear(); latestCleanup(); tap(); await flush();
  expect(query).not.toHaveBeenCalled(); expect(press).not.toHaveBeenCalled();
});

it('keeps non-Hybrid styles inactive and skips queries while the shared gates block opening', async () => {
  context.active = false; tap(); await flush(); expect(query).not.toHaveBeenCalled();
  context.active = true; canOpen = false; tap(); await flush(); expect(query).not.toHaveBeenCalled();
});
