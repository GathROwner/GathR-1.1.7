import type { MapTraceEntry } from './mapTrace';

export interface CalloutOpeningTiming {
  style: string;
  clusterId: string;
  venueCount: number;
  releaseToHandlerMs: number | null;
  handlerToSelectionMs: number | null;
  selectionToFrameMs: number | null;
  releaseToFrameMs: number | null;
}

/** Keep incomplete measurements explicit; a JS frame is not native screen-display proof. */
export function summarizeCalloutOpenings(entries: readonly MapTraceEntry[]): CalloutOpeningTiming[] {
  return entries.filter(entry => entry.label === 'marker_press_started').slice(-6).map(start => {
    const clusterId = String(start.details?.clusterId ?? 'unknown');
    const nextStart = entries.find(entry => entry.label === 'marker_press_started' && entry.id > start.id);
    const session = start.gestureSessionId === null ? [] : entries.filter(entry =>
      entry.gestureSessionId === start.gestureSessionId && (!nextStart || entry.id < nextStart.id));
    const release = session.find(entry => entry.label === 'map_tap_released');
    const selection = session.find(entry => entry.label === 'marker_press_selected' &&
      entry.details?.clusterId === clusterId && entry.monotonicMs >= start.monotonicMs);
    // Single-venue callouts have no selectedCluster, so match this opening's session
    // and require the frame to follow selection rather than comparing cluster IDs.
    const frame = selection && session.find(entry => entry.label === 'event_callout_first_visible_frame' &&
      entry.monotonicMs >= selection.monotonicMs);
    const elapsed = (from?: MapTraceEntry, to?: MapTraceEntry) =>
      from && to && to.monotonicMs >= from.monotonicMs ? Math.round(to.monotonicMs - from.monotonicMs) : null;
    return {
      style: String(start.details?.mapStyle ?? release?.details?.mapStyle ?? 'unknown'),
      clusterId,
      venueCount: Number(start.details?.venueCount ?? 0),
      releaseToHandlerMs: elapsed(release, start),
      handlerToSelectionMs: elapsed(start, selection),
      selectionToFrameMs: elapsed(selection, frame),
      releaseToFrameMs: elapsed(release, frame),
    };
  });
}
