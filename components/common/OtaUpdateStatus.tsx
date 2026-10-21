import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useOtaStatus } from '../../hooks/useOtaStatus';
import { otaUpdates, wasOtaAttempted } from '../../lib/otaUpdates';

export default function OtaUpdateStatus() {
  const { phase, readyId } = useOtaStatus();
  if (phase === 'idle' || phase === 'checking') return null;
  const ready = Boolean(readyId);
  const label = phase === 'applying' ? 'Opening update…' : ready ? 'Update now' : phase === 'downloading' ? 'Downloading update…' : 'Update download paused';
  return <View style={styles.container} testID="ota-update-status">
    <TouchableOpacity accessibilityRole={ready ? 'button' : 'text'} accessibilityLabel={label}
      disabled={!ready || phase === 'applying'} style={styles.row}
      onPress={() => { void otaUpdates.apply().then((applied) => {
        if (!applied) Alert.alert('Update is ready', wasOtaAttempted(readyId)
          ? 'Please close and reopen GathR to finish updating. Your saved account stays signed in.'
          : 'Finish or save your current work, close any open forms, then tap Update now again.');
      }); }}>
      <Ionicons name={ready ? 'checkmark-circle-outline' : 'download-outline'} size={16} color={ready ? '#1E90FF' : '#667085'} />
      <Text style={[styles.label, ready && styles.ready]} accessibilityLiveRegion="polite">{label}</Text>
    </TouchableOpacity>
    {ready && <Text style={styles.hint}>A quick restart when you’re ready</Text>}
    {!ready && phase === 'error' && <Text style={styles.hint}>You can keep using GathR. We’ll try later.</Text>}
  </View>;
}
const styles = StyleSheet.create({
  container: { alignItems: 'center', marginTop: 12, marginBottom: 9 },
  row: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  label: { marginLeft: 7, color: '#667085', fontSize: 13, fontWeight: '500' },
  ready: { color: '#1E90FF', fontWeight: '600' },
  hint: { color: '#667085', fontSize: 11, textAlign: 'center' },
});
