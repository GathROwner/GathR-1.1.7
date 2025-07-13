import { Tabs } from 'expo-router';
import { TouchableOpacity, View, TextInput, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMapStore } from '../../store/mapStore';
import { Alert } from 'react-native';
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
    const title = route.name === 'events' ? 'Events' : 'Specials';
    return (
      <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '600' }}>
        {title}
      </Text>
    );
  }

  const placeholder = route.name === 'events' ? 'Search events...' : 'Search specials...';

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
  const { isHeaderSearchActive, setHeaderSearchActive, triggerScrollToTop } = useMapStore();
  const analytics = useAnalytics(); // RE-ENABLED
  
  // ===============================================================
  // GUEST LIMITATION SETUP FOR TAB INTERACTION TRACKING
  // ===============================================================
  const { user } = useAuth();
  const isGuest = !user;

  // Track navigation patterns
  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
  const [sessionTabSwitches, setSessionTabSwitches] = useState(0);
  const lastTabSwitch = useRef<number>(Date.now());

  // Track profile button access - RE-ENABLED
  const handleProfileButtonPress = () => {
    const profileAccessTime = Date.now();
    
    // Track profile access analytics
    analytics.trackUserAction('profile_access', {
      access_method: 'header_button',
      user_type: isGuest ? 'guest' : 'registered',
      session_tab_switches: sessionTabSwitches,
      navigation_history: navigationHistory.slice(-5).join(' -> ') // Last 5 screens
    });
    
    analytics.trackFeatureEngagement('profile_button', {
      access_time: new Date(profileAccessTime).toISOString(),
      session_engagement: sessionTabSwitches > 3 ? 'high' : 'low'
    });
    
    // Track navigation journey
    analytics.trackUserAction('navigation_to_profile', {
      from_screen: navigationHistory[navigationHistory.length - 1] || 'unknown',
      navigation_depth: navigationHistory.length,
      time_since_last_tab_switch: profileAccessTime - lastTabSwitch.current
    });
    
    router.push('/profile');
  };

  // Track search activation from header - RE-ENABLED
  const handleSearchActivation = () => {
    const currentScreen = navigationHistory[navigationHistory.length - 1] || 'unknown';
    
    // Track search activation analytics
    analytics.trackUserAction('header_search_activated', {
      screen: currentScreen,
      activation_method: 'header_search_button',
      user_type: isGuest ? 'guest' : 'registered',
      session_tab_switches: sessionTabSwitches
    });
    
    analytics.trackFeatureEngagement('header_search_activation', {
      screen: currentScreen,
      session_activity: sessionTabSwitches > 2 ? 'active' : 'passive'
    });
    
    setHeaderSearchActive(true);
  };

  // Enhanced tab switch tracking
  const handleTabSwitch = (tabName: string, isFocused: boolean) => {
    const switchTime = Date.now();
    const timeSinceLastSwitch = switchTime - lastTabSwitch.current;
    
    // Update navigation tracking
    setNavigationHistory(prev => [...prev.slice(-9), tabName]); // Keep last 10
    setSessionTabSwitches(prev => prev + 1);
    lastTabSwitch.current = switchTime;
    
    if (isFocused) {
      // Track tab re-selection (double tap)
      analytics?.trackUserAction('tab_reselection', {
        tab: tabName,
        user_type: isGuest ? 'guest' : 'registered',
        time_since_last_switch: timeSinceLastSwitch,
        session_tab_switches: sessionTabSwitches,
        triggered_scroll_to_top: true
      });
      
      analytics?.trackFeatureEngagement('tab_double_tap', {
        tab: tabName,
        session_activity: sessionTabSwitches > 3 ? 'high' : 'low'
      });
      
      // Trigger scroll to top (only for scrollable tabs)
      if (tabName === 'events' || tabName === 'specials') {
        triggerScrollToTop(tabName);
        
        // FOR GUESTS ONLY: Track this as a tab selection interaction
        if (isGuest && (tabName === 'events' || tabName === 'specials')) {
          console.log(`[GuestLimitation] Tracking ${tabName} tab re-selection for guest`);
          trackTabSelect(tabName);
        }
      }
    } else {
      // Track regular tab switch
      const previousTab = navigationHistory[navigationHistory.length - 1];
      
      analytics?.trackUserAction('tab_switch', {
        from_tab: previousTab || 'unknown',
        to_tab: tabName,
        user_type: isGuest ? 'guest' : 'registered',
        time_since_last_switch: timeSinceLastSwitch,
        session_tab_switches: sessionTabSwitches,
        switch_speed: timeSinceLastSwitch < 2000 ? 'fast' : 'normal'
      });
      
      // Track user journey patterns
      analytics?.trackUserAction('navigation_pattern', {
        current_tab: tabName,
        previous_tab: previousTab,
        navigation_sequence: navigationHistory.slice(-3).join(' -> '),
        session_depth: navigationHistory.length,
        user_engagement: sessionTabSwitches > 5 ? 'high' : sessionTabSwitches > 2 ? 'medium' : 'low'
      });
      
      // Track content type switching patterns
      if ((previousTab === 'events' && tabName === 'specials') || 
          (previousTab === 'specials' && tabName === 'events')) {
        analytics?.trackUserAction('content_type_switch', {
          from_content: previousTab,
          to_content: tabName,
          switch_frequency: sessionTabSwitches,
          comparative_browsing: true
        });
      }
    }
  };

  // Track session navigation patterns on app start - RE-ENABLED
  useEffect(() => {
    analytics.trackUserAction('tab_layout_initialized', {
      user_type: isGuest ? 'guest' : 'registered',
      initialization_time: new Date().toISOString()
    });
    
    // Set initial screen
    setNavigationHistory(['events']); // Default start screen
  }, []); // Keep dependency array empty - this was already correct

  return (
    <Tabs screenOptions={({ route }) => ({
      headerRight: () => (
        !isHeaderSearchActive ? (
          <TouchableOpacity 
            onPress={handleProfileButtonPress} 
            style={{ marginRight: 16 }}
            testID="profile-button"
          >
            <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ) : null
      ),
      headerStyle: {
        backgroundColor: '#1E90FF',
      },
      headerTintColor: '#FFFFFF',
    })}>
      <Tabs.Screen
        name="events"
        options={({ route }) => ({
          title: 'Events',
          headerTitle: () => <HeaderTitle route={route} />,
          tabBarIcon: ({ color }) => <Ionicons name="calendar" size={24} color={color} />,
          headerLeft: () => (
            !isHeaderSearchActive ? (
              <TouchableOpacity 
                onPress={handleSearchActivation} 
                style={{ marginLeft: 16 }}
              >
                <Ionicons name="search" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null
          ),
        })}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const isFocused = navigation.isFocused();
            
            if (isFocused) {
              console.log('[TabNavigation] Events tab pressed while focused - triggering scroll to top');
              handleTabSwitch('events', true);
            } else {
              // Track regular navigation to events tab
              handleTabSwitch('events', false);
            }
          },
          focus: (e) => {
            // Track screen focus for analytics
            analytics.trackScreenView('events', {
              navigation_method: 'tab_press',
              user_type: isGuest ? 'guest' : 'registered',
              session_tab_switches: sessionTabSwitches
            });
          }
        })}
      />
      
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => <Ionicons name="map" size={24} color={color} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const isFocused = navigation.isFocused();
            handleTabSwitch('map', isFocused);
          },
          focus: (e) => {
            // Track map screen focus
            analytics.trackScreenView('map', {
              navigation_method: 'tab_press',
              user_type: isGuest ? 'guest' : 'registered',
              session_tab_switches: sessionTabSwitches
            });
            
            // Track map-specific engagement
            analytics.trackMapInteraction('screen_focus', {
              access_method: 'tab_navigation',
              session_activity: sessionTabSwitches > 2 ? 'active' : 'new'
            });
          }
        })}
      />

      <Tabs.Screen
        name="specials"
        options={({ route }) => ({
          title: 'Specials',
          headerTitle: () => <HeaderTitle route={route} />,
          tabBarIcon: ({ color }) => <Ionicons name="restaurant" size={24} color={color} />,
          headerLeft: () => (
            !isHeaderSearchActive ? (
              <TouchableOpacity 
                onPress={handleSearchActivation} 
                style={{ marginLeft: 16 }}
              >
                <Ionicons name="search" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null
          ),
        })}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            const isFocused = navigation.isFocused();
            
            if (isFocused) {
              console.log('[TabNavigation] Specials tab pressed while focused - triggering scroll to top');
              handleTabSwitch('specials', true);
            } else {
              // Track regular navigation to specials tab
              handleTabSwitch('specials', false);
            }
          },
          focus: (e) => {
            // Track screen focus for analytics
            analytics.trackScreenView('specials', {
              navigation_method: 'tab_press',
              user_type: isGuest ? 'guest' : 'registered',
              session_tab_switches: sessionTabSwitches
            });
          }
        })}
      />
    </Tabs>
  );
}