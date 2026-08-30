import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../contexts/AuthContext';
import { EVENT_CATEGORIES } from '../constants/eventCategories';
import { createFriendEvent, createSocialOperationId, geocodeFriendEventAddress, updateFriendEvent } from '../services/socialService';
import { useMapStore } from '../store';
import { useSocialStore } from '../store/socialStore';
import type {
  FriendEventGuestInviteMode,
  FriendEventInput,
  FriendEventLocationInput,
  FriendEventLocationType,
  FriendEventVisibility,
} from '../types/social';
import {
  findFriendEventLocation,
  socialTimeToMillis,
} from '../utils/friendEvents';

const BRAND = '#2F80ED';
const PURPLE = '#6941C6';
const STEPS = ['Basics', 'Location', 'Guests'] as const;
const DURATIONS = [60, 120, 180, 240];

interface VenueOption {
  venueId: string;
  name: string;
  address: string;
}

interface Draft {
  title: string;
  description: string;
  externalUrl: string;
  category: string;
  date: string;
  time: string;
  durationMinutes: number;
  locationType: FriendEventLocationType;
  venueId: string;
  customPlaceName: string;
  customAddress: string;
  customCoordinates: { latitude: number; longitude: number } | null;
  onlineUrl: string;
  revealChoice: 'now' | 'two_hours' | 'start';
  visibility: FriendEventVisibility;
  selectedUids: string[];
  guestInviteMode: FriendEventGuestInviteMode;
  guestListVisible: boolean;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function defaultDateParts() {
  const date = new Date(Date.now() + 2 * 60 * 60_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function parseLocalDateTime(dateText: string, timeText: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !/^\d{2}:\d{2}$/.test(timeText)) return null;
  const value = new Date(`${dateText}T${timeText}:00`);
  return Number.isFinite(value.getTime()) ? value.getTime() : null;
}

function initialDraft(): Draft {
  const parts = defaultDateParts();
  return {
    title: '',
    description: '',
    externalUrl: '',
    category: '',
    date: parts.date,
    time: parts.time,
    durationMinutes: 120,
    locationType: 'custom_address',
    venueId: '',
    customPlaceName: '',
    customAddress: '',
    customCoordinates: null,
    onlineUrl: '',
    revealChoice: 'now',
    visibility: 'selected_friends',
    selectedUids: [],
    guestInviteMode: 'host_only',
    guestListVisible: true,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The event could not be saved.';
}

export default function CreateEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string }>();
  const { user } = useAuth();
  const allEvents = useMapStore((state) => state.allEvents);
  const friends = useSocialStore((state) => state.friends);
  const friendEvents = useSocialStore((state) => state.friendEvents);
  const locations = useSocialStore((state) => state.friendEventLocations);
  const eventId = String(params.eventId || '');
  const existing = friendEvents.find((event) => event.eventId === eventId && event.viewerRole === 'host');
  const existingLocation = existing ? findFriendEventLocation(existing.eventId, locations) : null;
  const editing = Boolean(existing);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [busy, setBusy] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [picker, setPicker] = useState<'category' | 'venue' | 'friends' | null>(null);
  const [datePickerMode, setDatePickerMode] = useState<'date' | 'time' | null>(null);
  const [pickerDate, setPickerDate] = useState(() => new Date());
  const hydratedRef = useRef(false);
  const operationIdRef = useRef(createSocialOperationId());
  const draftKey = user ? `gathr:friend-event-draft:${user.uid}` : '';

  const categories = EVENT_CATEGORIES;

  const venues = useMemo(() => {
    const byId = new Map<string, VenueOption>();
    allEvents.forEach((event) => {
      const venueId = String(event.venueId || '').trim();
      if (
        !venueId
        || byId.has(venueId)
        || event.locationScope === 'city'
        || event.locationScope === 'area'
        || event.locationScope === 'route'
        || event.locationScope === 'unknown'
      ) return;
      byId.set(venueId, { venueId, name: event.venue || event.title, address: event.address || '' });
    });
    return [...byId.values()].sort((first, second) => first.name.localeCompare(second.name));
  }, [allEvents]);

  useEffect(() => {
    if (hydratedRef.current || !draftKey) return;
    if (existing) {
      const startAt = socialTimeToMillis(existing.startAt);
      const endAt = socialTimeToMillis(existing.endAt);
      const start = startAt ? new Date(startAt) : new Date();
      setDraft({
        ...initialDraft(),
        title: existing.title,
        description: existing.description,
        externalUrl: existing.externalUrl,
        category: existing.category,
        date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
        time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
        durationMinutes: startAt && endAt ? Math.max(30, Math.round((endAt - startAt) / 60_000)) : 120,
        locationType: existing.locationType,
        venueId: existing.venueId,
        customPlaceName: existingLocation?.placeName || '',
        customAddress: existingLocation?.address || '',
        customCoordinates: existingLocation
          ? { latitude: existingLocation.latitude, longitude: existingLocation.longitude }
          : null,
        onlineUrl: existing.onlineUrl,
        visibility: existing.visibility,
        guestInviteMode: existing.guestInviteMode,
        guestListVisible: existing.guestListVisible,
      });
      hydratedRef.current = true;
      return;
    }
    void AsyncStorage.getItem(draftKey).then((stored) => {
      if (!stored) return;
      try {
        setDraft({ ...initialDraft(), ...(JSON.parse(stored) as Draft) });
      } catch {
        // Ignore a malformed local draft and start clean.
      }
    }).finally(() => {
      hydratedRef.current = true;
    });
  }, [draftKey, existing, existingLocation]);

  useEffect(() => {
    if (!draftKey || editing || !hydratedRef.current) return;
    const timer = setTimeout(() => {
      void AsyncStorage.setItem(draftKey, JSON.stringify(draft));
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, draftKey, editing]);

  const patchDraft = (values: Partial<Draft>) => setDraft((current) => ({ ...current, ...values }));

  const applyPickedDate = (value: Date) => patchDraft({
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  });

  const openDatePicker = (mode: 'date' | 'time') => {
    setPickerDate(new Date(parseLocalDateTime(draft.date, draft.time) || Date.now()));
    setDatePickerMode(mode);
  };

  const onDatePickerChange = (event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === 'android') {
      setDatePickerMode(null);
      if (event.type === 'set' && value) applyPickedDate(value);
      return;
    }
    if (value) setPickerDate(value);
  };
  const selectedFriends = friends.filter((friend) => draft.selectedUids.includes(friend.uid));
  const selectedVenue = venues.find((venue) => venue.venueId === draft.venueId);
  const audienceCount = draft.visibility === 'all_friends' ? friends.length : draft.selectedUids.length;

  const validateStep = (targetStep = step) => {
    if (targetStep === 0) {
      if (draft.title.trim().length < 2) return 'Add an event title.';
      if (!draft.category) return 'Choose a category so filters can find the event.';
      const startAt = parseLocalDateTime(draft.date, draft.time);
      if (!startAt || startAt < Date.now() - 5 * 60_000) return 'Enter a valid future date and time.';
      if (draft.externalUrl && !draft.externalUrl.trim().startsWith('https://')) {
        return 'The optional event link must begin with https://.';
      }
    }
    if (targetStep === 1) {
      if (draft.locationType === 'recognized_venue' && !draft.venueId) return 'Choose a GathR venue.';
      if (draft.locationType === 'custom_address' && (!draft.customAddress.trim() || !draft.customCoordinates)) {
        return 'Find and confirm the custom address.';
      }
      if (draft.locationType === 'online' && draft.onlineUrl && !draft.onlineUrl.startsWith('https://')) {
        return 'Online links must begin with https://.';
      }
    }
    if (targetStep === 2 && !editing && draft.visibility === 'selected_friends' && draft.selectedUids.length === 0) {
      return 'Choose at least one friend or switch to All friends.';
    }
    return null;
  };

  const next = () => {
    const error = validateStep();
    if (error) return Alert.alert('A little more information', error);
    setStep((current) => Math.min(2, current + 1));
  };

  const geocodeAddress = async () => {
    if (draft.customAddress.trim().length < 5) {
      Alert.alert('Enter an address', 'Use a street address, town or city, and province/state where possible.');
      return;
    }
    setGeocoding(true);
    try {
      const result = await geocodeFriendEventAddress(draft.customAddress.trim());
      patchDraft({ customCoordinates: result });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error) {
      Alert.alert('Address not confirmed', errorMessage(error));
    } finally {
      setGeocoding(false);
    }
  };

  const buildInput = (): FriendEventInput | null => {
    const startAtMs = parseLocalDateTime(draft.date, draft.time);
    if (!startAtMs) return null;
    let location: FriendEventLocationInput;
    if (draft.locationType === 'recognized_venue') {
      location = { type: 'recognized_venue', venueId: draft.venueId };
    } else if (draft.locationType === 'custom_address' && draft.customCoordinates) {
      const revealAtMs = draft.revealChoice === 'now'
        ? Date.now()
        : draft.revealChoice === 'two_hours'
          ? Math.max(Date.now(), startAtMs - 2 * 60 * 60_000)
          : startAtMs;
      location = {
        type: 'custom_address',
        address: draft.customAddress.trim(),
        placeName: draft.customPlaceName.trim(),
        ...draft.customCoordinates,
        revealAtMs,
      };
    } else if (draft.locationType === 'online') {
      location = { type: 'online', onlineUrl: draft.onlineUrl.trim() || undefined };
    } else {
      location = { type: 'tbd' };
    }
    return {
      operationId: operationIdRef.current,
      title: draft.title.trim(),
      description: draft.description.trim(),
      category: draft.category,
      startAtMs,
      endAtMs: startAtMs + draft.durationMinutes * 60_000,
      visibility: draft.visibility,
      selectedUids: draft.visibility === 'selected_friends' ? draft.selectedUids : undefined,
      guestInviteMode: draft.guestInviteMode,
      guestListVisible: draft.guestListVisible,
      externalUrl: draft.externalUrl.trim() || undefined,
      location,
    };
  };

  const publish = async () => {
    const error = [0, 1, 2].map((index) => validateStep(index)).find(Boolean);
    if (error) return Alert.alert('Event not ready', error);
    const input = buildInput();
    if (!input) return Alert.alert('Check the date', 'Enter a valid event date and time.');
    setBusy(true);
    try {
      if (editing && existing) {
        await updateFriendEvent(existing.eventId, input);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        router.replace({ pathname: '/friend-event/[id]', params: { id: existing.eventId } });
      } else {
        const event = await createFriendEvent(input);
        if (draftKey) await AsyncStorage.removeItem(draftKey);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        router.replace({ pathname: '/friend-event/[id]', params: { id: event.eventId } });
      }
    } catch (saveError) {
      Alert.alert(editing ? 'Could not update event' : 'Could not create event', errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const toggleFriend = (uid: string) => patchDraft({
    selectedUids: draft.selectedUids.includes(uid)
      ? draft.selectedUids.filter((item) => item !== uid)
      : [...draft.selectedUids, uid],
  });

  if (!user) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Close event creator">
            <Ionicons name="close" size={24} color="#101828" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{editing ? 'Edit Event' : 'Create Event'}</Text>
            <Text style={styles.subtitle}>Private to people you authorize</Text>
          </View>
          <Text style={styles.stepCount}>{step + 1}/3</Text>
        </View>

        <View style={styles.stepRail}>
          {STEPS.map((label, index) => (
            <TouchableOpacity key={label} onPress={() => index < step && setStep(index)} style={styles.stepItem}>
              <View style={[styles.stepDot, index <= step && styles.stepDotActive]} />
              <Text style={[styles.stepLabel, index === step && styles.stepLabelActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.surface}>
          {step === 0 && (
            <View style={styles.stepContent}>
              <View style={styles.eventHero}>
                <View style={styles.heroOrb} />
                <Ionicons name="sparkles" size={22} color="#FFFFFF" />
                <Text style={styles.heroText}>Make a plan worth gathering for.</Text>
              </View>
              <TextInput value={draft.title} onChangeText={(title) => patchDraft({ title })} maxLength={100} placeholder="Event name" style={styles.largeInput} accessibilityLabel="Event name" />
              <TouchableOpacity onPress={() => setPicker('category')} style={styles.selector} accessibilityRole="button" accessibilityLabel={`Category, ${draft.category || 'not selected'}`}>
                <View style={styles.selectorIcon}><Ionicons name="pricetag-outline" size={18} color={PURPLE} /></View>
                <Text numberOfLines={1} style={[styles.selectorText, !draft.category && styles.placeholder]}>{draft.category || 'Choose a category'}</Text>
                <Ionicons name="chevron-forward" size={18} color="#98A2B3" />
              </TouchableOpacity>
              <View style={styles.inlineFields}>
                <TouchableOpacity onPress={() => openDatePicker('date')} style={[styles.dateTimeField, styles.flex]} accessibilityLabel={`Event date, ${draft.date}`}>
                  <Ionicons name="calendar-outline" size={18} color={PURPLE} />
                  <View><Text style={styles.fieldEyebrow}>DATE</Text><Text style={styles.dateTimeValue}>{new Date(`${draft.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text></View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openDatePicker('time')} style={[styles.dateTimeField, styles.timeField]} accessibilityLabel={`Event time, ${draft.time}`}>
                  <Ionicons name="time-outline" size={18} color={PURPLE} />
                  <View><Text style={styles.fieldEyebrow}>START</Text><Text style={styles.dateTimeValue}>{new Date(`2000-01-01T${draft.time}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text></View>
                </TouchableOpacity>
              </View>
              <View style={styles.segmentRow}>
                {DURATIONS.map((duration) => (
                  <TouchableOpacity key={duration} onPress={() => patchDraft({ durationMinutes: duration })} style={[styles.segment, draft.durationMinutes === duration && styles.segmentActive]}>
                    <Text style={[styles.segmentText, draft.durationMinutes === duration && styles.segmentTextActive]}>{duration / 60}h</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput value={draft.description} onChangeText={(description) => patchDraft({ description })} maxLength={2000} placeholder="Add details (optional)" multiline style={[styles.input, styles.description]} accessibilityLabel="Event details" />
              <TextInput value={draft.externalUrl} onChangeText={(externalUrl) => patchDraft({ externalUrl })} placeholder="Optional event link (https://...)" autoCapitalize="none" keyboardType="url" style={styles.input} accessibilityLabel="Optional event link" />
            </View>
          )}

          {step === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.sectionTitle}>Where is it?</Text>
              <View style={styles.locationTabs}>
                {([
                  ['custom_address', 'Address', 'home-outline'],
                  ['recognized_venue', 'Venue', 'business-outline'],
                  ['online', 'Online', 'videocam-outline'],
                  ['tbd', 'Later', 'time-outline'],
                ] as const).map(([type, label, icon]) => (
                  <TouchableOpacity key={type} onPress={() => patchDraft({ locationType: type })} style={[styles.locationTab, draft.locationType === type && styles.locationTabActive]}>
                    <Ionicons name={icon} size={18} color={draft.locationType === type ? '#FFFFFF' : '#667085'} />
                    <Text style={[styles.locationTabText, draft.locationType === type && styles.locationTabTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {draft.locationType === 'custom_address' && (
                <View style={styles.locationPanel}>
                  <Text style={styles.panelTitle}>Any address works</Text>
                  <Text style={styles.panelCopy}>Homes, parks, halls, or anywhere else. Only authorized guests receive the exact address.</Text>
                  <TextInput value={draft.customPlaceName} onChangeText={(customPlaceName) => patchDraft({ customPlaceName })} placeholder="Place name (optional)" style={styles.input} />
                  <TextInput value={draft.customAddress} onChangeText={(customAddress) => patchDraft({ customAddress, customCoordinates: null })} placeholder="Street address, city, province/state" style={styles.input} accessibilityLabel="Custom event address" />
                  <TouchableOpacity disabled={geocoding} onPress={() => void geocodeAddress()} style={[styles.confirmAddress, geocoding && styles.disabled]}>
                    {geocoding ? <ActivityIndicator color={PURPLE} /> : <Ionicons name={draft.customCoordinates ? 'checkmark-circle' : 'locate-outline'} size={19} color={PURPLE} />}
                    <Text style={styles.confirmAddressText}>{draft.customCoordinates ? 'Address confirmed' : 'Find this address'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.fieldLabel}>Share exact address</Text>
                  <View style={styles.segmentRow}>
                    {([['now', 'Now'], ['two_hours', '2h before'], ['start', 'At start']] as const).map(([value, label]) => (
                      <TouchableOpacity key={value} onPress={() => patchDraft({ revealChoice: value })} style={[styles.segment, draft.revealChoice === value && styles.segmentActive]}>
                        <Text style={[styles.segmentText, draft.revealChoice === value && styles.segmentTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {draft.locationType === 'recognized_venue' && (
                <TouchableOpacity onPress={() => setPicker('venue')} style={styles.bigSelector}>
                  <View style={styles.bigSelectorIcon}><Ionicons name="business" size={24} color={BRAND} /></View>
                  <View style={styles.flex}>
                    <Text style={styles.bigSelectorTitle}>{selectedVenue?.name || 'Choose a GathR venue'}</Text>
                    <Text numberOfLines={2} style={styles.panelCopy}>{selectedVenue?.address || 'Recognized venues use their existing map location.'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#98A2B3" />
                </TouchableOpacity>
              )}

              {draft.locationType === 'online' && (
                <View style={styles.locationPanel}>
                  <Text style={styles.panelTitle}>Online gathering</Text>
                  <TextInput value={draft.onlineUrl} onChangeText={(onlineUrl) => patchDraft({ onlineUrl })} placeholder="https:// meeting link (optional)" autoCapitalize="none" keyboardType="url" style={styles.input} />
                </View>
              )}

              {draft.locationType === 'tbd' && (
                <View style={styles.emptyPanel}>
                  <Ionicons name="time-outline" size={36} color={PURPLE} />
                  <Text style={styles.panelTitle}>Share the location later</Text>
                  <Text style={styles.panelCopy}>Guests can see the event now. You can edit it and add a location before it begins.</Text>
                </View>
              )}
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.sectionTitle}>Who can see it?</Text>
              <View style={styles.publishPreview}>
                <View style={styles.publishPreviewIcon}><Ionicons name="calendar" size={20} color="#FFFFFF" /></View>
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={styles.publishPreviewTitle}>{draft.title}</Text>
                  <Text numberOfLines={1} style={styles.publishPreviewMeta}>{new Date(parseLocalDateTime(draft.date, draft.time) || Date.now()).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {audienceCount} friend{audienceCount === 1 ? '' : 's'}</Text>
                </View>
                <View style={styles.previewLock}><Ionicons name="lock-closed" size={12} color={PURPLE} /></View>
              </View>
              {editing ? (
                <View style={styles.editAudienceNotice}>
                  <Ionicons name="shield-checkmark" size={20} color={PURPLE} />
                  <Text style={styles.panelCopy}>The published audience stays intact while editing. Add or remove guests from the event page.</Text>
                </View>
              ) : (
                <View style={styles.audienceCards}>
                  <TouchableOpacity onPress={() => patchDraft({ visibility: 'all_friends' })} style={[styles.audienceCard, draft.visibility === 'all_friends' && styles.audienceCardActive]}>
                    <Ionicons name="people" size={22} color={draft.visibility === 'all_friends' ? PURPLE : '#667085'} />
                    <View style={styles.flex}>
                      <Text style={styles.audienceTitle}>All friends</Text>
                      <Text style={styles.panelCopy}>{friends.length} current friend{friends.length === 1 ? '' : 's'} · audience snapshots when published</Text>
                    </View>
                    <Ionicons name={draft.visibility === 'all_friends' ? 'radio-button-on' : 'radio-button-off'} size={21} color={PURPLE} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { patchDraft({ visibility: 'selected_friends' }); setPicker('friends'); }} style={[styles.audienceCard, draft.visibility === 'selected_friends' && styles.audienceCardActive]}>
                    <Ionicons name="person-add" size={22} color={draft.visibility === 'selected_friends' ? PURPLE : '#667085'} />
                    <View style={styles.flex}>
                      <Text style={styles.audienceTitle}>Invited friends only</Text>
                      <Text style={styles.panelCopy}>{selectedFriends.length > 0 ? `${selectedFriends.length} selected` : 'Choose specific friends'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#98A2B3" />
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.settingCard}>
                <View style={styles.settingRow}>
                  <View style={styles.settingIcon}><Ionicons name="person-add-outline" size={19} color={PURPLE} /></View>
                  <View style={styles.flex}>
                    <Text style={styles.settingTitle}>Guests can invite others</Text>
                    <Text style={styles.panelCopy}>Invited people can add their GathR friends.</Text>
                  </View>
                  <Switch value={draft.guestInviteMode === 'guests_can_invite'} onValueChange={(enabled) => patchDraft({ guestInviteMode: enabled ? 'guests_can_invite' : 'host_only' })} trackColor={{ false: '#D0D5DD', true: '#C7B9FF' }} thumbColor={draft.guestInviteMode === 'guests_can_invite' ? PURPLE : '#FFFFFF'} />
                </View>
                <View style={styles.divider} />
                <View style={styles.settingRow}>
                  <View style={styles.settingIcon}><Ionicons name="list-outline" size={19} color={PURPLE} /></View>
                  <View style={styles.flex}>
                    <Text style={styles.settingTitle}>Guests can see guest list</Text>
                    <Text style={styles.panelCopy}>The host always retains full visibility.</Text>
                  </View>
                  <Switch value={draft.guestListVisible} onValueChange={(guestListVisible) => patchDraft({ guestListVisible })} trackColor={{ false: '#D0D5DD', true: '#C7B9FF' }} thumbColor={draft.guestListVisible ? PURPLE : '#FFFFFF'} />
                </View>
              </View>
              {draft.locationType === 'custom_address' && draft.guestInviteMode === 'guests_can_invite' && (
                <View style={styles.privacyWarning}>
                  <Ionicons name="warning-outline" size={20} color="#B54708" />
                  <Text style={styles.privacyWarningText}>Guests may invite people you did not choose. Those people will receive the home address when your reveal setting allows it.</Text>
                </View>
              )}
              <View style={styles.privacySummary}>
                <Ionicons name="lock-closed" size={18} color="#175CD3" />
                <Text style={styles.privacySummaryText}>This event is never public or searchable. Only its snapshotted audience and later explicit invitees can open it.</Text>
              </View>
            </View>
          )}

          <View style={styles.footer}>
            {step > 0 && <TouchableOpacity onPress={() => setStep((current) => current - 1)} style={styles.backButton}><Text style={styles.backText}>Back</Text></TouchableOpacity>}
            <TouchableOpacity disabled={busy} onPress={step < 2 ? next : () => void publish()} style={[styles.primaryButton, busy && styles.disabled]}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{step < 2 ? 'Continue' : editing ? 'Save changes' : 'Publish event'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {datePickerMode && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerDate}
          mode={datePickerMode}
          minuteInterval={15}
          minimumDate={datePickerMode === 'date' ? new Date() : undefined}
          onChange={onDatePickerChange}
        />
      )}

      <Modal visible={Boolean(datePickerMode && Platform.OS === 'ios')} transparent animationType="slide" onRequestClose={() => setDatePickerMode(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.datePickerSheet}>
            <View style={[styles.modalHeader, styles.datePickerHeader]}>
              <TouchableOpacity onPress={() => setDatePickerMode(null)}><Text style={styles.datePickerCancel}>Cancel</Text></TouchableOpacity>
              <Text style={styles.datePickerTitle}>{datePickerMode === 'date' ? 'Event date' : 'Start time'}</Text>
              <TouchableOpacity onPress={() => { applyPickedDate(pickerDate); setDatePickerMode(null); }}><Text style={styles.datePickerDone}>Done</Text></TouchableOpacity>
            </View>
            {datePickerMode && (
              <DateTimePicker
                value={pickerDate}
                mode={datePickerMode}
                display="spinner"
                minuteInterval={15}
                minimumDate={datePickerMode === 'date' ? new Date() : undefined}
                onChange={onDatePickerChange}
              />
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{picker === 'category' ? 'Choose category' : picker === 'venue' ? 'Choose venue' : 'Choose friends'}</Text>
              <TouchableOpacity onPress={() => setPicker(null)} style={styles.iconButton}><Ionicons name="close" size={22} color="#344054" /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalList} showsVerticalScrollIndicator={false}>
              {picker === 'category' && categories.map((category) => (
                <TouchableOpacity key={category} onPress={() => { patchDraft({ category }); setPicker(null); }} style={styles.pickerRow}>
                  <View style={styles.selectorIcon}><Ionicons name="pricetag-outline" size={17} color={PURPLE} /></View>
                  <Text style={styles.pickerText}>{category}</Text>
                  <Ionicons name={draft.category === category ? 'checkmark-circle' : 'chevron-forward'} size={20} color={draft.category === category ? PURPLE : '#98A2B3'} />
                </TouchableOpacity>
              ))}
              {picker === 'venue' && venues.map((venue) => (
                <TouchableOpacity key={venue.venueId} onPress={() => { patchDraft({ venueId: venue.venueId }); setPicker(null); }} style={styles.pickerRow}>
                  <View style={styles.flex}><Text style={styles.pickerText}>{venue.name}</Text><Text numberOfLines={1} style={styles.panelCopy}>{venue.address}</Text></View>
                  <Ionicons name={draft.venueId === venue.venueId ? 'checkmark-circle' : 'chevron-forward'} size={20} color={draft.venueId === venue.venueId ? PURPLE : '#98A2B3'} />
                </TouchableOpacity>
              ))}
              {picker === 'friends' && friends.map((friend) => (
                <TouchableOpacity key={friend.uid} onPress={() => toggleFriend(friend.uid)} style={styles.pickerRow}>
                  <View style={styles.friendAvatar}><Text style={styles.friendInitial}>{friend.displayName.trim().charAt(0).toUpperCase()}</Text></View>
                  <View style={styles.flex}><Text style={styles.pickerText}>{friend.displayName}</Text><Text style={styles.panelCopy}>@{friend.socialHandle}</Text></View>
                  <Ionicons name={draft.selectedUids.includes(friend.uid) ? 'checkbox' : 'square-outline'} size={23} color={PURPLE} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            {picker === 'friends' && <TouchableOpacity disabled={draft.selectedUids.length === 0} onPress={() => setPicker(null)} style={[styles.primaryButton, draft.selectedUids.length === 0 && styles.disabled]}><Text style={styles.primaryText}>Done · {draft.selectedUids.length} selected</Text></TouchableOpacity>}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F8FB' },
  flex: { flex: 1 },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E7EC' },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { color: '#101828', fontSize: 21, fontWeight: '900' },
  subtitle: { color: '#667085', fontSize: 11, marginTop: 1 },
  stepCount: { color: PURPLE, fontWeight: '800', paddingHorizontal: 8 },
  stepRail: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: '#FFFFFF' },
  stepItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D0D5DD' },
  stepDotActive: { backgroundColor: PURPLE },
  stepLabel: { color: '#98A2B3', fontSize: 11, fontWeight: '700' },
  stepLabelActive: { color: '#53389E' },
  surface: { flex: 1, margin: 10, padding: 12, borderRadius: 20, backgroundColor: '#FFFFFF', shadowColor: '#101828', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  stepContent: { flex: 1, minHeight: 0, gap: 9 },
  eventHero: { minHeight: 58, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 15, backgroundColor: PURPLE },
  heroOrb: { position: 'absolute', width: 90, height: 90, borderRadius: 45, right: -22, top: -40, backgroundColor: 'rgba(255,255,255,0.13)' },
  heroText: { color: '#FFFFFF', fontWeight: '800' },
  largeInput: { minHeight: 50, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 13, paddingHorizontal: 12, color: '#101828', fontSize: 17, fontWeight: '700' },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 12, paddingHorizontal: 11, color: '#101828', backgroundColor: '#FFFFFF' },
  description: { minHeight: 72, paddingTop: 11, textAlignVertical: 'top' },
  inlineFields: { flexDirection: 'row', gap: 8 },
  dateTimeField: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: '#E4E7EC', backgroundColor: '#FFFFFF' },
  timeField: { width: 132 },
  fieldEyebrow: { color: '#98A2B3', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  dateTimeValue: { color: '#101828', fontSize: 13, fontWeight: '800', marginTop: 2 },
  selector: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 12 },
  selectorIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4EBFF' },
  selectorText: { flex: 1, color: '#101828', fontWeight: '700' },
  placeholder: { color: '#667085', fontWeight: '500' },
  segmentRow: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 10 },
  segmentActive: { borderColor: PURPLE, backgroundColor: '#F4EBFF' },
  segmentText: { color: '#667085', fontSize: 12, fontWeight: '700' },
  segmentTextActive: { color: '#53389E' },
  sectionTitle: { color: '#101828', fontSize: 18, fontWeight: '900' },
  locationTabs: { flexDirection: 'row', gap: 6 },
  locationTab: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 12, backgroundColor: '#F2F4F7' },
  locationTabActive: { backgroundColor: PURPLE },
  locationTabText: { color: '#667085', fontSize: 10, fontWeight: '700' },
  locationTabTextActive: { color: '#FFFFFF' },
  locationPanel: { gap: 8, padding: 11, borderRadius: 15, backgroundColor: '#FAFAFF' },
  panelTitle: { color: '#344054', fontSize: 14, fontWeight: '800' },
  panelCopy: { color: '#667085', fontSize: 11, lineHeight: 15 },
  fieldLabel: { color: '#475467', fontSize: 11, fontWeight: '800', marginTop: 2 },
  confirmAddress: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 11, backgroundColor: '#F4EBFF' },
  confirmAddressText: { color: '#53389E', fontWeight: '800' },
  bigSelector: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: '#D0D5DD' },
  bigSelectorIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF8FF' },
  bigSelectorTitle: { color: '#101828', fontSize: 15, fontWeight: '800' },
  emptyPanel: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18, borderRadius: 16, backgroundColor: '#FAFAFF' },
  audienceCards: { gap: 8 },
  publishPreview: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, borderRadius: 14, backgroundColor: '#F9F5FF' },
  publishPreviewIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: PURPLE },
  publishPreviewTitle: { color: '#344054', fontSize: 13, fontWeight: '900' },
  publishPreviewMeta: { color: '#667085', fontSize: 10, marginTop: 2 },
  previewLock: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#E9D7FE' },
  audienceCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderWidth: 1, borderColor: '#E4E7EC', borderRadius: 14 },
  audienceCardActive: { borderColor: '#B692F6', backgroundColor: '#FAF5FF' },
  audienceTitle: { color: '#344054', fontWeight: '800' },
  settingCard: { borderWidth: 1, borderColor: '#E4E7EC', borderRadius: 15, overflow: 'hidden' },
  settingRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10 },
  settingIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4EBFF' },
  settingTitle: { color: '#344054', fontSize: 13, fontWeight: '800' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E4E7EC', marginLeft: 53 },
  privacyWarning: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 13, backgroundColor: '#FFFAEB' },
  privacyWarningText: { flex: 1, color: '#B54708', fontSize: 11, lineHeight: 15, fontWeight: '600' },
  privacySummary: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 13, backgroundColor: '#EFF8FF' },
  privacySummaryText: { flex: 1, color: '#175CD3', fontSize: 11, lineHeight: 15, fontWeight: '600' },
  editAudienceNotice: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, borderRadius: 14, backgroundColor: '#F4EBFF' },
  footer: { flexDirection: 'row', gap: 8, marginTop: 'auto', paddingTop: 8 },
  backButton: { minWidth: 88, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#F2F4F7' },
  backText: { color: '#475467', fontWeight: '800' },
  primaryButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: PURPLE, paddingHorizontal: 16 },
  primaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  disabled: { opacity: 0.45 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.48)' },
  modalSheet: { maxHeight: '84%', minHeight: 320, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 30 : 18, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF' },
  datePickerSheet: { marginTop: 'auto', paddingBottom: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF' },
  datePickerHeader: { paddingHorizontal: 18 },
  datePickerTitle: { color: '#101828', fontSize: 17, fontWeight: '900' },
  datePickerCancel: { color: '#667085', fontWeight: '700' },
  datePickerDone: { color: PURPLE, fontWeight: '900' },
  modalHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#101828', fontSize: 20, fontWeight: '900' },
  modalList: { paddingBottom: 12 },
  pickerRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0' },
  pickerText: { flex: 1, color: '#344054', fontWeight: '800' },
  friendAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4EBFF' },
  friendInitial: { color: PURPLE, fontWeight: '900' },
});
