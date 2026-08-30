import { getApp } from '@react-native-firebase/app';
import {
  getToken,
  initializeAppCheck,
  type AppCheck,
} from '@react-native-firebase/app-check';
import { Platform } from 'react-native';

import { useFirebaseEmulators } from '../config/firebaseConfig';

let appCheckPromise: Promise<AppCheck> | null = null;

function debugProviderEnabled() {
  return __DEV__ || process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG === 'true';
}

function createProvider() {
  const debug = debugProviderEnabled();
  const debugToken = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim();
  return {
    providerOptions: {
      android: {
        provider: debug ? 'debug' as const : 'playIntegrity' as const,
        ...(debugToken ? { debugToken } : {}),
      },
      apple: {
        provider: debug ? 'debug' as const : 'appAttestWithDeviceCheckFallback' as const,
        ...(debugToken ? { debugToken } : {}),
      },
    },
  };
}

async function appCheckInstance(): Promise<AppCheck> {
  if (!appCheckPromise) {
    appCheckPromise = initializeAppCheck(getApp(), {
      provider: createProvider(),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return appCheckPromise;
}

/**
 * Returns a native-attested token for Release 2 callable requests.
 * Local Firebase emulators intentionally omit App Check because the emulator
 * is already restricted to an explicit development configuration.
 */
export async function getSocialAppCheckToken(): Promise<string | null> {
  if (useFirebaseEmulators || Platform.OS === 'web') return null;
  try {
    const result = await getToken(await appCheckInstance());
    if (!result.token) throw new Error('empty-token');
    return result.token;
  } catch {
    throw new Error(
      'GathR could not verify this app installation. Update the app or try again shortly.'
    );
  }
}
