import { useCallback, useEffect, useRef } from 'react';
import { NativeScrollEvent } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { FeedTab, useFeedChrome } from '../contexts/FeedChromeContext';
import { advanceFeedChromeScroll, initialFeedChromeScrollState } from '../utils/feedChromeScroll';

export function useFeedScrollChrome(tab: FeedTab, locked: boolean) {
  const chrome = useFeedChrome(tab);
  const { setHidden } = chrome;
  const focused = useIsFocused();
  const scroll = useRef(initialFeedChromeScrollState());
  const reveal = useCallback((immediate = false) => {
    scroll.current = { ...scroll.current, travel: 0, hidden: false };
    setHidden(false, !immediate);
  }, [setHidden]);

  // A newly selected feed, search, and tutorial always expose their controls.
  useEffect(() => { reveal(true); }, [focused, locked, reveal]);

  const onScroll = useCallback((event: NativeScrollEvent) => {
    if (!focused || locked) return;
    scroll.current = advanceFeedChromeScroll(
      scroll.current, event.contentOffset.y,
      event.contentSize.height - event.layoutMeasurement.height,
    );
    setHidden(scroll.current.hidden);
  }, [focused, locked, setHidden]);

  return { ...chrome, reveal, onScroll };
}
