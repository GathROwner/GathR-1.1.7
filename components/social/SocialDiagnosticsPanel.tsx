import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { firebaseTarget } from '../../config/firebaseConfig';
import {
  getLastSocialCallableDiagnostic,
  subscribeToSocialCallableDiagnostics,
} from '../../services/socialService';
import { SOCIAL_LISTENER_COUNT, useSocialStore } from '../../store/socialStore';
import { socialTimestampToMillis } from '../../utils/friendPresence';

function expiryCopy(expiresAt: unknown, now: number) {
  const expiry = socialTimestampToMillis(expiresAt as never);
  if (expiry === null) return 'none';
  const remainingSeconds = Math.max(0, Math.ceil((expiry - now) / 1000));
  return `${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s`;
}

function DevSocialDiagnosticsPanel() {
  const [now, setNow] = useState(Date.now());
  const uid = useSocialStore((state) => state.uid);
  const friendCount = useSocialStore((state) => state.friends.length);
  const requestCount = useSocialStore((state) => state.requests.length);
  const activeActivityCount = useSocialStore((state) => state.activity.length);
  const activityReceivedCount = useSocialStore((state) => state.activityReceivedCount);
  const activityExpiredCount = useSocialStore((state) => state.activityExpiredCount);
  const listenerReadyCount = useSocialStore((state) => state.listenerReadyCount);
  const fromCache = useSocialStore((state) => state.fromCache);
  const listenerError = useSocialStore((state) => state.error);
  const ownCheckIn = useSocialStore((state) => state.ownCheckIn);
  const mapFriendClusterCount = useSocialStore((state) => state.mapFriendClusterCount);
  const mapFriendVenueCount = useSocialStore((state) => state.mapFriendVenueCount);
  const callable = useSyncExternalStore(
    subscribeToSocialCallableDiagnostics,
    getLastSocialCallableDiagnostic,
    getLastSocialCallableDiagnostic
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View accessible accessibilityLabel="Development-only social diagnostics" style={styles.panel}>
      <Text style={styles.title}>DEV · Social diagnostics</Text>
      <Text style={styles.row}>Firebase: {firebaseTarget}</Text>
      <Text style={styles.row}>User: {uid ? uid.slice(0, 8) : 'signed out'}</Text>
      <Text style={styles.row}>
        Listeners: {listenerReadyCount}/{SOCIAL_LISTENER_COUNT} · {fromCache ? 'cache/offline' : 'server'}
      </Text>
      <Text style={styles.row}>Friends: {friendCount} · Requests: {requestCount}</Text>
      <Text style={styles.row}>
        Activity: {activeActivityCount} active · {activityExpiredCount} expired · {activityReceivedCount} received
      </Text>
      <Text style={styles.row}>
        Map: {mapFriendClusterCount} friend clusters · {mapFriendVenueCount} venues
      </Text>
      <Text style={styles.row}>
        Check-in: {ownCheckIn ? `active · ${expiryCopy(ownCheckIn.expiresAt, now)}` : 'none'}
      </Text>
      <Text style={styles.row}>
        Last call: {callable
          ? `${callable.operation} · ${callable.requestId} · ${callable.durationMs}ms · ${callable.success ? 'ok' : callable.errorCode}`
          : 'none'}
      </Text>
      {!!listenerError && <Text style={styles.error}>Listener: {listenerError}</Text>}
    </View>
  );
}

export function SocialDiagnosticsPanel() {
  if (!__DEV__) return null;
  return <DevSocialDiagnosticsPanel />;
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#102A43',
    borderRadius: 14,
    gap: 3,
    padding: 14,
  },
  title: { color: '#7FDBFF', fontSize: 13, fontWeight: '800', marginBottom: 3 },
  row: { color: '#E6F6FF', fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
  error: { color: '#FFB4AB', fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
});
