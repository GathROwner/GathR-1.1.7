import type { GestureResponderEvent } from 'react-native';
import { MAP_TRACE_ENABLED, beginMapTraceGestureSession, traceMapEvent } from './mapTrace';

/** Passive observers only: never claim a responder or recognize/dispatch a cluster tap. */
export function createMapTouchTrace(mapStyle: string, onSession: (id: string | null) => void) {
  let touch: { id: string; x: number; y: number; timestamp: number; session: string | null; valid: boolean } | null = null;
  const move = (event: GestureResponderEvent) => {
    if (!touch) return;
    const contacts = event.nativeEvent.touches;
    const first = contacts[0] ?? event.nativeEvent.changedTouches[0];
    if (contacts.length > 1 || !first || first.identifier !== touch.id ||
      Math.hypot(first.pageX - touch.x, first.pageY - touch.y) > 10) touch.valid = false;
  };
  return {
    onTouchStart(event: GestureResponderEvent) {
      if (!MAP_TRACE_ENABLED) return;
      if (touch) { touch.valid = false; return; }
      const contacts = event.nativeEvent.touches;
      const first = contacts[0];
      if (!first) return;
      const session = beginMapTraceGestureSession('map_touch', { mapStyle });
      onSession(session);
      touch = { id: first.identifier, x: first.pageX, y: first.pageY,
        timestamp: event.nativeEvent.timestamp, session, valid: contacts.length === 1 };
      traceMapEvent('map_touch_started', { mapStyle }, { gestureSessionId: session });
    },
    onTouchMove(event: GestureResponderEvent) { if (MAP_TRACE_ENABLED) move(event); },
    onTouchEnd(event: GestureResponderEvent) {
      if (!MAP_TRACE_ENABLED || !touch) return;
      move(event);
      if (event.nativeEvent.touches.length !== 0) { touch.valid = false; return; }
      const duration = event.nativeEvent.timestamp - touch.timestamp;
      traceMapEvent(touch.valid && duration >= 0 && duration <= 700 ? 'map_tap_released' : 'map_touch_non_tap',
        { mapStyle, nativeTouchDurationMs: duration }, { gestureSessionId: touch.session });
      touch = null;
    },
    onTouchCancel() {
      if (!MAP_TRACE_ENABLED || !touch) return;
      traceMapEvent('map_touch_cancelled', { mapStyle }, { gestureSessionId: touch.session });
      touch = null;
    },
  };
}
