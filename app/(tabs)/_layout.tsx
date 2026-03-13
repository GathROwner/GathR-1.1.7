// app\(tabs)\_layout.tsx

import { Tabs } from 'expo-router';
import { TouchableOpacity, View, TextInput, Text, Animated, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMapStore } from '../../store/mapStore';
import { Alert, Keyboard } from 'react-native';
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

// Custom Header Title Component with Analytics - RE-ENABLED
const HeaderTitle = ({ route }: { route: any }) => {
  const { isHeaderSearchActive, setHeaderSearchActive, searchQuery, setSearchQuery } = useMapStore();
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
  const { isHeaderSearchActive, setHeaderSearchActive, triggerScrollToTop, searchQuery } = useMapStore();
  const analytics = useAnalytics(); // RE-ENABLED
  
  const { user } = useAuth();
  const isGuest = !user;

  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
  const [sessionTabSwitches, setSessionTabSwitches] = useState(0);
  const lastTabSwitch = useRef<number>(Date.now());

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
    }, 200);
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

  // --- START OF TUTORIAL COMPONENT ---
  // This is the new, tutorial-aware button component for the Events tab.
  const TutorialAwareTabBarButton = (props: any) => {
    const { children, onPress, onLongPress } = props;
    const viewRef = useRef<View>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const [isHighlighted, setIsHighlighted] = useState(false);
  
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
      }, 200);
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
  
    return (
      <TouchableOpacity onPress={onPress} style={{ flex: 1 }}>
        <Animated.View
          ref={viewRef}
          style={[
            { flex: 1, justifyContent: 'center', alignItems: 'center' },
            isHighlighted && tutorialHighlightStyle,
          ]}
        >
          {children}
        </Animated.View>
      </TouchableOpacity>
    );
  };
  // --- END OF TUTORIAL COMPONENT ---

  // Tutorial-aware button component for the Specials tab.
  const TutorialAwareSpecialsTabBarButton = (props: any) => {
    const { children, onPress, onLongPress } = props;
    const viewRef = useRef<View>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const [isHighlighted, setIsHighlighted] = useState(false);
  
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
      }, 200);
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
  
    return (
      <TouchableOpacity onPress={onPress} onLongPress={onLongPress} style={{ flex: 1 }}>
        <Animated.View
          ref={viewRef}
          style={[
            { flex: 1, justifyContent: 'center', alignItems: 'center' },
            isHighlighted && tutorialHighlightStyle,
          ]}
        >
          {children}
        </Animated.View>
      </TouchableOpacity>
    );
  };


  const handleProfileButtonPress = () => {
    analytics.trackUserAction('profile_access', { access_method: 'header_button' });
    router.push('/profile');
  };

  const handleSearchActivation = () => {
    analytics.trackUserAction('header_search_activated', {});
    setHeaderSearchActive(true);
  };

  const handleTabSwitch = (tabName: string, isFocused: boolean) => {
    // Dismiss header search on any tab interaction
    setHeaderSearchActive(false);
    Keyboard.dismiss();
    setNavigationHistory(prev => [...prev.slice(-9), tabName]);
    setSessionTabSwitches(prev => prev + 1);
    lastTabSwitch.current = Date.now();
    
    if (isFocused && (tabName === 'events' || tabName === 'specials')) {
      triggerScrollToTop(tabName);
      if (isGuest) {
        trackTabSelect(tabName);
      }
    }
  };

  useEffect(() => {
    analytics.trackUserAction('tab_layout_initialized', {});
    setNavigationHistory(['events']);
  }, []);

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
    })}>
      <Tabs.Screen
        name="events"
        options={({ route }) => ({
          title: 'Events',
          headerTitle: () => <HeaderTitle route={route} />,
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#B0B0B0',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={24} color={color} />,
          tabBarButton: (props) => <TutorialAwareTabBarButton {...props} />, // Use the tutorial-aware button
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
            if (!focused) { useMapStore.getState().prefetchIfStale?.(180000); } // 3 min
            handleTabSwitch('events', focused);
          },
          tabLongPress: (e) => { useMapStore.getState().prefetchIfStale?.(180000); },
          focus: (e) => { analytics.trackScreenView('events', {}); }
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
        })}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const focused = navigation.isFocused();
            if (focused) {
              useMapStore.getState().triggerCloseCallout();
            } else {
              useMapStore.getState().prefetchIfStale?.(180000); // 3 min
            }
            handleTabSwitch('map', focused);
          },
          focus: (e) => { analytics.trackScreenView('map', {}); }
        })}
      />

      <Tabs.Screen
        name="specials"
        options={({ route }) => ({
          title: 'Specials',
          headerTitle: () => <HeaderTitle route={route} />,
          tabBarActiveTintColor: '#34A853',
          tabBarInactiveTintColor: '#B0B0B0',
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "restaurant" : "restaurant-outline"} size={24} color={color} />,
          tabBarButton: (props) => <TutorialAwareSpecialsTabBarButton {...props} />, // Use the tutorial-aware button
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
            if (!focused) { useMapStore.getState().prefetchIfStale?.(180000); } // 3 min
            handleTabSwitch('specials', focused);
          },
          tabLongPress: (e) => { useMapStore.getState().prefetchIfStale?.(180000); },
          focus: (e) => { analytics.trackScreenView('specials', {}); }
        })}
      />
    </Tabs>
  );
}
