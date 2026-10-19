import React, { useState } from 'react';
import { Linking, Modal, Platform, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { useMinimumAppVersion } from '../../hooks/useMinimumAppVersion';
import { APP_STORE_URLS } from '../../utils/minimumAppVersion';
import { UpdateRequiredNotice } from './UpdateRequiredNotice';

export function MinimumAppVersionGate() {
  const { minimumVersion, checking, check } = useMinimumAppVersion();
  const [storeError, setStoreError] = useState(false);
  if (!minimumVersion || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;
  const platform = Platform.OS;
  const openStore = async () => {
    setStoreError(false);
    try {
      await Linking.openURL(APP_STORE_URLS[platform]);
    } catch {
      setStoreError(true);
    }
  };
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen"
      onRequestClose={() => { /* An enforced notice cannot be dismissed by Android Back. */ }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <UpdateRequiredNotice installedVersion={Application.nativeApplicationVersion || 'Unknown'}
          minimumVersion={minimumVersion} platform={platform} checking={checking} storeError={storeError}
          onUpdate={() => { void openStore(); }} onRetry={() => { void check(); }} />
      </SafeAreaProvider>
    </Modal>
  );
}
