// ===============================================================
// UPDATED app/_layout.tsx WITH TUTORIAL INTEGRATION
// ===============================================================

/**
 * Android gesture root wrapper (react-native-gesture-handler)
 *
 * WHY:
 *   GH components (e.g., GH ScrollView) require being descendants of GestureHandlerRootView.
 *   Without it, Android throws: "NativeViewGestureHandler must be used as a descendant of GestureHandlerRootView"
 *   and gestures (like our callout ScrollView) wonâ€™t recognize.
 *
 * WHAT:
 *   - Wrap entire app in <GestureHandlerRootView style={{ flex: 1 }} />.
 *   - Keep SafeArea/Navigation/Auth under it. No behavior change on iOS.
 *
 * EFFECT:
 *   Enables native gesture recognition for the calloutâ€™s GH ScrollView on Android.
 */

import React from 'react';
import MapboxGL from '@rnmapbox/maps';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { useGuestLimitationStore } from '../store/guestLimitationStore';

import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert, Platform, InteractionManager } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
// ðŸŽ¯ TUTORIAL INTEGRATION: Import TutorialManager
import { TutorialManager } from '../components/tutorial/TutorialManager';
// â›‘ï¸ Required for react-native-gesture-handler components (e.g., GH ScrollView)
// Without this, Android throws: "NativeViewGestureHandler must be used as a descendant of GestureHandlerRootView"
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider, focusManager, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { amplitudeInit, amplitudeTrack, amplitudeSetUserId, amplitudeSetUserProps } from '../lib/amplitudeAnalytics';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { installNotificationDebugListeners } from '../services/notificationService';
import { useDeepLinking } from '../hooks/useDeepLinking';


  // ðŸš€ PERFORMANCE: Preload data on app start
  import { EVENTS_MINIMAL } from '../lib/queryKeys';
  import { fetchMinimalEvents } from '../lib/api/events';
  import { useMapStore } from '../store';
  // 📢 PERFORMANCE: Preload ad pool on app start
  import { useAdPoolStore } from '../store/adPoolStore';
  // 📢 AdMob SDK initialization (moved from index.tsx to ensure it runs regardless of auth state)
  import mobileAds, { MaxAdContentRating } from 'react-native-google-mobile-ads';
  import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';


/**
 * Minimal events fetcher for React Query prefetch (same shape the store expects).
 */
const rqFetchEventsMinimal = async () => {
  return fetchMinimalEvents();
};

// Persist React Query cache across app restarts (AsyncStorage)
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'rq-gathr-cache-v2',
  throttleTime: 1000,
  serialize: JSON.stringify,
  deserialize: JSON.parse,
});

// â±ï¸ Live refresh cadence (adjust as desired; backend updates a few times/day)
const LIVE_REFRESH_MS = 10 * 60 * 1000; // 10 minutes
const ADMOB_STARTUP_DELAY_MS = Platform.OS === 'android' ? 45000 : 2000;


// Prevent auto-hiding splash screen
SplashScreen.preventAutoHideAsync();SplashScreen.preventAutoHideAsync();

// --- Amplitude Analytics (namespaced wrapper) ---
const AMPLITUDE_API_KEY =
  process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY ?? 'addfc98886ff152e90543da941adc3ef';



/** Warm Mapbox style/tiles invisibly on app start (1Ã—1, auto-unmount in 3s) */
function StylePreloader() {
  const [mounted, setMounted] = React.useState(true);
  React.useEffect(() => {
    const id = setTimeout(() => setMounted(false), 6000);
    return () => clearTimeout(id);
  }, []);
  if (!mounted) return null;
  return (
    <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}>
      <MapboxGL.MapView
        style={{ flex: 1 }}
        styleURL={MapboxGL.StyleURL.Street}
        onDidFinishLoadingMap={() => console.log('[MapLoad][preloader] style_loaded')}
onDidFinishRenderingMapFully={() => {
  console.log('[MapLoad][preloader] warmed');
}}
onDidFinishLoadingStyle={() => {
  console.log('[MapLoad][preloader] style_loaded');
}}

      >
        <MapboxGL.Camera zoomLevel={12} centerCoordinate={[-63.128, 46.238]} />
      </MapboxGL.MapView>
    </View>
  );
}

export default function RootLayout() {
  // --- React Query (TanStack) setup ---
  const queryClient = React.useMemo(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 3,   // default 3 min
          gcTime:   1000 * 60 * 10,   // keep cached results up to 10 min
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
          retry: 1,
        },
      },
    });
    // Expose so non-React modules (Zustand store) can use the same client
    (global as any).__RQ_CLIENT = qc;
    return qc;
  }, []);

  // Notifications: handler + permissions + Android channel
React.useEffect(() => {
  // Foreground behavior
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    try {
      const data: any = n?.request?.content?.data ?? {};
      const scheduledFor = Number(data?.scheduledFor || 0);
      const now = Date.now();

      // If OS delivers *before* intended time, suppress the banner.
      if (scheduledFor && now + 1000 < scheduledFor) {
        console.log('[notifications] handler suppressing early banner', {
          kind: data?.kind,
          scheduledFor: new Date(scheduledFor).toString(),
          now: new Date(now).toString(),
        });
        return {
          shouldShowAlert: false,
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }
    } catch {}

    // Normal path (on-time or no scheduledFor info)
    return {
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});


  // iOS: request once on cold start (no-op if already granted)
  (async () => {
    if (Device.isDevice) {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        await Notifications.requestPermissionsAsync();
      }
    }

    // Set up notification category with Yes/No actions
    try {
      await Notifications.setNotificationCategoryAsync('post_event_attendance', [
        {
          identifier: 'yes',
          buttonTitle: '✓ Yes, I went',
          options: {
            opensAppToForeground: false,
          },
        },
        {
          identifier: 'no',
          buttonTitle: '✗ No, I didn\'t',
          options: {
            opensAppToForeground: false,
          },
        },
      ]);
      console.log('[notifications] Post-event attendance category registered');
    } catch (e) {
      console.warn('[notifications] Failed to register attendance category', e);
    }
  })();

  // Android: ensure channel exists
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('gathr-reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  // 🔧 Install debug/guard listeners (once)
  try { installNotificationDebugListeners(); } catch (e) {
    console.warn('[notifications] unable to install debug listeners', e);
  }
}, []);


// Notifications – dismiss tapped notifications and clear badge
React.useEffect(() => {
  // When the user taps a delivered notification:
  const respSub = Notifications.addNotificationResponseReceivedListener((response) => {
    try {
      const id = response?.notification?.request?.identifier;
      const data: any = response?.notification?.request?.content?.data;
      const kind = data?.kind;
      const eventId = data?.eventId;
      const actionIdentifier = response?.actionIdentifier;

      // Handle post-event attendance responses
      if (kind === 'post_event_survey' && eventId) {
        // Check if user used action buttons (Yes/No) or tapped notification body
        if (actionIdentifier === 'yes') {
          // Power user: used action button
          console.log('[notifications] User attended event (action button)', { eventId: String(eventId) });
          try { 
            amplitudeTrack('post_event_attendance_response', { 
              event_id: String(eventId),
              attended: true,
              response_method: 'notification_action_button'
            }); 
          } catch {}
          // TODO: Send to backend
          // await fetch('YOUR_API/attendance', { 
          //   method: 'POST', 
          //   body: JSON.stringify({ eventId, attended: true, method: 'action_button' })
          // });
        } else if (actionIdentifier === 'no') {
          // Power user: used action button
          console.log('[notifications] User did not attend event (action button)', { eventId: String(eventId) });
          try { 
            amplitudeTrack('post_event_attendance_response', { 
              event_id: String(eventId),
              attended: false,
              response_method: 'notification_action_button'
            }); 
          } catch {}
          // TODO: Send to backend
          // await fetch('YOUR_API/attendance', { 
          //   method: 'POST', 
          //   body: JSON.stringify({ eventId, attended: false, method: 'action_button' })
          // });
        } else {
          // User tapped notification body (didn't use buttons) - navigate to survey
          console.log('[notifications] Opening attendance survey screen', { eventId: String(eventId) });
          try { 
            amplitudeTrack('attendance_survey_opened', { 
              event_id: String(eventId),
              source: 'notification_tap'
            }); 
          } catch {}
          
          // Navigate to attendance survey screen
          const globalRouter = (global as any).router;
          if (globalRouter) {
            globalRouter.push({
              pathname: '/attendance-survey',
              params: { eventId: String(eventId) }
            });
          }
        }
      }

      if (id) {
        // Dismiss just the notification that was tapped
        Notifications.dismissNotificationAsync(id);
      }
      // Also clear the app badge count (iOS number / some Android launchers)
      Notifications.setBadgeCountAsync(0);
    } catch (e) {
      console.warn('[notifications] response handler error', e);
    }
  });

  return () => {
    try { respSub.remove(); } catch {}
  };
}, []);

// Notifications — when app returns to foreground, clear any delivered notifications and reset badge
React.useEffect(() => {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      try {
        Notifications.dismissAllNotificationsAsync();
        Notifications.setBadgeCountAsync(0);
      } catch (e) {
        console.warn('[notifications] foreground cleanup error', e);
      }
    }
  });
  return () => {
    try { sub.remove(); } catch {}
  };
}, []);

// Bridge AppState -> focusManager so returning to foreground triggers background refresh
  const lastAppState = useRef<string | null>(AppState.currentState ?? null);
  const appActivatedAtRef = useRef<number>(Date.now()); // Track when app became active

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      // Keep React Query focus in sync
      focusManager.setFocused(status === 'active');

      // Dedupe & log only meaningful transitions
      const prev = lastAppState.current;
      console.log('[AppState] Change detected:', { prev, status });
      
      if (prev !== status) {
        if (status === 'active') {
          console.log('[AppState] App came to foreground');
          amplitudeTrack('app_foreground');
          // Update timestamp when app comes to foreground
          appActivatedAtRef.current = Date.now();
        } else if (status === 'background') {
          // Calculate duration app was in foreground
          const now = Date.now();
          const durationMs = now - appActivatedAtRef.current;
          const durationSeconds = Math.round(durationMs / 1000);
          
          console.log('[AppState] App going to background, duration:', {
            durationMs,
            durationSeconds,
            activatedAt: appActivatedAtRef.current,
            now
          });
          
          const eventProps = {
            app_active_for_seconds: durationSeconds,
            app_active_for_ms: durationMs,
          };
          
          console.log('[AppState] About to track app_background with props:', eventProps);
          amplitudeTrack('app_background', eventProps);
          
          // Try to flush events immediately before app fully suspends
          try {
            const amplitude = require('../lib/amplitudeAnalytics');
            if (amplitude.amplitudeFlush) {
              amplitude.amplitudeFlush();
              console.log('[AppState] Flushed Amplitude queue');
            }
          } catch (e) {
            console.log('[AppState] Could not flush:', e);
          }
        }
      }
      lastAppState.current = status;
    });

    return () => sub.remove();
  }, []);

  // Initialize Amplitude once on mount and send a single app_open
  useEffect(() => {
    try {
      if (!AMPLITUDE_API_KEY && __DEV__) {
        console.warn('[amplitude] Missing EXPO_PUBLIC_AMPLITUDE_API_KEY; using placeholder.');
      }
      amplitudeInit(AMPLITUDE_API_KEY);
// Once per launch: set stable user props for release slicing (no native deps)
try {
  let app_version = 'unknown';
  let build_number = 'unknown';

  // Try expo-constants (pure JS)
  try {
    // @ts-ignore dynamic require to avoid bundling when absent
    const Constants = require('expo-constants').default;
    if (Constants?.expoConfig) {
      app_version = Constants.expoConfig.version ?? app_version;
      const iosBuild = Constants.expoConfig.ios?.buildNumber;
      const androidCode = Constants.expoConfig.android?.versionCode;
      build_number = (iosBuild ?? (androidCode != null ? String(androidCode) : undefined)) ?? build_number;
    } else if (Constants?.manifest?.version) {
      // Legacy manifest fallback
      app_version = Constants.manifest.version ?? app_version;
    }
  } catch {}

  amplitudeSetUserProps({
    app_version,
    build_number,
    env: __DEV__ ? 'development' : 'production',
  });
} catch {}



      amplitudeTrack('app_open', { source: 'root_layout_mount' });
    } catch (err) {
      console.error('[amplitude] init failed', err);
    }
  }, []);

// (moved: screen_view tracking lives inside MainNavigator where auth is available)

  return (
    
    // â›‘ï¸ Root wrapper so GH gestures (ScrollView, handlers) work on Android.
    //This fixes callout ScrollView not scrolling and the GH error about GestureHandlerRootView.
    <GestureHandlerRootView style={{ flex: 1 }}> 
        {/* TEMP: disable secondary MapView to restore Android gestures */}
          {/* <StylePreloader /> */}
      <PersistQueryClientProvider
  client={queryClient}
  persistOptions={{
    persister: asyncStoragePersister,
    // Auto-expire persisted data after 12 hours (tweak as you like)
    maxAge: 1000 * 60 * 60 * 12,
  }}
>
        <AuthProvider>
           <MainNavigator />
        </AuthProvider>
      </PersistQueryClientProvider>

    </GestureHandlerRootView>
  );
}

  function MainNavigator() {
    const { user, isLoading } = useAuth();
  // Remember the last UID so we only log real auth state changes (not nav changes)
  const lastUidRef = useRef<string | null>(null);
    const segments = useSegments();
    const router = useRouter();

    // Deep linking handler - handles incoming URLs to open specific events
    useDeepLinking();

    // --- screen_view on route change (inside auth context) ---
    const pathname = usePathname();
    const prevPathRef = useRef<string | null>(null);
    const prevUidRef = useRef<string | null>(null); // track last signed-in uid
    const screenActivatedAtRef = useRef<number>(Date.now()); // Track when current screen became active
    const profileNotifyAtRef = useRef(0); // dedupe profile modal notifications (<300ms)


// Prevent duplicate replace() to the same target (fixes "login slides in twice")
const navTargetRef = useRef<string | null>(null);
const safeReplace = (target: string) => {
  // if we're already on the target, or we already scheduled it, do nothing
  if (pathname === target || navTargetRef.current === target) return;
  navTargetRef.current = target;
  router.replace(target);
};
    
    useEffect(() => {
      const screen = pathname || '/';
      const first = prevPathRef.current === null;
      const referrer = first ? '(none)' : (prevPathRef.current as string);

      // Calculate duration on previous screen (skip for first screen)
      let screenDurationMs = 0;
      let screenDurationSeconds = 0;
      if (!first) {
        const now = Date.now();
        screenDurationMs = now - screenActivatedAtRef.current;
        screenDurationSeconds = Math.round(screenDurationMs / 1000);
      }

      amplitudeTrack('screen_view', {
        screen,
        referrer_screen: referrer,
        source: first ? 'cold_start' : 'navigation',
        is_authenticated: !!user,
        ...(first ? {} : {
          previous_screen_active_for_seconds: screenDurationSeconds,
          previous_screen_active_for_ms: screenDurationMs,
        }),
      });

      // Update timestamp for the new screen
      screenActivatedAtRef.current = Date.now();
      prevPathRef.current = screen;
    }, [pathname, user]);

    // If the Profile modal becomes the active route, notify the tutorial manager
useEffect(() => {
  if (pathname === '/profile') {
    const now = Date.now();
    if (now - (profileNotifyAtRef.current || 0) > 300) {
      profileNotifyAtRef.current = now;
      (global as any).onProfileScreenNavigated?.(); // fires tutorial_click_profile_tab + step_completed
    }
  }
}, [pathname]);


// --- amplitude user binding + one-time signup_completed + auto login ---
useEffect(() => {
  const prevUid = prevUidRef.current;
  const raw = (user as any);
  const uid = raw && (raw.uid ?? raw.id) ? String(raw.uid ?? raw.id) : null;

  if (uid) {
    // Attach stable user id
    amplitudeSetUserId(uid);

    const provider =
      raw?.providerData?.[0]?.providerId?.replace('.com', '') || 'unknown';

    // Fire signup_completed exactly once per uid (Firebase-first-login heuristic)
    const key = `ampl_signup_tracked_${uid}`;
    (async () => {
      try {
        const already = await AsyncStorage.getItem(key);
        const created = raw?.metadata?.creationTime;
        const lastSignIn = raw?.metadata?.lastSignInTime;
        const isFirstLogin = created && lastSignIn && created === lastSignIn;

        if (!already && isFirstLogin) {
          amplitudeTrack('signup_completed', { provider });
          await AsyncStorage.setItem(key, '1');
} else if (prevUid !== uid) {
  // Not first login; we just transitioned into an authenticated state
  const intentKey = 'ampl_login_intent';
  const intent = (await AsyncStorage.getItem(intentKey)) || 'auto';
  amplitudeTrack('login', { provider, method: intent });
  await AsyncStorage.removeItem(intentKey);
}

      } catch {
        // analytics must never break UX
      }
    })();
  } else {
    // Logged out
    amplitudeSetUserId(undefined);
  }

  prevUidRef.current = uid;
}, [user]);


    // ðŸš€ PERFORMANCE: Start preloading with React Query as soon as the app starts
    const queryClient = useQueryClient();
    const { setAllEvents } = useMapStore();

    // 📢 AdMob SDK initialization (moved from index.tsx to ensure it runs regardless of auth state)
    // This must run before ad preloading can work
    useEffect(() => {
      const initAdMob = async () => {
        try {
          console.log('📢 Initializing AdMob SDK...');

          // Request tracking permission on iOS (required for personalized ads)
          if (Platform.OS === 'ios') {
            const { status } = await requestTrackingPermissionsAsync();
            console.log('Tracking permission status:', status);
          }

          // Configure AdMob with safer defaults
          await mobileAds().setRequestConfiguration({
            maxAdContentRating: MaxAdContentRating.G,
          });

          console.log('Starting AdMob initialization...');
          const initResult = await mobileAds().initialize();
          console.log('AdMob SDK initialized successfully', initResult);

          // Ensure audio is enabled
          mobileAds().setAppMuted(false);
          mobileAds().setAppVolume(1.0);

          // Now preload ads after SDK is ready
          console.log('📢 Preloading ad pool after SDK init...');
          useAdPoolStore.getState().preloadAds();

        } catch (error) {
          console.error('Error initializing AdMob:', error);
        }
      };

      // Keep Android map/hotspot startup clear of WebView/ad-pool work. The
      // tablet trace showed AdMob/Chromium startup competing in the same window.
      let interactionTask: { cancel?: () => void } | null = null;
      const timer = setTimeout(() => {
        interactionTask = InteractionManager.runAfterInteractions(() => {
          initAdMob();
        });
      }, ADMOB_STARTUP_DELAY_MS);
      return () => {
        clearTimeout(timer);
        interactionTask?.cancel?.();
      };
    }, []);

    useEffect(() => {
      console.log('ðŸš€ Preloading event data on app start (React Query)â€¦');

      const key = ['events-minimal'] as const;

      // â³ Give PersistQueryClientProvider a moment to rehydrate from AsyncStorage
      const timer = setTimeout(() => {
        // 1) If persisted cache is already present, hydrate immediately from last run
        const persisted: any = queryClient.getQueryData(key);
        const persistedItems = Array.isArray(persisted?.combinedData) ? persisted.combinedData : [];
        const persistedEvents   = persistedItems.filter((x: any) => x?.type === 'event');
        const persistedSpecials = persistedItems.filter((x: any) => x?.type === 'special');

        if (persistedItems.length > 0) {
          console.log(
            '[RQ Persist] Restored', persistedItems.length, 'items from last run (persisted cache)',
            '| events =', persistedEvents.length, '| specials =', persistedSpecials.length
          );
          setAllEvents(persistedItems);

// DEBUG: summarize address/coords presence in preloaded (persisted) items
try {
  const addrCount = persistedItems.filter((e:any) => e?.address && e.address !== 'N/A').length;
  const coordCount = persistedItems.filter((e:any) => e?.latitude != null && e?.longitude != null).length;
  console.log('[AddressFlow][PersistHydrate]', {
    total: persistedItems.length,
    withAddress: addrCount,
    withCoords: coordCount,
  });
  const sample = persistedItems.find((e:any) => e?.address);
  if (sample) console.log('[AddressFlow][PersistHydrate] sampleWithAddress', { id: sample.id, venue: sample.venue, address: sample.address });
} catch {}


          // Optional: hydrate a dedicated specials slice if your store exposes it
          const store = (useMapStore as any)?.getState?.();
          if (store && typeof store.setSpecials === 'function') {
            store.setSpecials(persistedSpecials);
          }
        }

        // 2) Now fetch (respects staleTime) and report whether it was a network refresh or cache hit
        const before = queryClient.getQueryState(key);
        const beforeUpdatedAt = before?.dataUpdatedAt ?? 0;
        const t0 = Date.now();

        queryClient
          .fetchQuery({
            queryKey: key,
            queryFn: rqFetchEventsMinimal,
            staleTime: 1000 * 60 * 3,
            gcTime: 1000 * 60 * 10,
          })
        .then((result: any) => {
          const after = queryClient.getQueryState(key);
          const afterUpdatedAt = after?.dataUpdatedAt ?? 0;
          const fromNetwork = afterUpdatedAt > beforeUpdatedAt;

          const items = Array.isArray(result?.combinedData) ? result.combinedData : [];
          const eventsOnly   = items.filter((x: any) => x?.type === 'event');
          const specialsOnly = items.filter((x: any) => x?.type === 'special');

          if (fromNetwork) {
            console.log(
              '[RQ Prefetch] Fetched fresh data from server in', Date.now() - t0, 'ms',
              '| items =', items.length, '| events =', eventsOnly.length, '| specials =', specialsOnly.length
            );
          } else {
            console.log(
              '[RQ Prefetch] Used fresh cache (no network)',
              '| items =', items.length, '| events =', eventsOnly.length, '| specials =', specialsOnly.length
            );
          }

          if (items.length > 0) {
            setAllEvents(items);

// DEBUG: summarize address/coords presence in fresh network items
try {
  const addrCount = items.filter((e:any) => e?.address && e.address !== 'N/A').length;
  const coordCount = items.filter((e:any) => e?.latitude != null && e?.longitude != null).length;
  console.log('[AddressFlow][NetworkFetch]', {
    total: items.length,
    withAddress: addrCount,
    withCoords: coordCount,
  });
  const sample = items.find((e:any) => e?.address);
  if (sample) console.log('[AddressFlow][NetworkFetch] sampleWithAddress', { id: sample.id, venue: sample.venue, address: sample.address });
} catch {}
            const store = (useMapStore as any)?.getState?.();
            if (store && typeof store.setSpecials === 'function') {
              store.setSpecials(specialsOnly);
            }
          }
        })

          .catch((error) => {
            console.error('Prefetch failed:', error);
          });
      }, 180);

      return () => clearTimeout(timer);
    }, []);

    // ðŸ”„ Foreground refresh: when app becomes active, reconcile with server and report cache vs network
    useEffect(() => {
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') {
          const key = ['events-minimal'] as const;
          const before = queryClient.getQueryState(key);
          const beforeUpdatedAt = before?.dataUpdatedAt ?? 0;
          const t0 = Date.now();

          queryClient
            .fetchQuery({
              queryKey: key,
              queryFn: rqFetchEventsMinimal,
              staleTime: 1000 * 60 * 3,
              gcTime: 1000 * 60 * 10,
            })
            .then((result: any) => {
              const after = queryClient.getQueryState(key);
              const afterUpdatedAt = after?.dataUpdatedAt ?? 0;
              const fromNetwork = afterUpdatedAt > beforeUpdatedAt;

              const items = Array.isArray(result?.combinedData) ? result?.combinedData : [];
              const eventsOnly   = items.filter((x: any) => x?.type === 'event');
              const specialsOnly = items.filter((x: any) => x?.type === 'special');

              if (fromNetwork) {
                console.log(
                  '[RQ Foreground] Fetched fresh data from server in', Date.now() - t0, 'ms',
                  '| items =', items.length, '| events =', eventsOnly.length, '| specials =', specialsOnly.length
                );
              } else {
                console.log(
                  '[RQ Foreground] Used fresh cache (no network)',
                  '| items =', items.length, '| events =', eventsOnly.length, '| specials =', specialsOnly.length
                );
              }

              if (items.length > 0) {
                setAllEvents(items);
                const store = (useMapStore as any)?.getState?.();
                if (store && typeof store.setSpecials === 'function') {
                  store.setSpecials(specialsOnly);
                }
              }
            })
            .catch((error) => {
              console.error('[RQ Foreground] Refetch failed:', error);
            });
        }
      });
      return () => sub.remove();
    }, []);

// ðŸ”„ Live refresh while app is active: periodically reconcile with server
useEffect(() => {
  let interval: any;

  const start = () => {
    if (interval) return;
    interval = setInterval(() => {
      const key = ['events-minimal'] as const;
      const before = queryClient.getQueryState(key);
      const beforeUpdatedAt = before?.dataUpdatedAt ?? 0;
      const t0 = Date.now();

      queryClient
        .fetchQuery({
          queryKey: key,
          queryFn: rqFetchEventsMinimal,
          staleTime: 0,              // force a network check each tick
          gcTime: 1000 * 60 * 10,
        })
        .then((result: any) => {
          const after = queryClient.getQueryState(key);
          const afterUpdatedAt = after?.dataUpdatedAt ?? 0;
          const fromNetwork = afterUpdatedAt > beforeUpdatedAt;

          const items = Array.isArray(result?.combinedData) ? result.combinedData : [];
          const eventsOnly   = items.filter((x: any) => x?.type === 'event');
          const specialsOnly = items.filter((x: any) => x?.type === 'special');

          if (fromNetwork) {
            console.log(
              '[RQ Live] Server update detected in', Date.now() - t0, 'ms',
              '| items =', items.length, '| events =', eventsOnly.length, '| specials =', specialsOnly.length
            );
          } else {
            console.log('[RQ Live] No change (cache up to date)');
          }

          if (items.length > 0) {
            setAllEvents(items);
            const store = (useMapStore as any)?.getState?.();
            if (store && typeof store.setSpecials === 'function') {
              store.setSpecials(specialsOnly);
            }
          }
        })
        .catch((err) => console.error('[RQ Live] Refresh failed:', err));
    }, LIVE_REFRESH_MS);
  };

  const stop = () => {
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
  };

  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') start();
    else stop();
  });

  // Start immediately if already active
  if (AppState.currentState === 'active') start();

  return () => {
    sub.remove();
    stop();
  };
}, []);

  // (Removed duplicate auth redirect effect)

  useEffect(() => {
    // Don't do anything while loading
    if (isLoading) return;

    // Hide splash screen when auth state is determined
    SplashScreen.hideAsync();

    const inTabsGroup = segments[0] === '(tabs)';
    // segments is [] (empty) when on root login screen, not ['index']
    const onLoginScreen = !segments[0] || segments[0] === 'index';
    const onInterestSelection = segments[0] === 'interest-selection';
    const inAuthFlow = onLoginScreen || onInterestSelection;
    const inProfileScreen = segments[0] === 'profile';

    // Only log when the actual UID changes (avoid 're-login' noise on tab/nav changes)
    const currUid = user?.uid ?? null;
    if (lastUidRef.current !== currUid) {
      console.log('Auth state changed:', user ? 'logged in' : 'logged out');
      lastUidRef.current = currUid;
    }
    // Optional: keep a non-misleading navigation log
    console.log('Nav check â€” segments:', segments);


  if (user) {
    // User is authenticated - redirect to main app if on login screen
    // (but allow interest-selection to complete for new signups)
    if (onLoginScreen) {
      console.log('Redirecting authenticated user from login to main app');
      safeReplace('/(tabs)/map');
    } else if (!inTabsGroup && !inProfileScreen && !inAuthFlow) {
      // Redirect from other non-app screens
      console.log('Redirecting authenticated user to main app');
      safeReplace('/(tabs)/map');
    }
  } else {
    // User is not authenticated (guest mode allowed inside (tabs))
    if (!inAuthFlow && !inTabsGroup && !inProfileScreen) {
      // Redirect to login only if we're not already on it
      console.log('Redirecting unauthenticated user to login');
      safeReplace('/');
    }
  }

  }, [user, segments, isLoading]);

// âœ… Reset guest interaction counter when returning from login (Continue as Guest)
useEffect(() => {
  // Only when unauthenticated users move from login ("/") into tabs
  const cameFromLogin = prevPathRef.current === '/' || prevPathRef.current === '/index';
  const nowInTabs = segments[0] === '(tabs)';

  if (!isLoading && !user && cameFromLogin && nowInTabs) {
    try {
      // Pull actions without subscribing the component
      const api = (useGuestLimitationStore as any).getState?.();
      api?.resetInteractionCount?.();
      api?.startNewSession?.();
      console.log('[GuestLimitation] Reset after Continue as Guest: interactionCount=0, new session started');
    } catch (e) {
      console.warn('[GuestLimitation] Reset on guest re-entry failed:', e);
    }
  }
}, [pathname, segments, user, isLoading]);

  // Expose router and Alert globally for tutorial completion
  useEffect(() => {
    (global as any).router = router;
    (global as any).Alert = Alert;
    
    return () => {
      delete (global as any).router;
      delete (global as any).Alert;
    };
  }, [router]);

  // Show loading screen while Firebase determines auth state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  // ðŸŽ¯ TUTORIAL INTEGRATION: Wrap the entire Stack with TutorialManager
  // This enables the tutorial to display over all screens in the app
  return (
    <TutorialManager>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="interest-selection" options={{ 
          title: 'Select Interests',
          headerShown: true,
          headerBackTitle: 'Back'
        }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile" options={{ 
          title: 'Profile',
          headerShown: true,
          headerBackTitle: 'Back',
          presentation: 'modal'
        }} />
        <Stack.Screen name="attendance-survey" options={{ 
          presentation: 'modal',
          animation: 'slide_from_bottom',
          headerShown: false
        }} />
      </Stack>
    </TutorialManager>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#4A90E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

/**
 * ðŸŽ¯ TUTORIAL INTEGRATION NOTES:
 * 
 * 1. TutorialManager Placement:
 *    - Wraps the entire Stack to display over all screens
 *    - Positioned after loading check but before screen rendering
 *    - Has access to navigation context for cross-screen coordination
 * 
 * 2. Global Tutorial Functions Available:
 *    - triggerGathRTutorial() - Manual trigger from any screen
 *    - autoTriggerGathRTutorial() - Auto-trigger for new users
 * 
 * 3. Integration Points:
 *    - Tutorial can display over: (tabs)/map, (tabs)/events, (tabs)/specials, profile
 *    - Tutorial state persists across navigation
 *    - Tutorial respects authentication state changes
 * 
 * 4. Next Integration Steps:
 *    - Add auto-trigger to interest-selection.tsx completion
 *    - Add tutorial targets (CSS classes) to components
 *    - Add restart option to profile.tsx
 * 
 * 5. No Breaking Changes:
 *    - All existing navigation logic preserved
 *    - No changes to AuthProvider or loading behavior
 *    - Tutorial is an overlay that doesn't interfere with app flow
 */
