import { useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';

const TAP_SLOP = 10;

/** Observe touches without claiming the responder from either scroll direction. */
export function useTapOnlyPress() {
  const gesture = useRef<{ x: number; y: number; blocked: boolean } | null>(null);

  const trackMovement = (event: GestureResponderEvent) => {
    const current = gesture.current;
    if (!current) return;
    const { pageX, pageY, touches } = event.nativeEvent;
    if (Math.hypot(pageX - current.x, pageY - current.y) > TAP_SLOP || (touches?.length ?? 0) > 1) {
      // Keep this latched even if the finger returns to its starting point.
      current.blocked = true;
    }
  };

  return {
    touchHandlers: {
      onTouchStart: (event: GestureResponderEvent) => {
        const { pageX, pageY, touches } = event.nativeEvent;
        if (touches.length > 1 && gesture.current) gesture.current.blocked = true;
        else gesture.current = { x: pageX, y: pageY, blocked: touches.length > 1 };
      },
      onTouchMove: trackMovement,
      onTouchEnd: trackMovement,
      onTouchCancel: () => { if (gesture.current) gesture.current.blocked = true; },
    },
    isTap: (event: GestureResponderEvent) => {
      // Pressability also forwards non-touch accessibility clicks to onPress.
      // They have no finger path and must not inherit a previous cancelled swipe.
      if (!Number.isFinite(event.nativeEvent.pageX) || !Number.isFinite(event.nativeEvent.pageY)) return true;
      // Also check release coordinates in case a fast swipe coalesced its move events.
      trackMovement(event);
      return !gesture.current?.blocked;
    },
  };
}
