import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
  const [isEditing, setIsEditing] = useState(!ownCheckIn);
  const pendingOperationRef = useRef<{ fingerprint: string; operationId: string } | null>(null);
  const activeRevisionRef = useRef<string | null>(ownCheckIn?.revision ?? null);

  useEffect(() => {
    if (!venueId && initialVenueId) setVenueId(initialVenueId);
  }, [initialVenueId, venueId]);

  useEffect(() => {
    setSelectedUids((current) => current.filter((uid) =>
      friends.some((friend) => friend.uid === uid)
    ));
  }, [friends]);

  useEffect(() => {
    const revision = ownCheckIn?.revision ?? null;
    if (revision && revision !== activeRevisionRef.current) setIsEditing(false);
    if (!revision && activeRevisionRef.current) setIsEditing(true);
    activeRevisionRef.current = revision;
  }, [ownCheckIn?.revision]);

  const selectedVenue = options.find((option) => option.venueId === venueId) ?? null;
  const filteredOptions = useMemo(() => {
    const query = venueQuery.trim().toLowerCase();
    if (!query) return options.slice(0, 8);
    return options.filter((option) =>
      `${option.venueName} ${option.address}`.toLowerCase().includes(query)
    ).slice(0, 25);
  }, [options, venueQuery]);
  const currentAudienceCount = audienceCount(audienceMode, friends, selectedUids);
  const estimatedExpiry = Date.now() + durationMinutes * 60_000;
  const hasAudience = audienceMode === 'all_friends'
    ? friends.length > 0
    : selectedUids.length > 0;
  const canSubmit = !!selectedVenue && hasAudience && !busy && !fromCache;

  const toggleFriend = (uid: string) => setSelectedUids((current) =>
    current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid]
  );

  const beginEditing = () => {
    if (ownCheckIn) {
      setVenueId(ownCheckIn.venueId);
      setDurationMinutes(ownCheckIn.durationMinutes);
      setAudienceMode(ownCheckIn.audienceMode);
      setSelectedUids(ownCheckIn.selectedUids.filter((uid) =>
        friends.some((friend) => friend.uid === uid)
      ));
      setMessage(ownCheckIn.message);
    }
    setIsEditing(true);
  };

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
          [{ text: 'View map', onPress: () => router.replace('/(tabs)/map') }]
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
        <StatusBar style="dark" backgroundColor="#F6F8FB" />
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
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityLabel="Close check-in" onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="close" size={25} color="#101828" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>{ownCheckIn && !isEditing ? 'Your check-in' : ownCheckIn ? 'Update check-in' : 'Check in'}</Text>
            <Text style={styles.muted}>Share a venue, never continuous location.</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {fromCache && <Text style={styles.offlineBanner}>Offline: you can view saved state, but changing a check-in requires a connection.</Text>}

          {ownCheckIn && (
            <View style={[styles.card, styles.activeCard]}>
              <View style={styles.activeHeading}>
                <View style={styles.activeIcon}>
                  <Ionicons name="location" size={22} color="#175CD3" />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.activeEyebrow}>ACTIVE NOW</Text>
                  <Text style={styles.sectionTitle}>{ownCheckIn.venueNameSnapshot}</Text>
                </View>
              </View>
              <Text style={styles.muted}>
                {formatCheckInVisibilityCopy(ownCheckIn.viewerCount, ownCheckIn.expiresAt)}
              </Text>
              {!!ownCheckIn.message && (
                <Text style={styles.activeMessage}>“{ownCheckIn.message}”</Text>
              )}
              <View style={styles.activeActions}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="View check-in on map" onPress={() => router.replace('/(tabs)/map')} style={styles.secondaryButton}>
                  <Ionicons name="map-outline" size={18} color="#175CD3" />
                  <Text style={styles.secondaryText}>View map</Text>
                </TouchableOpacity>
                {!isEditing && (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Change active check-in" onPress={beginEditing} style={styles.secondaryButton}>
                    <Ionicons name="create-outline" size={18} color="#175CD3" />
                    <Text style={styles.secondaryText}>Change</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Check out now" disabled={busy} onPress={checkout} style={styles.checkoutButton}>
                  <Text style={styles.checkoutText}>Check out</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {isEditing && (
          <>
          {ownCheckIn && (
            <View style={styles.editingHeader}>
              <Text style={styles.editingTitle}>Change your check-in</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => setIsEditing(false)}>
                <Text style={styles.linkText}>Cancel changes</Text>
              </TouchableOpacity>
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
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Choose ${option.venueName}`} key={option.venueId} onPress={() => setVenueId(option.venueId)} style={styles.venueOption}>
                    <Ionicons name="business-outline" size={19} color="#475467" />
                    <View style={styles.flex}>
                      <Text style={styles.venueName}>{option.venueName}</Text>
                      <Text style={styles.muted} numberOfLines={1}>{option.address}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {options.length === 0 && <Text style={styles.emptyText}>Move the map to load recognized venues, then try again.</Text>}
                {!venueQuery.trim() && options.length > 8 && (
                  <Text style={styles.helperText}>Search to see more of the venues currently loaded on your map.</Text>
                )}
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>2. Duration</Text>
            <View style={styles.choiceRow}>
              {DURATIONS.map((duration) => (
                <TouchableOpacity
                  key={duration}
                  accessibilityRole="radio"
                  accessibilityLabel={`${duration} minute check-in`}
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
            {friends.length === 0 && (
              <View style={styles.audienceNotice}>
                <Ionicons name="people-outline" size={20} color="#175CD3" />
                <Text style={styles.audienceNoticeText}>Add an accepted friend before checking in so someone can actually see it.</Text>
              </View>
            )}
            <TouchableOpacity accessibilityRole="radio" accessibilityLabel={`All accepted friends, ${friends.length}`} onPress={() => setAudienceMode('all_friends')} style={styles.radioRow} accessibilityState={{ selected: audienceMode === 'all_friends' }}>
              <Ionicons name={audienceMode === 'all_friends' ? 'radio-button-on' : 'radio-button-off'} size={22} color={BRAND} />
              <Text style={styles.radioText}>All accepted friends ({friends.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="radio" accessibilityLabel={`Selected friends, ${selectedUids.length}`} onPress={() => setAudienceMode('selected_friends')} style={styles.radioRow} accessibilityState={{ selected: audienceMode === 'selected_friends' }}>
              <Ionicons name={audienceMode === 'selected_friends' ? 'radio-button-on' : 'radio-button-off'} size={22} color={BRAND} />
              <Text style={styles.radioText}>Selected friends ({selectedUids.length})</Text>
            </TouchableOpacity>
            {audienceMode === 'selected_friends' && friends.map((friend) => (
              <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={`${friend.displayName}, @${friend.socialHandle}`} key={friend.uid} onPress={() => toggleFriend(friend.uid)} style={styles.friendChoice} accessibilityState={{ checked: selectedUids.includes(friend.uid) }}>
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
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={ownCheckIn ? 'Replace active check-in' : 'Confirm check-in'} disabled={!canSubmit} onPress={() => void submit()} style={[styles.primaryButton, !canSubmit && styles.disabled]}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>{ownCheckIn ? 'Replace check-in' : 'Check in'}</Text>}
          </TouchableOpacity>
          </>
          )}
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
  activeHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  activeIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#DCEBFF' },
  activeEyebrow: { color: '#175CD3', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 2 },
  activeMessage: { color: '#344054', fontStyle: 'italic', lineHeight: 20 },
  activeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  secondaryButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B2DDFF' },
  secondaryText: { color: '#175CD3', fontWeight: '700' },
  checkoutButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 9, backgroundColor: '#FEE4E2' },
  checkoutText: { color: '#B42318', fontWeight: '700' },
  editingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 2 },
  editingTitle: { flex: 1, color: '#101828', fontSize: 18, fontWeight: '800' },
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
  helperText: { color: '#667085', fontSize: 13, lineHeight: 18 },
  audienceNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 11, borderRadius: 10, backgroundColor: '#EFF8FF' },
  audienceNoticeText: { flex: 1, color: '#344054', lineHeight: 19 },
});
