import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { processSharedEventUploadQueue } from '../../lib/sharedEventUploadQueue';

export default function SharedEventUploadManager() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return undefined;
    void processSharedEventUploadQueue();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void processSharedEventUploadQueue();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void processSharedEventUploadQueue();
    }, 15000);

    return () => {
      appStateSubscription.remove();
      clearInterval(interval);
    };
  }, [user]);

  return null;
}
