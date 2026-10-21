import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Keyboard, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { hasOtaSafetyBlock } from '../hooks/useOtaSafetyBlock';
import { useTutorialUiStore } from '../store/tutorialUiStore';
import { OtaUpdateController } from './otaUpdateController';
import { useMapStore } from '../store/mapStore';

const ATTEMPT_KEY = '@gathr/ota-attempt/v1';
export const OTA_RETURN_KEY = '@gathr/ota-return/v1';
export const OTA_SAFE_PATHS = ['/map', '/events', '/specials', '/profile'];
type Context = { path: string; uid: string | null; blocked: boolean };
let context: Context = { path: '', uid: null, blocked: true };
let initialized = false;
let attemptedId: string | null = null;
let interaction = 0;
let externalIntent = false;
let queueBlocked = true;
let lastTab = '/map';
export const otaEnabled = Platform.OS === 'ios' && Updates.isEnabled && !__DEV__;
export function setOtaContext(next: Context) {
  context = next;
  if (['/map', '/events', '/specials'].includes(next.path)) lastTab = next.path;
}
export function noteOtaInteraction() { interaction++; }
export function otaInteractionGeneration() { return interaction; }
export function setOtaQueueBlocked(value: boolean) { queueBlocked = value; }
export function noteOtaExternalIntent() { externalIntent = true; interaction++; }
export function resetOtaExternalIntent() { externalIntent = false; }
export function hasOtaExternalIntent() { return externalIntent; }
export function isOtaSafe(allowBackground = false) {
  const map = useMapStore.getState();
  const mapBusy = Boolean(map.selectedImageData || map.selectedVenue || map.selectedCluster
    || map.selectedVenues.length || map.activeFilterPanel || map.isHeaderSearchActive || map.searchQuery || map.pendingRouteEvent);
  return initialized && !context.blocked
    && !queueBlocked && (allowBackground || AppState.currentState === 'active') && !Keyboard.isVisible()
    && OTA_SAFE_PATHS.includes(context.path) && !hasOtaSafetyBlock()
    && !mapBusy && !useTutorialUiStore.getState().isVisible;
}
export const otaUpdates = new OtaUpdateController({
  check: async () => {
    const result = await Updates.checkForUpdateAsync();
    return result.isAvailable ? result.manifest.id : null;
  },
  fetch: async () => {
    const result = await Updates.fetchUpdateAsync();
    return result.isNew ? result.manifest.id : null;
  },
  reload: () => Updates.reloadAsync(),
  safe: isOtaSafe,
  alreadyAttempted: (id) => attemptedId === id,
  cancelAttempt: async () => {
    attemptedId = null;
    await AsyncStorage.multiRemove([ATTEMPT_KEY, OTA_RETURN_KEY]);
  },
  beforeReload: async (id) => {
    const generation = interaction;
    const capture = { ...context };
    await AsyncStorage.setItem(OTA_RETURN_KEY, JSON.stringify({
      path: capture.path, basePath: lastTab, uid: capture.uid, id, expires: Date.now() + 120_000,
    }));
    if (generation !== interaction || capture.path !== context.path || capture.uid !== context.uid || !isOtaSafe()) {
      await AsyncStorage.removeItem(OTA_RETURN_KEY); return false;
    }
    await AsyncStorage.setItem(ATTEMPT_KEY, id);
    attemptedId = id;
    if (generation !== interaction || !isOtaSafe()) {
      attemptedId = null;
      await AsyncStorage.multiRemove([ATTEMPT_KEY, OTA_RETURN_KEY]);
      return false;
    }
    return true;
  },
});
export async function initializeOtaUpdates() {
  try { attemptedId = await AsyncStorage.getItem(ATTEMPT_KEY); initialized = true; }
  catch { /* Persisted attempt guard is required before a reload. */ }
}
export function wasOtaAttempted(id: string | null) { return Boolean(id && id === attemptedId); }
