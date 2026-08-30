import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
  const params = useLocalSearchParams<{ venueId?: string; eligibilitySessionId?: string }>();
  const { user } = useAuth();
  const allEvents = useMapStore((state) => state.allEvents);
  const selectedVenues = useMapStore((state) => state.selectedVenues);
  const { friends, ownCheckIn, fromCache } = useSocialStore();
  const options = useMemo(() => {
    const byId = new Map<string, RecognizedVenueOption>();
    for (const event of allEvents) {
      const venueId = String(event.venueId || '').trim();
      if (
        !venueId
        || byId.has(venueId)
        || event.locationScope === 'city'
        || event.locationScope === 'area'
        || event.locationScope === 'route'
        || event.locationScope === 'unknown'
      ) continue;
      byId.set(venueId, {
        venueId,
        locationKey: `venue:${venueId}`,
        venueName: event.venue || event.title || 'GathR venue',
        address: event.address || '',
      });
    }
    return [...byId.values()].sort((a, b) => a.venueName.localeCompare(b.venueName));
  }, [allEvents]);

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
  const [venuePickerVisible, setVenuePickerVisible] = useState(false);
  const [audiencePickerVisible, setAudiencePickerVisible] = useState(false);
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
  const eligibilitySessionId = String(params.eligibilitySessionId || '').trim();
  const canReuseActiveVenue = Boolean(ownCheckIn && ownCheckIn.venueId === venueId);
  const hasContextualEligibility = Boolean(eligibilitySessionId && String(params.venueId || '') === venueId);
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
  const canSubmit = !!selectedVenue
    && (canReuseActiveVenue || hasContextualEligibility)
    && hasAudience
    && !busy
    && !fromCache;
  const selectedFriendNames = friends
    .filter((friend) => selectedUids.includes(friend.uid))
    .map((friend) => friend.displayName);
  const audienceSummary = audienceMode === 'all_friends'
    ? `${friends.length} accepted friend${friends.length === 1 ? '' : 's'}`
    : selectedFriendNames.length === 0
      ? 'Choose at least one friend'
      : selectedFriendNames.length <= 2
        ? selectedFriendNames.join(', ')
        : `${selectedFriendNames.slice(0, 2).join(', ')} +${selectedFriendNames.length - 2}`;

  const toggleFriend = (uid: string) => setSelectedUids((current) =>
    current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid]
  );

  const chooseVenue = (nextVenueId: string) => {
    setVenueId(nextVenueId);
    setVenueQuery('');
    setVenuePickerVisible(false);
  };

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
          eligibilitySessionId: canReuseActiveVenue ? undefined : eligibilitySessionId,
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
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
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

        <View style={styles.content}>
          {fromCache && <Text maxFontSizeMultiplier={1.15} numberOfLines={2} style={styles.offlineBanner}>Offline: changing a check-in requires a connection.</Text>}

          {ownCheckIn && !isEditing && (
            <View style={[styles.card, styles.activeCard]}>
              <View style={styles.activeHeading}>
                <View style={styles.activeIcon}>
                  <Ionicons name="location" size={22} color="#175CD3" />
                </View>
                <View style={styles.flex}>
                  <Text maxFontSizeMultiplier={1.1} style={styles.activeEyebrow}>ACTIVE NOW</Text>
                  <Text maxFontSizeMultiplier={1.2} numberOfLines={2} style={styles.sectionTitle}>{ownCheckIn.venueNameSnapshot}</Text>
                </View>
              </View>
              <Text maxFontSizeMultiplier={1.15} style={styles.muted}>
                {formatCheckInVisibilityCopy(ownCheckIn.viewerCount, ownCheckIn.expiresAt)}
              </Text>
              {!!ownCheckIn.message && (
                <Text maxFontSizeMultiplier={1.15} numberOfLines={3} style={styles.activeMessage}>“{ownCheckIn.message}”</Text>
              )}
              <View style={styles.activeActions}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="View check-in on map" onPress={() => router.replace('/(tabs)/map')} style={styles.secondaryButton}>
                  <Ionicons name="map-outline" size={18} color="#175CD3" />
                  <Text maxFontSizeMultiplier={1.1} style={styles.secondaryText}>View map</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Change active check-in" onPress={beginEditing} style={styles.secondaryButton}>
                  <Ionicons name="create-outline" size={18} color="#175CD3" />
                  <Text maxFontSizeMultiplier={1.1} style={styles.secondaryText}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Check out now" disabled={busy} onPress={checkout} style={styles.checkoutButton}>
                  <Text maxFontSizeMultiplier={1.1} style={styles.checkoutText}>Check out</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {isEditing && (
            <View style={styles.formSurface}>
              {ownCheckIn && (
                <View style={styles.activeStrip}>
                  <Ionicons name="location" size={20} color="#175CD3" />
                  <View style={styles.flex}>
                    <Text maxFontSizeMultiplier={1.1} style={styles.activeEyebrow}>CHANGING ACTIVE CHECK-IN</Text>
                    <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={styles.stripVenue}>{ownCheckIn.venueNameSnapshot}</Text>
                  </View>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel check-in changes" onPress={() => setIsEditing(false)} style={styles.compactIconButton}>
                    <Ionicons name="close" size={20} color="#344054" />
                  </TouchableOpacity>
                </View>
              )}

              <LinearGradient
                colors={['#175CD3', '#2F80ED', '#53B1FD']}
                end={{ x: 1, y: 1 }}
                start={{ x: 0, y: 0 }}
                style={styles.venueHero}
              >
                <View pointerEvents="none" style={styles.canopyLarge} />
                <View pointerEvents="none" style={styles.canopySmall} />
                <View style={styles.heroIcon}>
                  <Ionicons name="location" size={22} color="#175CD3" />
                </View>
                <View style={styles.flex}>
                  <Text maxFontSizeMultiplier={1.1} style={styles.heroEyebrow}>
                    {selectedVenue ? "YOU'RE AT" : 'LOCATION REQUIRED'}
                  </Text>
                  <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.heroVenue}>
                    {selectedVenue?.venueName || 'Return to the map'}
                  </Text>
                  <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.heroAddress}>
                    {selectedVenue?.address || 'Check-in appears after you remain at a recognized location.'}
                  </Text>
                </View>
                {(hasContextualEligibility || canReuseActiveVenue) && (
                  <View style={styles.verifiedPill}>
                    <Ionicons name="checkmark" size={13} color="#175CD3" />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                )}
              </LinearGradient>

              {!canReuseActiveVenue && !hasContextualEligibility && (
                <View style={styles.contextWarning}>
                  <Ionicons name="walk-outline" size={18} color="#B54708" />
                  <Text style={styles.contextWarningText}>Return to the map and remain near the venue until check-in becomes available.</Text>
                </View>
              )}

              <View style={styles.fieldGroup}>
                <Text maxFontSizeMultiplier={1.15} style={styles.fieldLabel}>Duration</Text>
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
                      <Text maxFontSizeMultiplier={1.1} style={[styles.choiceText, durationMinutes === duration && styles.choiceTextSelected]}>
                        {duration < 60 ? '30 min' : `${duration / 60} hr`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text maxFontSizeMultiplier={1.15} style={styles.fieldLabel}>Visible to</Text>
                <View style={styles.choiceRow}>
                  <TouchableOpacity
                    accessibilityRole="radio"
                    accessibilityLabel={`All accepted friends, ${friends.length}`}
                    accessibilityState={{ selected: audienceMode === 'all_friends' }}
                    onPress={() => setAudienceMode('all_friends')}
                    style={[styles.audienceChoice, audienceMode === 'all_friends' && styles.choiceSelected]}
                  >
                    <Ionicons name="people" size={18} color={audienceMode === 'all_friends' ? '#175CD3' : '#667085'} />
                    <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={[styles.choiceText, audienceMode === 'all_friends' && styles.choiceTextSelected]}>All friends</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="radio"
                    accessibilityLabel={`Selected friends, ${selectedUids.length}`}
                    accessibilityState={{ selected: audienceMode === 'selected_friends' }}
                    onPress={() => { setAudienceMode('selected_friends'); if (friends.length > 0) setAudiencePickerVisible(true); }}
                    style={[styles.audienceChoice, audienceMode === 'selected_friends' && styles.choiceSelected]}
                  >
                    <Ionicons name="person-add" size={18} color={audienceMode === 'selected_friends' ? '#175CD3' : '#667085'} />
                    <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={[styles.choiceText, audienceMode === 'selected_friends' && styles.choiceTextSelected]}>Choose</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Audience: ${audienceSummary}`}
                  disabled={audienceMode === 'all_friends' || friends.length === 0}
                  onPress={() => setAudiencePickerVisible(true)}
                  style={styles.audienceSummaryRow}
                >
                  <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={[styles.audienceSummary, !hasAudience && styles.warningText]}>{audienceSummary}</Text>
                  {audienceMode === 'selected_friends' && friends.length > 0 && <Text maxFontSizeMultiplier={1.1} style={styles.linkText}>Edit</Text>}
                </TouchableOpacity>
              </View>

              <View style={styles.fieldGroup}>
                <View style={styles.noteHeading}>
                  <Text maxFontSizeMultiplier={1.15} style={styles.fieldLabel}>Note <Text style={styles.optionalLabel}>optional</Text></Text>
                  <Text maxFontSizeMultiplier={1} style={styles.counter}>{message.length}/120</Text>
                </View>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  maxLength={120}
                  placeholder="e.g. On the patio"
                  accessibilityLabel="Optional check-in note"
                  returnKeyType="done"
                  style={styles.input}
                />
              </View>

              <View style={styles.submitArea}>
                <View style={styles.privacyPill}>
                  <Ionicons name="lock-closed" size={15} color="#175CD3" />
                  <Text maxFontSizeMultiplier={1.1} numberOfLines={2} style={styles.confirmationCopy}>
                    {formatCheckInVisibilityCopy(currentAudienceCount, estimatedExpiry)}
                  </Text>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={ownCheckIn ? 'Replace active check-in' : 'Confirm check-in'} disabled={!canSubmit} onPress={() => void submit()} style={[styles.primaryButton, !canSubmit && styles.disabled]}>
                  {busy ? <ActivityIndicator color="#FFF" /> : <Text maxFontSizeMultiplier={1.1} style={styles.primaryText}>{ownCheckIn ? 'Replace check-in' : 'Check in'}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal animationType="slide" onRequestClose={() => setVenuePickerVisible(false)} transparent visible={venuePickerVisible}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <View style={styles.flex}>
                <Text style={styles.pickerTitle}>Choose a venue</Text>
                <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.muted}>Loaded from your current map</Text>
              </View>
              <TouchableOpacity accessibilityLabel="Close venue picker" onPress={() => { setVenueQuery(''); setVenuePickerVisible(false); }} style={styles.compactIconButton}>
                <Ionicons name="close" size={23} color="#344054" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearch}>
              <Ionicons name="search" size={19} color="#667085" />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setVenueQuery}
                placeholder="Search name or address"
                accessibilityLabel="Search recognized GathR venues"
                style={styles.pickerInput}
                value={venueQuery}
              />
            </View>
            <ScrollView contentContainerStyle={styles.pickerList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.pickerScroller}>
              {filteredOptions.map((option) => (
                <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: option.venueId === venueId }} accessibilityLabel={`Choose ${option.venueName}`} key={option.venueId} onPress={() => chooseVenue(option.venueId)} style={styles.venueOption}>
                  <View style={styles.selectorIcon}><Ionicons name="business-outline" size={19} color="#475467" /></View>
                  <View style={styles.flex}>
                    <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={styles.venueName}>{option.venueName}</Text>
                    <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.muted}>{option.address}</Text>
                  </View>
                  <Ionicons name={option.venueId === venueId ? 'checkmark-circle' : 'chevron-forward'} size={21} color={option.venueId === venueId ? BRAND : '#98A2B3'} />
                </TouchableOpacity>
              ))}
              {options.length === 0 && <Text style={styles.emptyText}>Move the map to load recognized venues, then try again.</Text>}
              {options.length > 0 && filteredOptions.length === 0 && <Text style={styles.emptyText}>No loaded venue matches that search.</Text>}
              {!venueQuery.trim() && options.length > filteredOptions.length && <Text style={styles.helperText}>Search to see the rest of the loaded venues.</Text>}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setAudiencePickerVisible(false)} transparent visible={audiencePickerVisible}>
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <View style={styles.flex}>
                <Text style={styles.pickerTitle}>Choose friends</Text>
                <Text maxFontSizeMultiplier={1.1} style={styles.muted}>Only the people you select can see this check-in.</Text>
              </View>
              <TouchableOpacity accessibilityLabel="Close friend picker" onPress={() => setAudiencePickerVisible(false)} style={styles.compactIconButton}>
                <Ionicons name="close" size={23} color="#344054" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.pickerList} showsVerticalScrollIndicator={false} style={styles.pickerScroller}>
              {friends.map((friend) => (
                <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={`${friend.displayName}, @${friend.socialHandle}`} accessibilityState={{ checked: selectedUids.includes(friend.uid) }} key={friend.uid} onPress={() => toggleFriend(friend.uid)} style={styles.friendChoice}>
                  <View style={styles.friendAvatar}>
                    <Text style={styles.friendInitial}>{friend.displayName.trim().charAt(0).toUpperCase() || '?'}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={styles.venueName}>{friend.displayName}</Text>
                    <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.muted}>@{friend.socialHandle}</Text>
                  </View>
                  <Ionicons name={selectedUids.includes(friend.uid) ? 'checkbox' : 'square-outline'} size={24} color={BRAND} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Done choosing friends, ${selectedUids.length} selected`} disabled={selectedUids.length === 0} onPress={() => setAudiencePickerVisible(false)} style={[styles.primaryButton, selectedUids.length === 0 && styles.disabled]}>
              <Text maxFontSizeMultiplier={1.1} style={styles.primaryText}>Done · {selectedUids.length} selected</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F8FB' },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D0D5DD' },
  headerText: { flex: 1, minWidth: 0 },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  compactIconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#101828' },
  content: { flex: 1, padding: 12, gap: 10, minHeight: 0 },
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
  formSurface: { flex: 1, minHeight: 0, gap: 9, padding: 12, borderRadius: 20, backgroundColor: '#FFF', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E4E7EC', shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 },
  activeStrip: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 11, backgroundColor: '#EFF8FF' },
  stripVenue: { color: '#101828', fontWeight: '700', marginTop: 1 },
  venueHero: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden', paddingHorizontal: 13, paddingVertical: 12, borderRadius: 16 },
  canopyLarge: { position: 'absolute', width: 118, height: 118, borderRadius: 59, right: -38, top: -55, backgroundColor: 'rgba(255,255,255,0.13)' },
  canopySmall: { position: 'absolute', width: 72, height: 72, borderRadius: 36, right: 27, bottom: -42, backgroundColor: 'rgba(255,255,255,0.10)' },
  heroIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  heroEyebrow: { color: '#DCEBFF', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  heroVenue: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginTop: 2 },
  heroAddress: { color: '#EAF2FF', fontSize: 12, marginTop: 2 },
  verifiedPill: { position: 'absolute', right: 10, top: 9, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FFFFFF' },
  verifiedText: { color: '#175CD3', fontSize: 10, fontWeight: '800' },
  contextWarning: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11, backgroundColor: '#FFFAEB' },
  contextWarningText: { flex: 1, color: '#B54708', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  fieldGroup: { gap: 5 },
  fieldLabel: { color: '#344054', fontSize: 13, fontWeight: '800' },
  optionalLabel: { color: '#667085', fontWeight: '500' },
  selectorButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 11, backgroundColor: '#FFF' },
  selectorIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF8FF' },
  selectorPlaceholder: { color: '#475467', fontWeight: '600' },
  selectorDetail: { color: '#667085', fontSize: 12, marginTop: 1 },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 10, paddingHorizontal: 11, color: '#101828', backgroundColor: '#FFF' },
  noteHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { color: '#667085', fontSize: 12 },
  venueOption: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 60, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0' },
  venueName: { color: '#101828', fontWeight: '700' },
  linkText: { color: '#175CD3', fontWeight: '700' },
  choiceRow: { flexDirection: 'row', gap: 7 },
  choice: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 9 },
  choiceSelected: { borderColor: BRAND, backgroundColor: '#EFF8FF' },
  choiceText: { color: '#475467', fontWeight: '600' },
  choiceTextSelected: { color: '#175CD3' },
  audienceChoice: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 9, paddingHorizontal: 8 },
  audienceSummaryRow: { minHeight: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 2 },
  audienceSummary: { flex: 1, color: '#667085', fontSize: 12 },
  warningText: { color: '#B54708' },
  friendChoice: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0' },
  friendAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCEBFF' },
  friendInitial: { color: '#175CD3', fontWeight: '800' },
  submitArea: { marginTop: 'auto', gap: 7, paddingTop: 3 },
  privacyPill: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: '#EFF8FF' },
  confirmationCopy: { flexShrink: 1, color: '#175CD3', textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 14, paddingHorizontal: 20, shadowColor: '#175CD3', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 7, elevation: 3 },
  primaryText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.45 },
  offlineBanner: { backgroundColor: '#FFF4CC', color: '#7A5D00', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  emptyText: { color: '#667085', fontStyle: 'italic', textAlign: 'center', padding: 18 },
  helperText: { color: '#667085', fontSize: 13, lineHeight: 18, textAlign: 'center', paddingVertical: 10 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', paddingTop: 40, backgroundColor: 'rgba(16, 24, 40, 0.48)' },
  pickerCard: { maxHeight: '88%', minHeight: 320, gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#FFF' },
  pickerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pickerTitle: { color: '#101828', fontSize: 21, fontWeight: '800' },
  pickerSearch: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 11, backgroundColor: '#FFF' },
  pickerInput: { flex: 1, minHeight: 44, color: '#101828' },
  pickerScroller: { flexShrink: 1 },
  pickerList: { paddingBottom: 8 },
});
