import { getApp } from '@react-native-firebase/app';
import {
  getToken,
  initializeAppCheck,
  type AppCheck,
} from '@react-native-firebase/app-check';
import { Platform } from 'react-native';

import { useFirebaseEmulators } from '../config/firebaseConfig';

let appCheckPromise: Promise<AppCheck> | null = null;
let tokenRequest: Promise<string> | null = null;
let failureCount = 0;
let lastFailure: { error: Error; retryAtMs: number } | null = null;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

type VerificationStage = 'APP' | 'INIT' | 'TOKEN';

function safeFailureCode(error: unknown): string {
  // Never put a native message, token, configuration value or arbitrary SDK
  // payload in UI/analytics. Only these known categories may leave this service.
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code.toLowerCase().split('/').pop() : '';
  switch (code) {
    case 'network-request-failed': case 'network-error': case 'unavailable': return 'NETWORK';
    case 'token-error': return 'TOKEN-ERROR';
    case 'token-null': return 'TOKEN-NULL';
    case 'unsupported': case 'unsupported-provider': return 'UNSUPPORTED';
    case 'invalid-configuration': return 'CONFIG';
    default: return 'UNKNOWN';
  }
}

function verificationError(stage: VerificationStage, code: string): Error {
  // This message already flows through place-preparation errors to the existing
  // readiness UI. The identifier distinguishes initialization from token fetch.
  return new Error(`GathR could not verify this app installation. Try again shortly. [AC-${stage}-${code}]`);
}

function debugProviderEnabled() {
  return __DEV__ || process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG === 'true';
}

function appCheckExplicitlyDisabled() {
  return process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DISABLED === 'true';
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

async function appCheckInstance(app: ReturnType<typeof getApp>): Promise<AppCheck> {
  if (!appCheckPromise) {
    const pending = initializeAppCheck(app, {
      provider: createProvider(),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckPromise = pending;
    void pending.catch(() => {
      // A failed initialization must not poison every later attempt. Guard the
      // identity so an old rejection cannot clear a replacement initialization.
      if (appCheckPromise === pending) appCheckPromise = null;
    });
  }
  return appCheckPromise;
}

async function acquireToken(): Promise<string> {
  let stage: VerificationStage = 'APP';
  try {
    const app = getApp();
    stage = 'INIT';
    const instance = await appCheckInstance(app);
    stage = 'TOKEN';
    const result = await getToken(instance);
    if (!result.token) throw Object.assign(new Error('empty-token'), { code: 'token-null' });
    failureCount = 0;
    lastFailure = null;
    return result.token;
  } catch (error) {
    const safeError = verificationError(stage, safeFailureCode(error));
    const delay = RETRY_DELAYS_MS[Math.min(failureCount, RETRY_DELAYS_MS.length - 1)];
    failureCount = Math.min(failureCount + 1, RETRY_DELAYS_MS.length);
    lastFailure = { error: safeError, retryAtMs: Date.now() + delay };
    throw safeError;
  }
}

/**
 * Returns a native-attested token for Release 2 callable requests.
 * Local Firebase emulators intentionally omit App Check because the emulator
 * is already restricted to an explicit development configuration.
 */
export async function getSocialAppCheckToken(): Promise<string | null> {
  // An internal Preview OTA may intentionally use Production web Firebase
  // services while the installed native shell remains registered to staging.
  // Never send a token issued for the staging native app to Production. This
  // override is opt-in at OTA export time and remains off in native/Production
  // build profiles.
  if (useFirebaseEmulators || Platform.OS === 'web' || appCheckExplicitlyDisabled()) {
    return null;
  }
  if (tokenRequest) return tokenRequest;
  if (lastFailure && Date.now() < lastFailure.retryAtMs) throw lastFailure.error;
  const pending = acquireToken();
  tokenRequest = pending;
  try {
    return await pending;
  } finally {
    if (tokenRequest === pending) tokenRequest = null;
  }
}
