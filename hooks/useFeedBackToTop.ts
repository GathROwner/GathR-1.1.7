import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

export function useFeedBackToTop(threshold: number) {
  const focused = useIsFocused();
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const y = useRef(0);
  const dragging = useRef(false);
  const momentum = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const hide = useCallback(() => {
    cancel();
    opacity.stopAnimation();
    opacity.setValue(0);
    if (visibleRef.current) {
      visibleRef.current = false;
      setVisible(false);
    }
  }, [cancel, opacity]);
  const schedule = useCallback(() => {
    cancel();
    if (!focused || dragging.current || momentum.current || y.current <= threshold) return;
    // Also covers programmatic scrolling and drags that produce no momentum.
    timer.current = setTimeout(() => {
      timer.current = null;
      visibleRef.current = true;
      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    }, 220);
  }, [cancel, focused, opacity, threshold]);
  useEffect(() => {
    hide(); dragging.current = false; momentum.current = false;
    return () => { cancel(); opacity.stopAnimation(); };
  }, [focused, hide, cancel, opacity]);

  return {
    visible, opacity, hide,
    onScroll: (offset: number) => { y.current = offset; hide(); schedule(); },
    onScrollBeginDrag: () => { dragging.current = true; hide(); },
    onScrollEndDrag: () => { dragging.current = false; schedule(); },
    onMomentumScrollBegin: () => { momentum.current = true; hide(); },
    onMomentumScrollEnd: () => { momentum.current = false; schedule(); },
  };
}
