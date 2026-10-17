import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeScrollEvent } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { FeedTab, useFeedChrome } from '../contexts/FeedChromeContext';
import { advanceFeedChromeScroll, initialFeedChromeScrollState } from '../utils/feedChromeScroll';

export function useFeedScrollChrome(tab: FeedTab, locked: boolean) {
  const chrome = useFeedChrome(tab);
  const { setHidden } = chrome;
  const focused = useIsFocused();
  const scroll = useRef(initialFeedChromeScrollState());
  const [filterPanel, setFilterPanel] = useState({ compact: false, expanded: false });
  const filterPanelRef = useRef(filterPanel);
  const updateFilterPanel = useCallback((compact: boolean, expanded: boolean) => {
    const previous = filterPanelRef.current;
    if (previous.compact === compact && previous.expanded === expanded) return;
    filterPanelRef.current = { compact, expanded };
    setFilterPanel(filterPanelRef.current);
  }, []);
  const reveal = useCallback((immediate = false) => {
    scroll.current = { ...scroll.current, travel: 0, hidden: false };
    updateFilterPanel(false, false);
    setHidden(false, !immediate);
  }, [setHidden, updateFilterPanel]);

  // A newly selected feed, search, and tutorial always expose their controls.
  useEffect(() => { reveal(true); }, [focused, locked, reveal]);

  const onScroll = useCallback((event: NativeScrollEvent) => {
    if (!focused || locked) return;
    const previous = scroll.current;
    scroll.current = advanceFeedChromeScroll(
      previous, event.contentOffset.y,
      event.contentSize.height - event.layoutMeasurement.height,
    );
    const compact = scroll.current.y > 20 && (filterPanelRef.current.compact || scroll.current.hidden);
    const expanded = compact && filterPanelRef.current.expanded && Math.abs(scroll.current.y - previous.y) < 2;
    updateFilterPanel(compact, expanded);
    setHidden(scroll.current.hidden);
  }, [focused, locked, setHidden, updateFilterPanel]);

  const toggleFilters = useCallback(() => {
    if (filterPanelRef.current.compact) updateFilterPanel(true, !filterPanelRef.current.expanded);
  }, [updateFilterPanel]);
  const dismissFilters = useCallback(() => {
    updateFilterPanel(filterPanelRef.current.compact, false);
  }, [updateFilterPanel]);

  return { ...chrome, reveal, onScroll, compactFilters: filterPanel.compact && !locked,
    filtersExpanded: filterPanel.expanded && !locked, toggleFilters, dismissFilters };
}
