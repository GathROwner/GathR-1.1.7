// ===============================================================
// UPDATED app/_layout.tsx WITH TUTORIAL INTEGRATION
// ===============================================================

import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
// 🎯 TUTORIAL INTEGRATION: Import TutorialManager
import { TutorialManager } from '../components/tutorial/TutorialManager';


// Prevent auto-hiding splash screen
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <MainNavigator />
    </AuthProvider>
  );
}

function MainNavigator() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Don't do anything while loading
    if (isLoading) return;

    // Hide splash screen when auth state is determined
    SplashScreen.hideAsync();

    const inTabsGroup = segments[0] === '(tabs)';
    const inAuthFlow = segments[0] === 'index' || segments[0] === 'interest-selection';
    const inProfileScreen = segments[0] === 'profile';

    console.log('Auth state changed:', user ? 'logged in' : 'logged out');
    console.log('Current segments:', segments);

    if (user) {
      // User is authenticated
      if (!inTabsGroup && !inProfileScreen && !inAuthFlow) {
        // User is signed in but not in main app or profile, redirect to main app
        console.log('Redirecting authenticated user to main app');
        router.replace('/(tabs)/map');
      }
    } else {
      // User is not authenticated (could be guest mode)
      if (!inAuthFlow && !inTabsGroup && !inProfileScreen) {
        // User is not signed in and not in any valid screen, redirect to login
        console.log('Redirecting unauthenticated user to login');
        router.replace('/');
      }
      // Note: We allow unauthenticated users to stay in (tabs) for guest mode
    }
  }, [user, segments, isLoading]);

  useEffect(() => {
    // Don't do anything while loading
    if (isLoading) return;

    // Hide splash screen when auth state is determined
    SplashScreen.hideAsync();

    const inTabsGroup = segments[0] === '(tabs)';
    const inAuthFlow = segments[0] === 'index' || segments[0] === 'interest-selection';
    const inProfileScreen = segments[0] === 'profile';

    console.log('Auth state changed:', user ? 'logged in' : 'logged out');
    console.log('Current segments:', segments);

    if (user) {
      // User is authenticated
      if (!inTabsGroup && !inProfileScreen && !inAuthFlow) {
        // User is signed in but not in main app or profile, redirect to main app
        console.log('Redirecting authenticated user to main app');
        router.replace('/(tabs)/map');
      }
    } else {
      // User is not authenticated (could be guest mode)
      if (!inAuthFlow && !inTabsGroup && !inProfileScreen) {
        // User is not signed in and not in any valid screen, redirect to login
        console.log('Redirecting unauthenticated user to login');
        router.replace('/');
      }
      // Note: We allow unauthenticated users to stay in (tabs) for guest mode
    }
  }, [user, segments, isLoading]);

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

  // 🎯 TUTORIAL INTEGRATION: Wrap the entire Stack with TutorialManager
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
 * 🎯 TUTORIAL INTEGRATION NOTES:
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