/**
 * Deep Link Route Handler for /special/[id]
 *
 * This screen catches Universal Link / App Link URLs and redirects to the map.
 * The actual lightbox opening is handled by useDeepLinking hook in _layout.tsx
 * which listens for incoming URLs via Linking.addEventListener.
 */

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';

export default function SpecialDeepLinkScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const [hasNavigated, setHasNavigated] = useState(false);

  useEffect(() => {
    // Wait for navigation to be ready before attempting to navigate
    if (!rootNavigationState?.key || hasNavigated) {
      return;
    }

    console.log('[DeepLink Route] Navigation ready, redirecting to map (hook handles lightbox)');
    setHasNavigated(true);
    router.replace('/(tabs)/map');
  }, [rootNavigationState?.key, hasNavigated]);

  // Show loading while waiting for navigation to be ready
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4A90E2" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#80c3f7',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
