import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { auth } from '../config/firebaseConfig';
import { FUNCTIONS_BASE_URL } from './sharedEventApi';

const STORED_REGISTRATION_KEY = '@gathr/shared-event-push-registration-v1';
const REGISTER_URL = `${FUNCTIONS_BASE_URL}/registerSharedEventPushToken`;
const FALLBACK_PROJECT_ID = '87fd0c8f-0007-49fb-a057-2f4e81afe1db';
const REQUEST_TIMEOUT_MS = 12_000;
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

type StoredRegistration = {
  ownerUid: string;
  expoPushToken: string;
  registeredAt?: number;
};

let lastRegisteredUid = '';
let lastRegisteredAt = 0;

type PushUser = NonNullable<typeof auth.currentUser>;
type IosRequest = { user: PushUser; token?: Notifications.DevicePushToken; force: boolean };
let iosFlight: Promise<boolean> | null = null;
let iosUnregistering: Promise<void> | null = null;
let iosPending: IosRequest | null = null;
let iosController: AbortController | null = null;
let iosActiveUser: PushUser | null = null;
let iosActiveTokenKey = '';
let iosBlockedUser: PushUser | null = null;
let iosConfirmed: StoredRegistration | null = null;
let iosLastNativeKey = '';
// Include a request whose response is lost during logout: it may have reached
// the server, so sign-out must also unregister that token with the same owner.
const iosOwnedTokens = new Map<string, Set<string>>();

const nativeTokenKey = (token: Notifications.DevicePushToken) => JSON.stringify([token.type, token.data]);

function cancellable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new Error('Push registration cancelled'));
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

function projectId(): string {
  return (
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    FALLBACK_PROJECT_ID
  );
}

async function postRegistration(params: {
  action: 'register' | 'unregister';
  expoPushToken: string;
}, context?: { user: PushUser; current: () => boolean; signal?: AbortSignal }): Promise<boolean> {
  const user = context?.user ?? auth.currentUser;
  if (!user || (context && !context.current())) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const cancel = () => controller.abort();
  context?.signal?.addEventListener('abort', cancel, { once: true });
  try {
    const idToken = context
      ? await cancellable(user.getIdToken(), controller.signal)
      : await user.getIdToken();
    if (context && (!context.current() || context.signal?.aborted)) return false;
    const response = await fetch(REGISTER_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: params.action,
        expoPushToken: params.expoPushToken,
        platform: Platform.OS,
        deviceName: Device.deviceName,
        appVersion: Constants.expoConfig?.version,
        runtimeVersion: Updates.runtimeVersion,
      }),
      signal: controller.signal,
    });
    return response.ok;
  } catch (error) {
    if (context) console.warn('[SharedEventPush] Registration request failed');
    else console.warn('[SharedEventPush] Registration request failed:', error);
    return false;
  } finally {
    clearTimeout(timeout);
    context?.signal?.removeEventListener('abort', cancel);
  }
}

async function registerIosRequest(request: IosRequest, controller: AbortController): Promise<boolean> {
  const { user } = request;
  const current = () => auth.currentUser === user && iosBlockedUser !== user && !controller.signal.aborted;
  const obsoleteToken = (key: string) => iosPending?.user === user && !!iosPending.token
    && nativeTokenKey(iosPending.token) !== key;
  try {
    let permissions = await cancellable(Notifications.getPermissionsAsync(), controller.signal);
    if (!current()) return false;
    if (permissions.status !== 'granted') {
      permissions = await cancellable(Notifications.requestPermissionsAsync(), controller.signal);
    }
    if (!current() || permissions.status !== 'granted') return false;

    // Fetch native tokens only outside the listener. Forward the supplied
    // token to Expo, which otherwise fetches it again and can re-fire the listener.
    const token = request.token ?? await cancellable(Notifications.getDevicePushTokenAsync(), controller.signal);
    if (!current()) return false;
    const key = nativeTokenKey(token);
    iosActiveTokenKey = key;
    if (iosPending?.user === user && iosPending.token && nativeTokenKey(iosPending.token) === key) iosPending = null;
    if (obsoleteToken(key)) return false;
    const expoPushToken = (await cancellable(Notifications.getExpoPushTokenAsync({
      projectId: projectId(), devicePushToken: token,
    }), controller.signal)).data;
    if (!current() || obsoleteToken(key)) return false;
    if (iosConfirmed?.ownerUid === user.uid && iosConfirmed.expoPushToken === expoPushToken
      && iosLastNativeKey === key
      && typeof iosConfirmed.registeredAt === 'number' && Date.now() >= iosConfirmed.registeredAt
      && Date.now() - iosConfirmed.registeredAt < REFRESH_INTERVAL_MS) {
      iosLastNativeKey = key;
      return true;
    }

    if (!iosOwnedTokens.has(user.uid)) iosOwnedTokens.set(user.uid, new Set());
    iosOwnedTokens.get(user.uid)!.add(expoPushToken);
    const registered = await postRegistration({ action: 'register', expoPushToken }, {
      user, current, signal: controller.signal,
    });
    if (!registered || !current()) return false;
    iosConfirmed = { ownerUid: user.uid, expoPushToken, registeredAt: Date.now() };
    iosLastNativeKey = key;
    // The successful request is retained in memory even if local storage fails,
    // so repeated events do not re-post and logout can still unregister it.
    await AsyncStorage.setItem(STORED_REGISTRATION_KEY, JSON.stringify(iosConfirmed)).catch(() => undefined);
    return current();
  } catch {
    // Do not log SDK errors containing native tokens, credentials or request bodies.
    return false;
  }
}

function registerIos(force: boolean, token?: Notifications.DevicePushToken): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !Device.isDevice || iosBlockedUser === user) return Promise.resolve(false);
  if (iosUnregistering) return iosUnregistering.then(() => registerIos(force, token));
  if (iosFlight) {
    if (iosActiveUser !== user || (token && nativeTokenKey(token) !== iosActiveTokenKey)) {
      iosPending = { user, token, force };
    }
    return iosFlight;
  }
  if (iosConfirmed?.ownerUid === user.uid) {
    if (token && nativeTokenKey(token) === iosLastNativeKey) return Promise.resolve(true);
    if (!token && !force && typeof iosConfirmed.registeredAt === 'number'
      && Date.now() >= iosConfirmed.registeredAt && Date.now() - iosConfirmed.registeredAt < REFRESH_INTERVAL_MS) return Promise.resolve(true);
  }
  iosPending = { user, token, force };
  // Assign the flight before any SDK call can synchronously emit a token event.
  iosFlight = Promise.resolve().then(async () => {
    let registered = false;
    while (iosPending) {
      const request = iosPending;
      iosPending = null;
      iosActiveUser = request.user;
      iosActiveTokenKey = '';
      iosController = new AbortController();
      registered = await registerIosRequest(request, iosController);
    }
    return registered;
  }).finally(() => {
    iosFlight = null; iosController = null; iosActiveUser = null; iosActiveTokenKey = '';
    // A token can arrive between the drain's last iteration and this microtask.
    const pending = iosPending;
    iosPending = null;
    if (pending && auth.currentUser === pending.user) return registerIos(pending.force, pending.token).then(() => undefined);
  });
  return iosFlight;
}

function unregisterIos(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return Promise.resolve();
  if (iosUnregistering) return iosUnregistering;
  iosBlockedUser = user;
  iosPending = null;
  iosController?.abort();
  const previousFlight = iosFlight;
  iosUnregistering = Promise.resolve().then(async () => {
    await previousFlight;
    const tokens = new Set(iosOwnedTokens.get(user.uid));
    if (iosConfirmed?.ownerUid === user.uid) tokens.add(iosConfirmed.expoPushToken);
    let stored: StoredRegistration | null = null;
    try {
      try {
        const raw = await AsyncStorage.getItem(STORED_REGISTRATION_KEY);
        stored = raw ? JSON.parse(raw) as StoredRegistration : null;
      } catch { /* Still unregister tokens already known in memory. */ }
      if (stored?.ownerUid === user.uid && typeof stored.expoPushToken === 'string' && stored.expoPushToken) tokens.add(stored.expoPushToken);
      for (const expoPushToken of tokens) {
        await postRegistration({ action: 'unregister', expoPushToken }, { user, current: () => auth.currentUser === user });
      }
    } catch {
      // Logout still completes if the endpoint or local storage is unavailable.
    } finally {
      iosOwnedTokens.delete(user.uid);
      if (iosConfirmed?.ownerUid === user.uid) { iosConfirmed = null; iosLastNativeKey = ''; }
      if (!stored || stored.ownerUid === user.uid) await AsyncStorage.removeItem(STORED_REGISTRATION_KEY).catch(() => undefined);
    }
  }).finally(() => { iosUnregistering = null; });
  return iosUnregistering;
}

export async function registerSharedEventPushNotifications(
  force = false,
  devicePushToken?: Notifications.DevicePushToken
): Promise<boolean> {
  if (Platform.OS === 'ios') return registerIos(force, devicePushToken);
  const user = auth.currentUser;
  if (!user || !Device.isDevice) return false;
  if (
    !force &&
    lastRegisteredUid === user.uid &&
    Date.now() - lastRegisteredAt < REFRESH_INTERVAL_MS
  ) {
    return true;
  }

  let permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== 'granted') {
    permissions = await Notifications.requestPermissionsAsync();
  }
  if (permissions.status !== 'granted') return false;

  try {
    const expoPushToken = (await Notifications.getExpoPushTokenAsync({
      projectId: projectId(),
    })).data;
    const registered = await postRegistration({
      action: 'register',
      expoPushToken,
    });
    if (!registered) return false;

    await AsyncStorage.setItem(STORED_REGISTRATION_KEY, JSON.stringify({
      ownerUid: user.uid,
      expoPushToken,
    } satisfies StoredRegistration));
    lastRegisteredUid = user.uid;
    lastRegisteredAt = Date.now();
    return true;
  } catch (error) {
    console.warn('[SharedEventPush] Could not obtain an Expo push token:', error);
    return false;
  }
}

export async function unregisterSharedEventPushNotifications(): Promise<void> {
  if (Platform.OS === 'ios') return unregisterIos();
  const user = auth.currentUser;
  if (!user) return;

  try {
    const stored = await AsyncStorage.getItem(STORED_REGISTRATION_KEY);
    if (!stored) return;
    const registration = JSON.parse(stored) as Partial<StoredRegistration>;
    if (
      registration.ownerUid === user.uid &&
      typeof registration.expoPushToken === 'string' &&
      registration.expoPushToken
    ) {
      await postRegistration({
        action: 'unregister',
        expoPushToken: registration.expoPushToken,
      });
    }
  } catch (error) {
    console.warn('[SharedEventPush] Could not unregister this device:', error);
  } finally {
    lastRegisteredUid = '';
    lastRegisteredAt = 0;
    await AsyncStorage.removeItem(STORED_REGISTRATION_KEY).catch(() => undefined);
  }
}
