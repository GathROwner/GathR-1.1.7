// lib/amplitudeAnalytics.ts
import {
  init,
  track,
  setUserId,
  Identify,
  identify,
  setOptOut,
} from '@amplitude/analytics-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_TEST_KEY = 'AMP_ASYNC_STORAGE_TEST';

class AsyncStorageCookieStorage {
  private enabled?: boolean;

  private hasAsyncStorage(): boolean {
    return typeof AsyncStorage?.getItem === 'function';
  }

  async isEnabled() {
    if (this.enabled !== undefined) {
      return this.enabled;
    }
    if (!this.hasAsyncStorage()) {
      this.enabled = false;
      return this.enabled;
    }
    try {
      await AsyncStorage.setItem(STORAGE_TEST_KEY, '1');
      await AsyncStorage.removeItem(STORAGE_TEST_KEY);
      this.enabled = true;
    } catch {
      this.enabled = false;
    }
    return this.enabled;
  }

  async getRaw(key: string) {
    if (!this.hasAsyncStorage()) {
      return undefined;
    }
    try {
      return (await AsyncStorage.getItem(key)) ?? undefined;
    } catch {
      return undefined;
    }
  }

  async get<T = unknown>(key: string) {
    const raw = await this.getRaw(key);
    if (!raw) {
      return undefined;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown | null) {
    if (!this.hasAsyncStorage()) {
      return;
    }
    try {
      if (value === null || value === undefined) {
        await AsyncStorage.removeItem(key);
        return;
      }
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // best effort only
    }
  }

  async remove(key: string) {
    if (!this.hasAsyncStorage()) {
      return;
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // best effort only
    }
  }

  async reset() {
    // avoid clearing unrelated AsyncStorage data
  }
}

const asyncStorageCookieStorage = new AsyncStorageCookieStorage();

const ensureDocumentCookie = () => {
  const globalScope = globalThis as typeof globalThis & { document?: any };
  if (!globalScope.document) {
    globalScope.document = { cookie: '' };
  } else if (typeof globalScope.document.cookie === 'undefined') {
    globalScope.document.cookie = '';
  }
};

let initialized = false;

export async function amplitudeMarkManualLogin() {
  try {
    await AsyncStorage.setItem('ampl_login_intent', 'manual');
  } catch {
    // analytics must never block auth
  }
}


export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

/** Call once on app start (dev build or release; not Expo Go) */
export function amplitudeInit(apiKey: string) {
  if (initialized) return;
  if (!apiKey) {
    if (__DEV__) console.warn('[amplitude] Missing API key — events will be dropped');
    return;
  }
  ensureDocumentCookie();
  init(apiKey, undefined, {
    cookieStorage: asyncStorageCookieStorage,
  });
  initialized = true;
}

/** Fire an event */
export function amplitudeTrack(name: string, props?: AnalyticsProps) {
  track(name, props);
}

/** Set/clear the user id (call on login/logout) */
export function amplitudeSetUserId(userId?: string) {
  setUserId(userId || undefined);
}

/** Set user properties */
export function amplitudeSetUserProps(props: AnalyticsProps) {
  const id = new Identify();
  Object.entries(props).forEach(([k, v]) => id.set(k, v as any));
  identify(id);
}

/** Respect consent toggles */
export function amplitudeOptOut(optOut: boolean) {
  setOptOut(optOut);
}
