import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { APP_STORE_URLS, StorePlatform } from '../utils/minimumAppVersion';

/** Shared by the real gate and its Preview, so the handoff is identical. */
export function useAppStoreLink(platform: StorePlatform) {
  const [storeError, setStoreError] = useState(false);
  const resetStoreError = useCallback(() => setStoreError(false), []);
  const openStore = useCallback(async () => {
    setStoreError(false);
    try {
      await Linking.openURL(APP_STORE_URLS[platform]);
    } catch {
      setStoreError(true);
    }
  }, [platform]);
  return { storeError, openStore, resetStoreError };
}
