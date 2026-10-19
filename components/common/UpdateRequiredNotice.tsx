import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StorePlatform } from '../../utils/minimumAppVersion';
import GathrWordmarkLogo from './GathrWordmarkLogo';

type Props = {
  installedVersion: string;
  minimumVersion: string;
  platform: StorePlatform;
  checking?: boolean;
  storeError?: boolean;
  onUpdate: () => void;
  onRetry: () => void;
  onPreviewClose?: () => void;
};

export function UpdateRequiredNotice({ installedVersion, minimumVersion, platform,
  checking = false, storeError = false, onUpdate, onRetry, onPreviewClose }: Props) {
  const storeName = platform === 'ios' ? 'the App Store' : 'Google Play';
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={styles.content}>
          {onPreviewClose && <View style={styles.preview}>
            <Text style={styles.previewLabel}>Preview only · your app is not blocked</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close update notice preview"
              onPress={onPreviewClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
          </View>}
          <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <GathrWordmarkLogo width={130} height={50} color="#1769B0" accentColor="#8B2535" />
          </View>
          <Text style={styles.eyebrow}>GATHR UPDATE</Text>
          <Text accessibilityRole="header" style={styles.title}>A newer GathR{ '\n' }is ready</Text>
          <Text style={styles.body}>Please update GathR to continue. Your account and saved favourites will be here when you return.</Text>
          <View style={styles.versions}>
            <View style={styles.versionRow}><Text style={styles.versionLabel}>Installed</Text><Text style={styles.versionValue}>{installedVersion}</Text></View>
            <View style={styles.divider} />
            <View style={styles.versionRow}><Text style={styles.versionLabel}>Required</Text><Text style={styles.versionValue}>{minimumVersion}</Text></View>
          </View>
          <Pressable accessibilityRole="button" onPress={onUpdate} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>Update GathR</Text>
          </Pressable>
          <Text style={styles.storeHint}>Opens GathR in {storeName}</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: checking, busy: checking }}
            disabled={checking} onPress={onRetry} style={styles.secondary}>
            {checking && <ActivityIndicator color="#1769B0" style={styles.spinner} />}
            <Text style={styles.secondaryText}>{checking ? 'Checking for updates…' : 'I’ve updated — check again'}</Text>
          </Pressable>
          {storeError && <Text accessibilityRole="alert" style={styles.error}>We couldn’t open {storeName}. Open it and search for GathR Map to update.</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F8FC' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 20 },
  content: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  preview: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E6EFFB', borderRadius: 14, paddingLeft: 14, marginBottom: 20 },
  previewLabel: { flex: 1, fontSize: 13, color: '#305578' },
  close: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center' },
  closeText: { fontSize: 28, color: '#305578' },
  mark: { alignSelf: 'flex-start', marginBottom: 20 },
  eyebrow: { fontSize: 12, letterSpacing: 1.8, fontWeight: '700', color: '#1769B0', marginBottom: 10 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '800', color: '#102A43', marginBottom: 14 },
  body: { fontSize: 16, lineHeight: 24, color: '#486581' },
  versions: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#DEE7F0', paddingHorizontal: 18, marginTop: 20, marginBottom: 20 },
  versionRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingVertical: 12 },
  versionLabel: { fontSize: 15, color: '#627D98' },
  versionValue: { fontSize: 15, fontWeight: '700', color: '#102A43' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#DEE7F0' },
  primary: { minHeight: 56, padding: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#1477D4' },
  pressed: { opacity: 0.8 },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  storeHint: { color: '#627D98', fontSize: 13, textAlign: 'center', marginTop: 12 },
  secondary: { minHeight: 52, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  secondaryText: { color: '#1769B0', fontSize: 15, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  spinner: { marginRight: 10 },
  error: { color: '#9B341B', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12 },
});
