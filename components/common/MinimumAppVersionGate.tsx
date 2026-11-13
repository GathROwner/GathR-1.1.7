import React from 'react';
import { Modal, Platform, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { useMinimumAppVersion } from '../../hooks/useMinimumAppVersion';
import { useAppStoreLink } from '../../hooks/useAppStoreLink';
import { UpdateRequiredNotice } from './UpdateRequiredNotice';

export function MinimumAppVersionGate() {
  const { minimumVersion, checking, check } = useMinimumAppVersion();
  const { storeError, openStore } = useAppStoreLink(Platform.OS === 'android' ? 'android' : 'ios');
  if (!minimumVersion || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return null;
  const platform = Platform.OS;
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
