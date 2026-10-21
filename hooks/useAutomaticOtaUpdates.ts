import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { subscribeSharedEventUploadJobs } from '../lib/sharedEventUploadQueue';
import { useOtaSafetyBlock } from './useOtaSafetyBlock';
import {
  initializeOtaUpdates, isOtaSafe, noteOtaExternalIntent, otaEnabled, otaUpdates, OTA_RETURN_KEY,
  OTA_SAFE_PATHS, resetOtaExternalIntent, setOtaContext, setOtaQueueBlocked, otaInteractionGeneration, hasOtaExternalIntent,
} from '../lib/otaUpdates';

export function useAutomaticOtaUpdates(path: string, uid: string | null, blocked: boolean) {
  const native = Updates.useUpdates();
  const router = useRouter();
  const restored = useRef(false);
  const [profileRestore, setProfileRestore] = useState<{ basePath: string; generation: number; uid: string | null } | null>(null);
  const initialized = useRef(false);
  const initialization = useRef<Promise<void> | null>(null);
  const pending = useRef(native);
  pending.current = native;
  const pathRef = useRef(path);
  pathRef.current = path;
  const uidRef = useRef(uid);
  uidRef.current = uid;
  // Root context is refreshed before any later async reload can proceed.
  useLayoutEffect(() => { setOtaContext({ path, uid, blocked }); }, [path, uid, blocked]);
  useOtaSafetyBlock(blocked);

  useEffect(() => {
    if (!otaEnabled) return;
    let alive = true;
    const updateQueue = subscribeSharedEventUploadJobs((jobs) => {
      setOtaQueueBlocked(jobs.some((job) => job.status !== 'accepted'));
      // The subscription must not overwrite newer route/auth context.
    });
    const link = Linking.addEventListener('url', noteOtaExternalIntent);
    const notification = Notifications.addNotificationResponseReceivedListener(noteOtaExternalIntent);
    initialization.current = (async () => {
      await initializeOtaUpdates();
      const [url, response] = await Promise.all([
        Linking.getInitialURL(), Notifications.getLastNotificationResponseAsync(),
      ]);
      if (url || response) noteOtaExternalIntent();
      if (!alive) return;
      initialized.current = true;
      if (!pending.current.isStartupProcedureRunning && !pending.current.isDownloading) void otaUpdates.check();
    })().catch(() => undefined);
    let returnTimer: ReturnType<typeof setTimeout> | undefined;
    const appState = AppState.addEventListener('change', (state) => {
      if (returnTimer) clearTimeout(returnTimer);
      if (state === 'background') {
        // AppState has already changed; capture the work guards without the
        // active-state requirement, then require active safety again on return.
        // Map has several transient presentations; defer automatic application
        // there until a later guarded Profile/feed return or native cold start.
        otaUpdates.background(pathRef.current !== '/map' && !hasOtaExternalIntent() && isOtaSafe(true));
        resetOtaExternalIntent();
      }
      if (state === 'active' && initialized.current) {
        const generation = otaInteractionGeneration();
        const returnPath = pathRef.current;
        returnTimer = setTimeout(() => {
          if (pending.current.isStartupProcedureRunning || pending.current.isDownloading) return;
          void otaUpdates.foreground(!hasOtaExternalIntent() && generation === otaInteractionGeneration() && returnPath === pathRef.current);
        }, 600);
      }
    });
    return () => { alive = false; updateQueue(); link.remove(); notification.remove(); appState.remove(); if (returnTimer) clearTimeout(returnTimer); };
  }, []);

  useEffect(() => {
    if (!otaEnabled) return;
    otaUpdates.nativeDownload(native.isDownloading);
    if (native.isUpdatePending && native.downloadedUpdate?.updateId) otaUpdates.ready(native.downloadedUpdate.updateId);
    if (initialized.current && !native.isStartupProcedureRunning && !native.isDownloading) void otaUpdates.check();
  }, [native.isUpdatePending, native.downloadedUpdate?.updateId, native.isStartupProcedureRunning, native.isDownloading]);

  useEffect(() => {
    if (!otaEnabled || blocked || restored.current || (uid && path === '/')) return;
    restored.current = true;
    const generation = otaInteractionGeneration();
    const restorePath = path;
    void (async () => {
      await initialization.current;
      const value = await AsyncStorage.getItem(OTA_RETURN_KEY);
      await AsyncStorage.removeItem(OTA_RETURN_KEY);
      if (!value) return;
      const token = JSON.parse(value);
      if (token.uid !== uid || token.id !== Updates.updateId || token.expires < Date.now()
        || !OTA_SAFE_PATHS.includes(token.path) || hasOtaExternalIntent() || await Linking.getInitialURL()) return;
      if (generation !== otaInteractionGeneration() || restorePath !== pathRef.current || uid !== uidRef.current) return;
      const basePath = ['/map', '/events', '/specials'].includes(token.basePath) ? token.basePath : '/map';
      const destination = token.path === '/profile' ? basePath : token.path;
      if (token.path === '/profile') setProfileRestore({ basePath: destination, generation, uid });
      router.replace(`/(tabs)${destination}` as never);
    })().catch(() => undefined);
  }, [blocked, uid, path, router]);

  useEffect(() => {
    if (!profileRestore || path !== profileRestore.basePath) return;
    setProfileRestore(null);
    if (!blocked && !hasOtaExternalIntent() && profileRestore.generation === otaInteractionGeneration() && profileRestore.uid === uid) router.push('/profile');
  }, [path, uid, blocked, profileRestore, router]);
}
