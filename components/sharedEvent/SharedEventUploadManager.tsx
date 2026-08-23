import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import {
  processSharedEventUploadQueue,
  reconcileSharedEventUploadQueueFromServer,
} from '../../lib/sharedEventUploadQueue';

export default function SharedEventUploadManager() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return undefined;
    const resumeUploads = async () => {
      await reconcileSharedEventUploadQueueFromServer();
      await processSharedEventUploadQueue();
    };
    void resumeUploads();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resumeUploads();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void resumeUploads();
    }, 15000);

    return () => {
      appStateSubscription.remove();
      clearInterval(interval);
    };
  }, [user]);

  return null;
}
