import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../contexts/AuthContext';
import { setReadinessMode } from '../services/checkInReadinessPreferences';
import { useCheckInReadinessStore } from '../store/checkInReadinessStore';

export default function CheckInSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { uid, mode, preferencesLoaded } = useCheckInReadinessStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [locationGranted, setLocationGranted] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState('Checking…');
  const [needsSettings, setNeedsSettings] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [location, notifications] = await Promise.all([
          Location.getForegroundPermissionsAsync(), Notifications.getPermissionsAsync(),
        ]);
        if (!active) return;
        setLocationGranted(location.status === 'granted');
        setNeedsSettings(!location.canAskAgain && location.status !== 'granted');
        setNotificationStatus(notifications.granted ? 'Allowed' : notifications.status === 'undetermined' ? 'Not requested' : 'Not allowed');
      } catch { if (active) setNotificationStatus('Unavailable'); }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { active = false; subscription.remove(); };
  }, []);

  const choose = async (next: 'standard' | 'basic') => {
    if (busy || !user || uid !== user.uid || !preferencesLoaded) return;
    setBusy(true);
    setError('');
    try {
      await setReadinessMode(next);
      if (next === 'standard' && useCheckInReadinessStore.getState().uid === user.uid) {
        // Only this contextual user action asks for foreground permission. Never request Always here.
        const permission = await Location.requestForegroundPermissionsAsync();
        setLocationGranted(permission.status === 'granted');
        setNeedsSettings(!permission.canAskAgain && permission.status !== 'granted');
      }
    } catch { setError('This preference could not be saved. Please try again.'); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={24} color="#344054" /></TouchableOpacity>
      <Text style={styles.title}>Location &amp; check-ins</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Prepare a check-in while you browse. Readiness never checks you in or shares your location with friends.</Text>
      <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: mode === 'standard', disabled: busy }}
        disabled={busy} onPress={() => void choose('standard')} style={[styles.card, mode === 'standard' && styles.selected]}>
        <Text style={styles.heading}>While Using GathR</Text>
        <Text style={styles.copy}>With location allowed, the rings build only while GathR is open. Purple Here prepares an approximate private check-in; blue Place prepares public places and an optional exact private pin.</Text>
        <Text style={styles.status}>{locationGranted ? 'Location allowed' : 'Tap to allow location while using GathR'}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: mode === 'basic', disabled: busy }}
        disabled={busy} onPress={() => void choose('basic')} style={[styles.card, mode === 'basic' && styles.selected]}>
        <Text style={styles.heading}>Browse without location</Text>
        <Text style={styles.copy}>Browse and search the map. Nearby check-in readiness is off. This setting controls check-ins; existing event-map location permission can be changed in your device settings.</Text>
      </TouchableOpacity>
      <View style={styles.card}>
        <Text style={styles.heading}>Proactive</Text>
        <Text style={styles.status}>Arrival reminders · Not available in this build</Text>
        <Text style={styles.copy}>Optional reminders when GathR is closed need background location and separate notification permission. Background delivery is approximate and may be delayed by your phone. It cannot promise a 90-second arrival reminder.</Text>
        <Text style={styles.copy}>When this feature becomes available, enabling Arrival Reminders will explain the background location upgrade before asking. No background location is collected by check-in readiness in this build.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>Notifications are separate</Text>
        <Text style={styles.copy}>Device permission: {notificationStatus}. Allowing location does not authorize notifications. Foreground check-in hints do not require notification permission.</Text>
      </View>
      {needsSettings && <Text style={styles.copy}>Location permission can be changed in your device settings.</Text>}
      <TouchableOpacity accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.back}>
        <Text style={styles.status}>Open device settings</Text>
      </TouchableOpacity>
      {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
      <Text style={styles.footnote}>Stationary, accurate location fixes prepare the rings: about 30 seconds for Here and 90 seconds for Place. Moving or uncertain location resets progress. Every check-in still needs your audience choice and confirmation.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F8FB' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: '#FFFFFF' },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 21, fontWeight: '800', color: '#101828' },
  content: { padding: 18, gap: 14, paddingBottom: 30 },
  intro: { color: '#344054', fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1.5, borderColor: '#E4E7EC', padding: 16, gap: 8 },
  selected: { borderColor: '#2F80ED', backgroundColor: '#EFF8FF' },
  heading: { fontSize: 17, color: '#101828', fontWeight: '800' },
  copy: { fontSize: 14, lineHeight: 21, color: '#475467' },
  status: { color: '#175CD3', fontSize: 13, fontWeight: '700' },
  footnote: { color: '#667085', fontSize: 13, lineHeight: 20 },
  error: { color: '#B42318', fontSize: 14 },
});
