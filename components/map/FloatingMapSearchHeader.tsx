import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, BackHandler, Easing, Image, Keyboard, Pressable,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMapStore } from '../../store';
import useAnalytics from '../../hooks/useAnalytics';

type Props = { top: number; onSettings: () => void };

export default function FloatingMapSearchHeader({ top, onSettings }: Props) {
  const active = useMapStore((state) => state.isHeaderSearchActive);
  const query = useMapStore((state) => state.searchQuery);
  const setActive = useMapStore((state) => state.setHeaderSearchActive);
  const setQuery = useMapStore((state) => state.setSearchQuery);
  const analytics = useAnalytics();
  const input = useRef<TextInput>(null);
  const expansion = useRef(new Animated.Value(active ? 1 : 0)).current;
  const [width, setWidth] = useState(0);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    const animation = Animated.timing(expansion, {
      toValue: active ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    // Let the expanding field mount before requesting the keyboard.
    const focusTimer = active && width > 0 ? setTimeout(() => input.current?.focus(), 100) : undefined;
    return () => {
      animation.stop();
      if (focusTimer !== undefined) clearTimeout(focusTimer);
    };
  }, [active, expansion, width]);

  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setActive(false);
      Keyboard.dismiss();
      return true;
    });
    const keyboardSubscription = Keyboard.addListener('keyboardDidHide', () => setActive(false));
    return () => {
      subscription.remove();
      keyboardSubscription.remove();
    };
  }, [active, setActive]);

  const open = () => {
    analytics.trackUserAction('header_search_activated', { screen: 'map' });
    setActive(true);
  };
  const clear = () => {
    analytics.trackUserAction('search_query_cleared', {
      screen: 'map', previous_query_length: query.length, clear_method: 'clear_button',
    });
    setQuery('');
  };
  const close = () => {
    setActive(false);
    Keyboard.dismiss();
  };

  return (
    <>
      {active && (
        <Pressable
          testID="map-search-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Dismiss search keyboard"
          onPress={close}
          style={[StyleSheet.absoluteFillObject, styles.backdrop]}
        />
      )}
      <View
        pointerEvents="box-none"
        style={[styles.header, { top }, active && styles.activeHeader]}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {!active && (
          <>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Search"
              testID="floating-map-search-button" onPress={open} style={styles.circle}>
              <Ionicons name="search" size={20} color="#202124" />
              {hasQuery && <View pointerEvents="none" style={styles.activeDot} />}
            </TouchableOpacity>
            <View pointerEvents="box-none" style={styles.titleSlot}>
              {hasQuery ? (
                <View style={styles.queryPill} testID="map-search-query-pill">
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit search: ${query}`}
                    onPress={open} style={styles.queryEdit}>
                    <Ionicons name="search" size={16} color="#FFFFFF" />
                    <Text style={styles.queryText} numberOfLines={1} ellipsizeMode="tail">{query}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search"
                    testID="map-search-query-clear" onPress={clear} style={styles.queryClear}>
                    <Ionicons name="close" size={16} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View pointerEvents="none" style={styles.brandPill}>
                  <Image source={require('../../assets/GathR Text Logo.png')}
                    style={styles.brandLogo} resizeMode="contain" />
                </View>
              )}
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Settings"
              testID="floating-profile-button" onPress={onSettings} style={styles.circle}>
              <Ionicons name="settings-outline" size={20} color="#202124" />
            </TouchableOpacity>
          </>
        )}
        {active && width > 0 && (
          <Animated.View testID="map-search-dock" style={[styles.searchDock, {
            width: expansion.interpolate({ inputRange: [0, 1], outputRange: [40, width] }),
          }]}>
            <View style={styles.searchDockContent}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel search"
              onPress={() => { clear(); close(); }} style={styles.dockButton}>
              <Ionicons name="arrow-back" size={24} color="#1E90FF" />
            </TouchableOpacity>
            <TextInput
              ref={input}
              testID="map-search-input"
              accessibilityLabel="Search events and specials"
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search events & specials…"
              placeholderTextColor="#8A909C"
              selectionColor="#1E90FF"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => {
                analytics.trackUserAction('search_submitted', {
                  screen: 'map', query_length: query.length, submission_method: 'keyboard_enter',
                });
                close();
              }}
            />
            {query.length > 0 && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search text"
                onPress={() => { clear(); input.current?.focus(); }} style={styles.dockButton}>
                <Ionicons name="close-circle" size={20} color="#8A909C" />
              </TouchableOpacity>
            )}
            </View>
          </Animated.View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { zIndex: 9999, elevation: 29 },
  header: {
    position: 'absolute', left: 16, right: 16, height: 44,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    zIndex: 28, elevation: 28,
  },
  activeHeader: { zIndex: 10000, elevation: 30 },
  circle: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#000000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  activeDot: {
    position: 'absolute', right: 8, top: 7, width: 7, height: 7,
    borderRadius: 4, backgroundColor: '#FF6B35', borderWidth: 1, borderColor: '#FFFFFF',
  },
  titleSlot: {
    position: 'absolute', left: 56, right: 56, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  brandPill: {
    width: 116, height: 42, alignItems: 'center', justifyContent: 'center',
    borderRadius: 24, backgroundColor: '#1E90FF', overflow: 'hidden',
    shadowColor: '#000000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22, shadowRadius: 8, elevation: 7,
  },
  brandLogo: { width: 110, height: 72 },
  queryPill: {
    maxWidth: '100%', height: 42, paddingLeft: 12, paddingRight: 4,
    flexDirection: 'row', alignItems: 'center', borderRadius: 24,
    backgroundColor: '#1E90FF', shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 7,
  },
  queryEdit: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, height: 42 },
  queryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginLeft: 6, flexShrink: 1 },
  queryClear: { width: 32, height: 42, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  searchDock: {
    height: 44, flexDirection: 'row', alignItems: 'center',
    borderRadius: 24, backgroundColor: '#FFFFFF',
    shadowColor: '#000000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  searchDockContent: {
    width: '100%', height: 44, flexDirection: 'row', alignItems: 'center',
    borderRadius: 24, overflow: 'hidden',
  },
  dockButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minWidth: 0, height: 44, paddingVertical: 0, paddingLeft: 4, paddingRight: 12, fontSize: 16, color: '#202124' },
});
