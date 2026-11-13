import React, { useRef, useState } from 'react';
import { View, type GestureResponderEvent, type ViewProps } from 'react-native';

type Props = Pick<ViewProps, 'children' | 'style' | 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityHint' | 'testID'> & {
  onPress?: () => void;
  onPressIn?: () => void;
  disabled?: boolean;
  activeOpacity?: number;
  hitSlop?: ViewProps['hitSlop'];
};

/** Observe a short tap without acquiring the JS responder from native map pan/pinch gestures. */
export default function HybridMarkerTouchTarget({ children, style, onPress, onPressIn, disabled, activeOpacity = .7,
  accessibilityRole, accessibilityLabel, accessibilityHint, testID }: Props) {
  const start = useRef<{ x: number; y: number; time: number; id: string } | null>(null);
  const [pressed, setPressed] = useState(false);
  const cancel = () => { start.current = null; setPressed(false); };
  const moved = (e: GestureResponderEvent) => {
    const first = start.current;
    const touch = e.nativeEvent.touches.find(t => t.identifier === first?.id);
    return !first || e.nativeEvent.touches.length !== 1 || !touch || Math.hypot(touch.pageX - first.x, touch.pageY - first.y) > 6;
  };
  return <View collapsable={false} accessible accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint} accessibilityState={{ disabled: !!disabled }} testID={testID}
    style={[style, pressed && { opacity: activeOpacity }]} onAccessibilityTap={disabled ? undefined : onPress}
    onTouchStart={e => {
      if (disabled || e.nativeEvent.touches.length !== 1) { cancel(); return; }
      const touch = e.nativeEvent.touches[0];
      start.current = { x: touch.pageX, y: touch.pageY, time: e.nativeEvent.timestamp, id: touch.identifier };
      setPressed(true); onPressIn?.();
    }}
    onTouchMove={e => { if (moved(e)) cancel(); }}
    onTouchCancel={cancel}
    onTouchEnd={e => {
      const first = start.current;
      const touch = e.nativeEvent.changedTouches.find(t => t.identifier === first?.id);
      const duration = first ? e.nativeEvent.timestamp - first.time : -1;
      const tap = !disabled && first && touch && e.nativeEvent.touches.length === 0 && duration >= 0 && duration <= 350 &&
        Math.hypot(touch.pageX - first.x, touch.pageY - first.y) <= 6;
      cancel(); if (tap) onPress?.();
    }}>{children}</View>;
}
