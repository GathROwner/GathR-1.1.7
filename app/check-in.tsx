import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../contexts/AuthContext';
import {
  checkOut,
  createCheckIn,
  createSocialOperationId,
  SocialServiceError,
} from '../services/socialService';
import { useMapStore } from '../store';
import { useSocialStore } from '../store/socialStore';
import type {
  CheckInAudienceMode,
  CheckInDurationMinutes,
  FriendProjection,
} from '../types/social';
import { SOCIAL_FEATURE_ENABLED } from '../types/social';
import {
  formatCheckInVisibilityCopy,
  getRecognizedVenueId,
} from '../utils/friendPresence';

interface RecognizedVenueOption {
  venueId: string;
  locationKey: string;
  venueName: string;
  address: string;
}

const BRAND = '#2F80ED';
const DURATIONS: CheckInDurationMinutes[] = [30, 60, 120];

function messageForError(error: unknown) {
  return error instanceof SocialServiceError || error instanceof Error
    ? error.message
    : 'The check-in could not be completed.';
}

function audienceCount(mode: CheckInAudienceMode, friends: FriendProjection[], selected: string[]) {
  return mode === 'all_friends' ? friends.length : selected.length;
}

export default function CheckInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ venueId?: string }>();
  const { user } = useAuth();
  const clusters = useMapStore((state) => state.clusters);
  const selectedVenues = useMapStore((state) => state.selectedVenues);
  const { friends, ownCheckIn, fromCache } = useSocialStore();
  const options = useMemo(() => {
    const byId = new Map<string, RecognizedVenueOption>();
    for (const cluster of clusters) {
      for (const venue of cluster.venues) {
        const venueId = getRecognizedVenueId(venue);
        if (!venueId || byId.has(venueId)) continue;
        byId.set(venueId, {
          venueId,
          locationKey: venue.locationKey,
          venueName: venue.venue,
          address: venue.address,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.venueName.localeCompare(b.venueName));
  }, [clusters]);

  const initialVenueId = useMemo(() => {
    const requested = String(params.venueId || '');
    if (requested && options.some((option) => option.venueId === requested)) return requested;
    for (const venue of selectedVenues) {
      const venueId = getRecognizedVenueId(venue);
      if (venueId) return venueId;
    }
    return '';
  }, [options, params.venueId, selectedVenues]);

  const [venueId, setVenueId] = useState(initialVenueId);
  const [venueQuery, setVenueQuery] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<CheckInDurationMinutes>(60);
  const [audienceMode, setAudienceMode] = useState<CheckInAudienceMode>('all_friends');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingOperationRef = useRef<{ fingerprint: string; operationId: string } | null>(null);

  useEffect(() => {
    if (!venueId && initialVenueId) setVenueId(initialVenueId);
  }, [initialVenueId, venueId]);

  const selectedVenue = options.find((option) => option.venueId === venueId) ?? null;
  const filteredOptions = useMemo(() => {
    const query = venueQuery.trim().toLowerCase();
    if (!query) return options.slice(0, 25);
    return options.filter((option) =>
      `${option.venueName} ${option.address}`.toLowerCase().includes(query)
    ).slice(0, 25);
  }, [options, venueQuery]);
  const currentAudienceCount = audienceCount(audienceMode, friends, selectedUids);
  const estimatedExpiry = Date.now() + durationMinutes * 60_000;

  const toggleFriend = (uid: string) => setSelectedUids((current) =>
    current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid]
  );

  const submit = async () => {
    if (!selectedVenue) {
      Alert.alert('Choose a venue', 'Check-ins are available only at recognized GathR venues.');
      return;
    }
    if (audienceMode === 'selected_friends' && selectedUids.length === 0) {
      Alert.alert('Choose at least one friend', 'Or switch the audience to all friends.');
      return;
    }

    const perform = async () => {
      setBusy(true);
      try {
        const input = {
          venueId: selectedVenue.venueId,
          durationMinutes,
          audienceMode,
          selectedUids: audienceMode === 'selected_friends' ? [...selectedUids].sort() : undefined,
          message,
        };
        const fingerprint = JSON.stringify(input);
        if (pendingOperationRef.current?.fingerprint !== fingerprint) {
          pendingOperationRef.current = {
            fingerprint,
            operationId: createSocialOperationId(),
          };
        }
        const result = await createCheckIn({
          ...input,
          operationId: pendingOperationRef.current.operationId,
        });
        pendingOperationRef.current = null;
        Alert.alert(
          ownCheckIn ? 'Check-in updated' : 'Checked in',
          formatCheckInVisibilityCopy(result.viewerCount, result.expiresAt),
          [{ text: 'View map', onPress: () => router.back() }]
        );
      } catch (error) {
        Alert.alert('Could not check in', messageForError(error));
      } finally {
        setBusy(false);
      }
    };

    if (ownCheckIn) {
      Alert.alert(
        'Replace your active check-in?',
        `Your check-in at ${ownCheckIn.venueNameSnapshot} will be replaced and its previous audience will lose access immediately.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', onPress: () => void perform() },
        ]
      );
    } else {
      Alert.alert(
        `Check in at ${selectedVenue.venueName}?`,
        formatCheckInVisibilityCopy(currentAudienceCount, estimatedExpiry),
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Check in', onPress: () => void perform() },
        ]
      );
    }
  };

  const checkout = () => Alert.alert(
    'Check out now?',
    'Your presence will disappear from every friend’s map.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Check out',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void checkOut()
            .then(() => Alert.alert('Checked out', 'Your check-in is no longer visible.'))
            .catch((error) => Alert.alert('Could not check out', messageForError(error)))
            .finally(() => setBusy(false));
        },
      },
    ]
  );

  if (!SOCIAL_FEATURE_ENABLED || !user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>{user ? 'Check-ins unavailable' : 'Sign in to check in'}</Text>
          <Text style={styles.muted}>Check-ins are explicit and temporary; GathR does not continuously track friends.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityLabel="Close check-in" onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="close" size={25} color="#101828" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Check in</Text>
            <Text style={styles.muted}>Share a venue, never continuous location.</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {fromCache && <Text style={styles.offlineBanner}>Offline: you can view saved state, but changing a check-in requires a connection.</Text>}

          {ownCheckIn && (
            <View style={[styles.card, styles.activeCard]}>
              <View style={styles.rowBetween}>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>Currently at {ownCheckIn.venueNameSnapshot}</Text>
                  <Text style={styles.muted}>
                    {formatCheckInVisibilityCopy(ownCheckIn.viewerCount, ownCheckIn.expiresAt)}
                  </Text>
                </View>
                <TouchableOpacity accessibilityLabel="Check out now" disabled={busy} onPress={checkout} style={styles.checkoutButton}>
                  <Text style={styles.checkoutText}>Check out</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>1. Recognized venue</Text>
            {selectedVenue && (
              <View style={styles.selectedVenue}>
                <Ionicons name="location" size={20} color={BRAND} />
                <View style={styles.flex}>
                  <Text style={styles.venueName}>{selectedVenue.venueName}</Text>
                  <Text style={styles.muted} numberOfLines={1}>{selectedVenue.address}</Text>
                </View>
                <TouchableOpacity onPress={() => setVenueId('')} accessibilityLabel="Change venue">
                  <Text style={styles.linkText}>Change</Text>
                </TouchableOpacity>
              </View>
            )}
            {!selectedVenue && (
              <>
                <TextInput
                  value={venueQuery}
                  onChangeText={setVenueQuery}
                  placeholder="Search venues loaded on the map"
                  accessibilityLabel="Search recognized GathR venues"
                  style={styles.input}
                />
                {filteredOptions.map((option) => (
                  <TouchableOpacity key={option.venueId} onPress={() => setVenueId(option.venueId)} style={styles.venueOption}>
                    <Ionicons name="business-outline" size={19} color="#475467" />
                    <View style={styles.flex}>
                      <Text style={styles.venueName}>{option.venueName}</Text>
                      <Text style={styles.muted} numberOfLines={1}>{option.address}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {options.length === 0 && <Text style={styles.emptyText}>Move the map to load recognized venues, then try again.</Text>}
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>2. Duration</Text>
            <View style={styles.choiceRow}>
              {DURATIONS.map((duration) => (
                <TouchableOpacity
                  key={duration}
                  accessibilityState={{ selected: durationMinutes === duration }}
                  onPress={() => setDurationMinutes(duration)}
                  style={[styles.choice, durationMinutes === duration && styles.choiceSelected]}
                >
                  <Text style={[styles.choiceText, durationMinutes === duration && styles.choiceTextSelected]}>
                    {duration < 60 ? '30 min' : `${duration / 60} hr`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>3. Who can see it</Text>
            <TouchableOpacity onPress={() => setAudienceMode('all_friends')} style={styles.radioRow} accessibilityState={{ selected: audienceMode === 'all_friends' }}>
              <Ionicons name={audienceMode === 'all_friends' ? 'radio-button-on' : 'radio-button-off'} size={22} color={BRAND} />
              <Text style={styles.radioText}>All accepted friends ({friends.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAudienceMode('selected_friends')} style={styles.radioRow} accessibilityState={{ selected: audienceMode === 'selected_friends' }}>
              <Ionicons name={audienceMode === 'selected_friends' ? 'radio-button-on' : 'radio-button-off'} size={22} color={BRAND} />
              <Text style={styles.radioText}>Selected friends ({selectedUids.length})</Text>
            </TouchableOpacity>
            {audienceMode === 'selected_friends' && friends.map((friend) => (
              <TouchableOpacity key={friend.uid} onPress={() => toggleFriend(friend.uid)} style={styles.friendChoice} accessibilityState={{ checked: selectedUids.includes(friend.uid) }}>
                <Ionicons name={selectedUids.includes(friend.uid) ? 'checkbox' : 'square-outline'} size={22} color={BRAND} />
                <Text style={styles.radioText}>{friend.displayName} <Text style={styles.muted}>@{friend.socialHandle}</Text></Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>4. Optional note</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              maxLength={120}
              multiline
              placeholder="e.g. On the patio"
              accessibilityLabel="Optional check-in note"
              style={[styles.input, styles.messageInput]}
            />
            <Text style={styles.counter}>{message.length}/120</Text>
          </View>

          <Text style={styles.confirmationCopy}>
            {formatCheckInVisibilityCopy(currentAudienceCount, estimatedExpiry)}
          </Text>
          <TouchableOpacity accessibilityLabel={ownCheckIn ? 'Replace active check-in' : 'Confirm check-in'} disabled={busy || fromCache} onPress={() => void submit()} style={[styles.primaryButton, (busy || fromCache) && styles.disabled]}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>{ownCheckIn ? 'Replace check-in' : 'Check in'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F8FB' },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D0D5DD' },
  headerText: { flex: 1 },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 25, fontWeight: '800', color: '#101828' },
  content: { padding: 16, gap: 14, paddingBottom: 42 },
  card: { backgroundColor: '#FFF', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E4E7EC', borderRadius: 16, padding: 16, gap: 11 },
  activeCard: { borderColor: '#53B1FD', backgroundColor: '#EFF8FF' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#101828' },
  muted: { color: '#667085', lineHeight: 19 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkoutButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 9, backgroundColor: '#FEE4E2' },
  checkoutText: { color: '#B42318', fontWeight: '700' },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 10, paddingHorizontal: 12, color: '#101828', backgroundColor: '#FFF' },
  messageInput: { minHeight: 86, textAlignVertical: 'top', paddingTop: 12 },
  counter: { alignSelf: 'flex-end', color: '#667085' },
  selectedVenue: { flexDirection: 'row', gap: 9, alignItems: 'center', borderRadius: 11, padding: 12, backgroundColor: '#EFF8FF' },
  venueOption: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 56, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0' },
  venueName: { color: '#101828', fontWeight: '700' },
  linkText: { color: '#175CD3', fontWeight: '700' },
  choiceRow: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 10 },
  choiceSelected: { borderColor: BRAND, backgroundColor: '#EFF8FF' },
  choiceText: { color: '#475467', fontWeight: '600' },
  choiceTextSelected: { color: '#175CD3' },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 43 },
  friendChoice: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 42, paddingLeft: 14 },
  radioText: { flex: 1, color: '#344054', fontWeight: '600' },
  confirmationCopy: { color: '#344054', textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },
  primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 12, paddingHorizontal: 20 },
  primaryText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.45 },
  offlineBanner: { backgroundColor: '#FFF4CC', color: '#7A5D00', padding: 10, borderRadius: 10 },
  emptyText: { color: '#667085', fontStyle: 'italic' },
});
