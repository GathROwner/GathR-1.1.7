import { summarizeCalloutOpenings } from '../mapCalloutTiming';
import type { MapTraceEntry } from '../mapTrace';

const entry = (id: number, label: string, monotonicMs: number, details = {}, session: string | null = 'tap-1'): MapTraceEntry =>
  ({ id, label, monotonicMs, details, gestureSessionId: session, timestamp: 0 });

it('separates delayed input delivery from preparation and first-frame scheduling', () => {
  expect(summarizeCalloutOpenings([
    entry(1, 'map_tap_released', 100, { mapStyle: 'hybrid' }),
    entry(2, 'hybrid_native_selection_received', 600),
    entry(3, 'marker_press_started', 605, { clusterId: 'a', venueCount: 19, mapStyle: 'hybrid' }),
    entry(4, 'marker_press_selected', 617, { clusterId: 'a' }),
    entry(5, 'event_callout_first_visible_frame', 817, { clusterId: 'none' }),
  ])).toEqual([{ style: 'hybrid', clusterId: 'a', venueCount: 19, releaseToHandlerMs: 505,
    handlerToSelectionMs: 12, selectionToFrameMs: 200, releaseToFrameMs: 717 }]);
});

it('does not invent release timestamps for touches that never reach the map observer', () => {
  const result = summarizeCalloutOpenings([
    entry(1, 'marker_press_started', 100, { clusterId: 'a', mapStyle: 'current' }),
    entry(2, 'marker_press_selected', 110, { clusterId: 'a' }),
  ])[0];
  expect(result.releaseToHandlerMs).toBeNull();
  expect(result.releaseToFrameMs).toBeNull();
  expect(result.handlerToSelectionMs).toBe(10);
  expect(result.selectionToFrameMs).toBeNull();
});

it('does not pair a rejected/repeated tap with a later opening or a different gesture', () => {
  const result = summarizeCalloutOpenings([
    entry(1, 'map_tap_released', 10),
    entry(2, 'marker_press_started', 20, { clusterId: 'a' }),
    entry(3, 'marker_press_started', 30, { clusterId: 'a' }),
    entry(4, 'marker_press_selected', 40, { clusterId: 'a' }),
    entry(5, 'event_callout_first_visible_frame', 50, {}, 'tap-2'),
  ]);
  expect(result[0].handlerToSelectionMs).toBeNull();
  expect(result[1].handlerToSelectionMs).toBe(10);
  expect(result[1].selectionToFrameMs).toBeNull();
});

it('does not combine unassociated native events or return unbounded opening histories', () => {
  expect(summarizeCalloutOpenings([
    entry(1, 'map_tap_released', 10, {}, null),
    entry(2, 'marker_press_started', 20, { clusterId: 'a' }, null),
    entry(3, 'marker_press_selected', 30, { clusterId: 'a' }, null),
  ])[0].releaseToHandlerMs).toBeNull();
  expect(summarizeCalloutOpenings(Array.from({ length: 10 }, (_, i) =>
    entry(i, 'marker_press_started', i, { clusterId: String(i) }, String(i))))).toHaveLength(6);
});
