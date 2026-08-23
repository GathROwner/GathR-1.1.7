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
};

let lastRegisteredUid = '';
let lastRegisteredAt = 0;

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
}): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const idToken = await user.getIdToken();
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
    console.warn('[SharedEventPush] Registration request failed:', error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function registerSharedEventPushNotifications(
  force = false
): Promise<boolean> {
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
