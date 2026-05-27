// app\(tabs)\_layout.tsx

import { Tabs } from 'expo-router';
import { TouchableOpacity, View, TextInput, Text, Animated, Image, InteractionManager, Pressable, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useMapStore } from '../../store/mapStore';
import { Alert, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState, useRef } from 'react';

// ===============================================================
// GUEST LIMITATION IMPORTS - FOR TAB INTERACTION TRACKING
// ===============================================================
import { useAuth } from '../../contexts/AuthContext';
import { trackTabSelect } from '../../store/guestLimitationStore';

// ===============================================================
// ANALYTICS IMPORT - RE-ENABLED
// ===============================================================
import useAnalytics from '../../hooks/useAnalytics';
import { runAfterTabPaint } from '../../utils/tabFocusEffects';
import {
  markTabBarSelected,
  markTabButtonPressReturned,
  markTabNavigatorFocus,
  markTabPress,
  markTabPressIn,
} from '../../utils/tabSwitchTrace';

const TAB_PREWARM_FALLBACK_DELAY_MS = 30000;
const POST_TAB_PREFETCH_DELAY_MS = 8000;
type InstrumentedTabName = 'events' | 'map' | 'specials';
const TAB_PRESS_RIPPLE = Platform.OS === 'android'
  ? { color: 'rgba(0, 0, 0, 0.08)', borderless: false }
  : undefined;
const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get('window');
const IS_ANDROID_TABLET = Platform.OS === 'android' && Math.min(WINDOW_WIDTH, WINDOW_HEIGHT) >= 600;
const BASE_TAB_BAR_HEIGHT = 56;
const ANDROID_TABLET_TASKBAR_RESERVE = 52;
const IOS_TAB_BAR_BOTTOM_PADDING_REDUCTION = 8;
type InstrumentedTabBarButtonProps = any & {
  targetTab: InstrumentedTabName;
};

const pauseMapAnimationsForTabHandoff = (targetTab: InstrumentedTabName, isSelected: boolean) => {
  if (Platform.OS !== 'android' || isSelected || targetTab === 'map') {
    return;
  }

  const pauseMapAnimations = (global as any).pauseMapTabAnimationsForHandoff;
  if (typeof pauseMapAnimations === 'function') {
    pauseMapAnimations(targetTab);
  }
};

const InstrumentedTabBarButton = (props: InstrumentedTabBarButtonProps) => {
  const { children, onPress, onLongPress, targetTab, accessibilityState } = props;
  const isSelected = Boolean(accessibilityState?.selected);

  useEffect(() => {
    if (isSelected) {
      markTabBarSelected(targetTab);
    }
  }, [isSelected, targetTab]);

  const handlePressIn = () => {
    pauseMapAnimationsForTabHandoff(targetTab, isSelected);
    markTabPressIn(targetTab, isSelected);
  };

  const handlePress = (event: any) => {
    markTabPress(targetTab, isSelected);
    onPress?.(event);
    markTabButtonPressReturned(targetTab);
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPress={handlePress}
      onLongPress={onLongPress}
      android_ripple={TAB_PRESS_RIPPLE}
      style={{ flex: 1 }}
    >
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        {children}
      </View>
    </Pressable>
  );
};

const TutorialAwareTabBarButton = (props: InstrumentedTabBarButtonProps) => {
  const { children, onPress, onLongPress, targetTab, accessibilityState } = props;
  const isSelected = Boolean(accessibilityState?.selected);
  const viewRef = useRef<View>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [isHighlighted, setIsHighlighted] = useState(false);

  useEffect(() => {
    if (isSelected) {
      markTabBarSelected(targetTab);
    }
  }, [isSelected, targetTab]);

  useEffect(() => {
    const interval = setInterval(() => {
      const globalFlag = (global as any).tutorialHighlightEventsTab || false;
      if (globalFlag !== isHighlighted) {
        setIsHighlighted(globalFlag);
      }
      if (globalFlag && viewRef.current) {
        (viewRef.current as View).measure((_x, _y, width, height, pageX, pageY) => {
          (global as any).eventsTabLayout = { x: pageX, y: pageY, width, height };
        });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isHighlighted]);

  useEffect(() => {
    if (isHighlighted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, useNativeDriver: true, duration: 800 }),
          Animated.timing(pulseAnim, { toValue: 1, useNativeDriver: true, duration: 800 }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isHighlighted]);

  const tutorialHighlightStyle = {
    // The shadow creates a "glow" effect
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 15, // Required for shadow on Android

    // A subtle border to define the edge
    borderWidth: 2,
    borderColor: '#FF8C42', // A slightly lighter orange for the border
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)', // A light background to make it pop

    zIndex: 99999,
    transform: [{ scale: pulseAnim }],
  };

  const handlePressIn = () => {
    pauseMapAnimationsForTabHandoff(targetTab, isSelected);
    markTabPressIn(targetTab, isSelected);
  };

  const handlePress = (event: any) => {
    markTabPress(targetTab, isSelected);
    onPress?.(event);
    markTabButtonPressReturned(targetTab);
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPress={handlePress}
      onLongPress={onLongPress}
      android_ripple={TAB_PRESS_RIPPLE}
      style={{ flex: 1 }}
    >
      <Animated.View
        ref={viewRef}
        style={[
          { flex: 1, justifyContent: 'center', alignItems: 'center' },
          isHighlighted && tutorialHighlightStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};

const TutorialAwareSpecialsTabBarButton = (props: InstrumentedTabBarButtonProps) => {
  const { children, onPress, onLongPress, targetTab, accessibilityState } = props;
  const isSelected = Boolean(accessibilityState?.selected);
  const viewRef = useRef<View>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [isHighlighted, setIsHighlighted] = useState(false);

  useEffect(() => {
    if (isSelected) {
      markTabBarSelected(targetTab);
    }
  }, [isSelected, targetTab]);

  useEffect(() => {
    const interval = setInterval(() => {
      const globalFlag = (global as any).tutorialHighlightSpecialsTab || false;
      if (globalFlag !== isHighlighted) {
        setIsHighlighted(globalFlag);
      }
      if (globalFlag && viewRef.current) {
        (viewRef.current as View).measure((_x, _y, width, height, pageX, pageY) => {
          (global as any).specialsTabLayout = { x: pageX, y: pageY, width, height };
        });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isHighlighted]);

  useEffect(() => {
    if (isHighlighted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, useNativeDriver: true, duration: 800 }),
          Animated.timing(pulseAnim, { toValue: 1, useNativeDriver: true, duration: 800 }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isHighlighted]);

  const tutorialHighlightStyle = {
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 15,
    borderWidth: 2,
    borderColor: '#FF8C42',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    zIndex: 99999,
    transform: [{ scale: pulseAnim }],
  };

  const handlePressIn = () => {
    pauseMapAnimationsForTabHandoff(targetTab, isSelected);
    markTabPressIn(targetTab, isSelected);
  };

  const handlePress = (event: any) => {
    markTabPress(targetTab, isSelected);
    onPress?.(event);
    markTabButtonPressReturned(targetTab);
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPress={handlePress}
      onLongPress={onLongPress}
      android_ripple={TAB_PRESS_RIPPLE}
      style={{ flex: 1 }}
    >
      <Animated.View
        ref={viewRef}
        style={[
          { flex: 1, justifyContent: 'center', alignItems: 'center' },
          isHighlighted && tutorialHighlightStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};

const renderEventsTabBarButton = (props: any) => (
  <TutorialAwareTabBarButton {...props} targetTab="events" />
);

const renderMapTabBarButton = (props: any) => (
  <InstrumentedTabBarButton {...props} targetTab="map" />
);

const renderSpecialsTabBarButton = (props: any) => (
  <TutorialAwareSpecialsTabBarButton {...props} targetTab="specials" />
);

// Custom Header Title Component with Analytics - RE-ENABLED
const HeaderTitle = ({ route }: { route: any }) => {
  // Select only state values with shallow comparison, get setters directly
  const isHeaderSearchActive = useMapStore((state) => state.isHeaderSearchActive);
  const searchQuery = useMapStore((state) => state.searchQuery);
  const setHeaderSearchActive = useMapStore((state) => state.setHeaderSearchActive);
  const setSearchQuery = useMapStore((state) => state.setSearchQuery);
  const analytics = useAnalytics(); // RE-ENABLED
  const searchStartTime = useRef<number | null>(null);
  const [searchSessionActive, setSearchSessionActive] = useState(false);

  // Track search activation - RE-ENABLED
  const handleSearchActivation = () => {
    const activationTime = Date.now();
    searchStartTime.current = activationTime;
    setSearchSessionActive(true);
    
    // Track search activation
    analytics.trackUserAction('search_activated', {
      screen: route.name,
      activation_method: 'header_button',
      timestamp: new Date(activationTime).toISOString()
    });
    
    analytics.trackFeatureEngagement('header_search', {
      action: 'activate',
      screen: route.name
    });
    
    setHeaderSearchActive(true);
  };

  // Track search deactivation - RE-ENABLED
  const handleSearchDeactivation = () => {
    const deactivationTime = Date.now();
    const searchDuration = searchStartTime.current ? deactivationTime - searchStartTime.current : 0;
    
    // Track search session completion
    analytics.trackUserAction('search_deactivated', {
      screen: route.name,
      search_duration_ms: searchDuration,
      final_query: searchQuery,
      query_length: searchQuery.length,
      session_abandoned: searchQuery.length === 0
    });
    
    analytics.trackFeatureEngagement('header_search', {
      action: 'deactivate',
      screen: route.name,
      duration_ms: searchDuration,
      query_length: searchQuery.length
    });
    
    setHeaderSearchActive(false);
    setSearchQuery('');
    setSearchSessionActive(false);
    searchStartTime.current = null;
  };

  // Track search query changes - RE-ENABLED
  const handleSearchQueryChange = (text: string) => {
    // Track search input behavior
    if (text.length > 0 && searchQuery.length === 0) {
      // First character typed
      analytics.trackUserAction('search_input_started', {
        screen: route.name,
        time_to_first_char_ms: searchStartTime.current ? Date.now() - searchStartTime.current : 0
      });
    }
    
    // Track significant query changes (every 3 characters or on clear)
    if (text.length % 3 === 0 || text.length === 0) {
      analytics.trackUserAction('search_query_change', {
        screen: route.name,
        query_length: text.length,
        query_preview: text.substring(0, 10), // First 10 chars for analysis
        search_direction: text.length > searchQuery.length ? 'typing' : 'deleting'
      });
    }
    
    setSearchQuery(text);
  };

  // Track search clear - RE-ENABLED
  const handleSearchClear = () => {
    analytics.trackUserAction('search_query_cleared', {
      screen: route.name,
      previous_query_length: searchQuery.length,
      clear_method: 'clear_button'
    });
    
    setSearchQuery('');
  };

  // Clean up search session on unmount - RE-ENABLED
  useEffect(() => {
    return () => {
      if (searchSessionActive && searchStartTime.current) {
        const sessionDuration = Date.now() - searchStartTime.current;
        analytics.trackUserAction('search_session_cleanup', {
          screen: route.name,
          session_duration_ms: sessionDuration,
          final_query: searchQuery
        });
      }
    };
  }, []); // Keep dependency array empty - this was already correct

  if (!isHeaderSearchActive) {
    const hasQuery = (searchQuery ?? '').trim().length > 0;
    if (hasQuery) {
      // Compact inline pill replacing the title
      return (
        <TouchableOpacity
          onPress={() => setHeaderSearchActive(true)}
          activeOpacity={0.8}
          style={{ maxWidth: '100%' }}
        >
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: 16,
            backgroundColor: 'rgba(255,255,255,0.18)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.45)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.16,
            shadowRadius: 6,
            elevation: 2,
          }}>
            <Ionicons name="search" size={16} color="#FFFFFF" style={{ marginRight: 6, opacity: 0.95 }} />
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', maxWidth: 240, flexShrink: 1 }}
            >
              {searchQuery}
            </Text>

            <View style={{ marginLeft: 8, position: 'relative' }}>
              {/* Match FilterPills.tsx styles.activeFilterDot exactly */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: '#FF3B30',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.9)',
                }}
              />

              <TouchableOpacity
                onPress={(e) => { e.stopPropagation?.(); handleSearchClear(); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                }}
              >
                <Ionicons name="close" size={12} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );

    }
      return (
        <View style={{ height: '100%', justifyContent: 'center', alignItems: 'center' }}>
          <Image 
            source={require('../../assets/GathR Text Logo.png')}
            style={{ width: 105, height: 105, marginTop: -6 }}
            resizeMode="contain"
          />
        </View>
      );
  }

  const placeholder =
    route.name === 'events'
      ? 'Search events...'
      : route.name === 'specials'
      ? 'Search specials...'
      : 'Search events & specials...';

  return (
    <View style={{ 
      flexDirection: 'row', 
      alignItems: 'center', 
      width: '100%',
      paddingHorizontal: 0,
      paddingBottom: 6,
      justifyContent: 'space-between'
    }}>
      <TouchableOpacity
        onPress={handleSearchDeactivation}
        style={{ paddingRight: 8 }}
      >
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      
      <TextInput
        style={{
          flex: 1,
          color: '#FFFFFF',
          fontSize: 16,
          paddingVertical: 8,
          paddingHorizontal: 12,
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: 8,
          marginHorizontal: 8,
        }}
        value={searchQuery}
        onChangeText={handleSearchQueryChange}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.7)"
        autoFocus={true}
        returnKeyType="search"
        onSubmitEditing={() => {
          // Track search submission
          analytics.trackUserAction('search_submitted', {
            screen: route.name,
            query: searchQuery,
            query_length: searchQuery.length,
            submission_method: 'keyboard_enter'
          });
          
          analytics.trackFeatureEngagement('search_submit', {
            screen: route.name,
            query_length: searchQuery.length,
            has_results: searchQuery.length > 0
          });
        }}
      />
      
      <TouchableOpacity
        onPress={handleSearchClear}
        style={{ paddingLeft: 8, opacity: searchQuery.length > 0 ? 1 : 0 }}
      >
        <Ionicons name="close" size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

export default function TabLayout() {
  const router = useRouter();
  const navigation = useNavigation<any>();
  // Select only state values, get setters/actions directly
  const isHeaderSearchActive = useMapStore((state) => state.isHeaderSearchActive);
  const searchQuery = useMapStore((state) => state.searchQuery);
  const setHeaderSearchActive = useMapStore((state) => state.setHeaderSearchActive);
  const triggerScrollToTop = useMapStore((state) => state.triggerScrollToTop);
  const analytics = useAnalytics(); // RE-ENABLED
  const insets = useSafeAreaInsets();
  const androidTabletTabBarBottomPadding = IS_ANDROID_TABLET
    ? Math.max(insets.bottom, ANDROID_TABLET_TASKBAR_RESERVE)
    : 0;
  const androidTabletTabBarStyle = androidTabletTabBarBottomPadding
    ? {
        height: BASE_TAB_BAR_HEIGHT + androidTabletTabBarBottomPadding,
        paddingBottom: androidTabletTabBarBottomPadding,
      }
    : undefined;
  const iosTabBarBottomPadding = Platform.OS === 'ios'
    ? Math.max(insets.bottom - IOS_TAB_BAR_BOTTOM_PADDING_REDUCTION, 0)
    : 0;
  const iosTabBarStyle = Platform.OS === 'ios'
    ? {
        height: BASE_TAB_BAR_HEIGHT + iosTabBarBottomPadding,
        paddingBottom: iosTabBarBottomPadding,
        paddingTop: 4,
      }
    : undefined;
  const tabBarStyle = androidTabletTabBarStyle ?? iosTabBarStyle;
  
  const { user } = useAuth();
  const isGuest = !user;

  const [prewarmInactiveTabs, setPrewarmInactiveTabs] = useState(false);
  const postSwitchPrefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabScreenViewCancelRef = useRef<(() => void) | null>(null);
  const tabPrewarmStartedRef = useRef(false);

  // Tutorial awareness for profile button
  const profileButtonRef = useRef<View>(null);
  const profileButtonPulseAnim = useRef(new Animated.Value(1)).current;
  const [profileButtonHighlighted, setProfileButtonHighlighted] = useState(false);

  useEffect(() => {
    let lastMeasurement: any = null;
    let measurementCount = 0;
    
    const interval = setInterval(() => {
      const globalFlag = (global as any).tutorialHighlightProfileFacebook || false;
      if (globalFlag !== profileButtonHighlighted) {
        setProfileButtonHighlighted(globalFlag);
      }
      if (globalFlag && profileButtonRef.current) {
        profileButtonRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
          // Add stability check to prevent measurement spam
          const currentMeasurement = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
          
          if (!lastMeasurement || 
              Math.abs(currentMeasurement.x - lastMeasurement.x) > 2 ||
              Math.abs(currentMeasurement.y - lastMeasurement.y) > 2 ||
              Math.abs(currentMeasurement.width - lastMeasurement.width) > 2 ||
              Math.abs(currentMeasurement.height - lastMeasurement.height) > 2) {
            
            lastMeasurement = currentMeasurement;
            measurementCount++;
            
            // Only log first few measurements to prevent spam
            if (measurementCount <= 3) {
              console.log('Tutorial: Measured profile button:', currentMeasurement);
            }
            
            (global as any).profileFacebookLayout = currentMeasurement;
          }
        });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [profileButtonHighlighted]);

  useEffect(() => {
    if (profileButtonHighlighted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(profileButtonPulseAnim, { toValue: 1.2, useNativeDriver: true, duration: 800 }),
          Animated.timing(profileButtonPulseAnim, { toValue: 1, useNativeDriver: true, duration: 800 }),
        ])
      ).start();
    } else {
      profileButtonPulseAnim.stopAnimation();
      profileButtonPulseAnim.setValue(1);
    }
  }, [profileButtonHighlighted]);

  const handleProfileButtonPress = () => {
    analytics.trackUserAction('profile_access', { access_method: 'header_button' });
    router.push('/profile');
  };

  const handleSearchActivation = () => {
    analytics.trackUserAction('header_search_activated', {});
    setHeaderSearchActive(true);
  };

  const trackTabScreenViewAfterPaint = (tabName: InstrumentedTabName) => {
    tabScreenViewCancelRef.current?.();
    tabScreenViewCancelRef.current = runAfterTabPaint(() => {
      tabScreenViewCancelRef.current = null;
      analytics.trackScreenView(tabName, {});
    });
  };

  const handleTabSwitch = (tabName: string, isFocused: boolean) => {
    // Defer ALL operations until after UI interactions complete
    // This gives priority to the tab switch animation
    InteractionManager.runAfterInteractions(() => {
      if (isHeaderSearchActive) {
        setHeaderSearchActive(false);
        Keyboard.dismiss();
      }

      if (isFocused && (tabName === 'events' || tabName === 'specials')) {
        triggerScrollToTop(tabName);
        if (isGuest) {
          trackTabSelect(tabName);
        }
      }
    });
  };

  const schedulePostSwitchPrefetch = (maxAgeMs: number = 180000) => {
    InteractionManager.runAfterInteractions(() => {
      if (postSwitchPrefetchTimerRef.current) {
        clearTimeout(postSwitchPrefetchTimerRef.current);
      }

      postSwitchPrefetchTimerRef.current = setTimeout(() => {
        postSwitchPrefetchTimerRef.current = null;
        useMapStore.getState().prefetchIfStale?.(maxAgeMs);
      }, POST_TAB_PREFETCH_DELAY_MS);
    });
  };

  useEffect(() => {
    analytics.trackUserAction('tab_layout_initialized', {});
  }, []);

  useEffect(() => {
    return () => {
      if (postSwitchPrefetchTimerRef.current) {
        clearTimeout(postSwitchPrefetchTimerRef.current);
      }
      tabScreenViewCancelRef.current?.();
      tabScreenViewCancelRef.current = null;
    };
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const globalAny = global as any;

    const prewarmTabs = (source: string = 'unknown') => {
      if (cancelled || tabPrewarmStartedRef.current) {
        return;
      }

      tabPrewarmStartedRef.current = true;
      if (__DEV__) {
        console.log('[GathRTabPerf]', JSON.stringify({
          phase: 'tab_prewarm_start',
          source,
          wallTime: new Date().toISOString(),
        }));
      }
      navigation.preload?.('events');
      navigation.preload?.('specials');
      setPrewarmInactiveTabs(true);
    };

    globalAny.mapReadyForTabPrewarmCallback = prewarmTabs;

    timeout = setTimeout(() => {
      prewarmTabs('fallback_timer');
    }, TAB_PREWARM_FALLBACK_DELAY_MS);

    return () => {
      cancelled = true;
      if (globalAny.mapReadyForTabPrewarmCallback === prewarmTabs) {
        delete globalAny.mapReadyForTabPrewarmCallback;
      }
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [navigation]);

  return (
    <Tabs screenOptions={({ route }) => ({
      headerRight: () => (
        !isHeaderSearchActive ? (
          <View style={{ marginRight: 16 }}>
            <Animated.View
              ref={profileButtonRef as any}
              style={[
                profileButtonHighlighted ? {
                  shadowColor: '#FF6B35',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.9,
                  shadowRadius: 12,
                  elevation: 15,
                  borderWidth: 3,
                  borderColor: '#FF8C42',
                  borderRadius: 20,
                  backgroundColor: 'rgba(30, 144, 255, 0.3)',
                  transform: [{ scale: profileButtonPulseAnim }],
                } : {}
              ]}
              onLayout={() => {
                // Immediate measurement for tutorial
                if ((global as any).tutorialHighlightProfileFacebook && profileButtonRef.current) {
                  profileButtonRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
                    (global as any).profileFacebookLayout = { x, y, width, height };
                  });
                }
              }}
            >
              <TouchableOpacity 
                onPress={handleProfileButtonPress} 
                style={{ padding: 5 }}
                testID="profile-button"
              >
                <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </Animated.View>
          </View>
        ) : null
      ),
      headerStyle: { backgroundColor: '#1E90FF' },
      headerTintColor: '#FFFFFF',
      headerTitleAlign: 'center', // This fixes the Android centering issue
      animation: 'none', // Disabled for faster tab switches (was 'fade')
      // Keep startup focused on the active tab. Eager-mounting Events and
      // Specials competes with Map hotspot startup on slower Android tablets,
      // but mount them after startup so later tab switches do not pay that cost.
      lazy: !prewarmInactiveTabs,
      freezeOnBlur: Platform.OS === 'android' ? true : false,
      tabBarStyle,
    })}>
      <Tabs.Screen
        name="events"
        options={({ route }) => ({
          title: 'Events',
          headerTitle: () => <HeaderTitle route={route} />,
          // Keep list tabs warm once preloaded. The Map tab keeps Android
          // freezeOnBlur from screenOptions, avoiding the prior Mapbox
          // invalid-surface behavior from disabling freeze globally.
          freezeOnBlur: false,
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#B0B0B0',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={24} color={color} />,
          tabBarButton: renderEventsTabBarButton,
           headerLeft: () => (
            !isHeaderSearchActive ? (
              <TouchableOpacity onPress={handleSearchActivation} style={{ marginLeft: 16 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                    borderRadius: 16,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.45)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.16,
                    shadowRadius: 6,
                    elevation: 2,
                  }}
                >
                  <View>
                    <Ionicons name="search" size={14} color="#FFFFFF" style={{ marginRight: 4, opacity: 0.95 }} />
                    {(searchQuery?.trim()?.length ?? 0) > 0 && (
                      <View style={{ position: 'absolute', right: -1, top: -1, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF6B35' }} />
                    )}
                  </View>
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', marginLeft: 2, opacity: 0.95 }}>
                    Search
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null
          ),

        })}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const focused = navigation.isFocused();
            handleTabSwitch('events', focused);
            if (!focused) { schedulePostSwitchPrefetch(180000); }
          },
          tabLongPress: (e) => { schedulePostSwitchPrefetch(180000); },
          focus: (e) => {
            markTabNavigatorFocus('events');
            trackTabScreenViewAfterPaint('events');
          }
        })}
      />
      
      <Tabs.Screen
        name="map"
        options={({ route }) => ({
          title: 'Map',
          headerTitle: () => <HeaderTitle route={route} />,
          tabBarActiveTintColor: '#1A1A1A',
          tabBarInactiveTintColor: '#B0B0B0',
          headerLeft: () => (
            !isHeaderSearchActive ? (
              <TouchableOpacity onPress={handleSearchActivation} style={{ marginLeft: 16 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                    borderRadius: 16,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.45)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.16,
                    shadowRadius: 6,
                    elevation: 2,
                  }}
                >
                  <View>
                    <Ionicons name="search" size={14} color="#FFFFFF" style={{ marginRight: 4, opacity: 0.95 }} />
                    {(searchQuery?.trim()?.length ?? 0) > 0 && (
                      <View style={{ position: 'absolute', right: -1, top: -1, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF6B35' }} />
                    )}
                  </View>
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', marginLeft: 2, opacity: 0.95 }}>
                    Search
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null
          ),
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "map" : "map-outline"} size={24} color={color} />,
          tabBarButton: renderMapTabBarButton,
        })}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const focused = navigation.isFocused();
            handleTabSwitch('map', focused);
            InteractionManager.runAfterInteractions(() => {
              if (focused) {
                useMapStore.getState().triggerCloseCallout();
              } else {
                schedulePostSwitchPrefetch(180000);
              }
            });
          },
          focus: (e) => {
            markTabNavigatorFocus('map');
            trackTabScreenViewAfterPaint('map');
          }
        })}
      />

      <Tabs.Screen
        name="specials"
        options={({ route }) => ({
          title: 'Specials',
          headerTitle: () => <HeaderTitle route={route} />,
          // Keep list tabs warm once preloaded. The Map tab keeps Android
          // freezeOnBlur from screenOptions, avoiding the prior Mapbox
          // invalid-surface behavior from disabling freeze globally.
          freezeOnBlur: false,
          tabBarActiveTintColor: '#34A853',
          tabBarInactiveTintColor: '#B0B0B0',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "restaurant" : "restaurant-outline"} size={24} color={color} />,
          tabBarButton: renderSpecialsTabBarButton,
          headerLeft: () => (
            !isHeaderSearchActive ? (
              <TouchableOpacity onPress={handleSearchActivation} style={{ marginLeft: 16 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                    borderRadius: 16,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.45)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.16,
                    shadowRadius: 6,
                    elevation: 2,
                  }}
                >
                  <View>
                    <Ionicons name="search" size={14} color="#FFFFFF" style={{ marginRight: 4, opacity: 0.95 }} />
                    {(searchQuery?.trim()?.length ?? 0) > 0 && (
                      <View
                        style={{
                          position: 'absolute',
                          right: -1,
                          top: -1,
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: '#FF6B35',
                        }}
                      />
                    )}
                  </View>
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', marginLeft: 2, opacity: 0.95 }}>
                    Search
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null
          ),

        })}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const focused = navigation.isFocused();
            handleTabSwitch('specials', focused);
            if (!focused) { schedulePostSwitchPrefetch(180000); }
          },
          tabLongPress: (e) => { schedulePostSwitchPrefetch(180000); },
          focus: (e) => {
            markTabNavigatorFocus('specials');
            trackTabScreenViewAfterPaint('specials');
          }
        })}
      />
    </Tabs>
  );
}
