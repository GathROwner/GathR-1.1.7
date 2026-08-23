import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../contexts/AuthContext';
import { registerSharedEventPushNotifications } from '../../lib/sharedEventPushNotifications';

export default function SharedEventPushRegistration() {
  const { user } = useAuth();
  const userUid = user?.uid;

  useEffect(() => {
    if (!userUid) return;
    void registerSharedEventPushNotifications(true);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void registerSharedEventPushNotifications();
      }
    });
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      void registerSharedEventPushNotifications(true);
    });

    return () => {
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [userUid]);

  return null;
}
