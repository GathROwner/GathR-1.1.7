import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

export type FeedTab = 'events' | 'specials';

function useChannel() {
  const progress = useRef(new Animated.Value(0)).current;
  const hiddenRef = useRef(false);
  const [hidden, setHiddenState] = useState(false);
  const reduceMotion = useRef(false);
  useEffect(() => {
    let mounted = true;
    const update = (enabled: boolean) => {
      reduceMotion.current = enabled;
      if (enabled) {
        progress.stopAnimation();
        progress.setValue(hiddenRef.current ? 1 : 0);
      }
    };
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (mounted) update(enabled); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => { mounted = false; subscription.remove(); progress.stopAnimation(); };
  }, [progress]);
  const setHidden = useCallback((next: boolean, animated = true) => {
    if (next === hiddenRef.current && animated) return;
    hiddenRef.current = next;
    setHiddenState(next);
    if (!animated || reduceMotion.current) {
      progress.stopAnimation();
      progress.setValue(next ? 1 : 0);
    } else {
      Animated.timing(progress, {
        toValue: next ? 1 : 0, duration: 240, useNativeDriver: true,
      }).start();
    }
  }, [progress]);
  return useMemo(() => ({ progress, hidden, setHidden }), [progress, hidden, setHidden]);
}

const FeedChromeContext = createContext<Record<FeedTab, ReturnType<typeof useChannel>> | null>(null);

export function FeedChromeProvider({ children }: { children: React.ReactNode }) {
  const events = useChannel();
  const specials = useChannel();
  const value = useMemo(() => ({ events, specials }), [events, specials]);
  return <FeedChromeContext.Provider value={value}>{children}</FeedChromeContext.Provider>;
}

export function useFeedChrome(tab: FeedTab) {
  const context = useContext(FeedChromeContext);
  if (!context) throw new Error('Feed chrome requires FeedChromeProvider');
  return context[tab];
}
