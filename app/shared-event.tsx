import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { submitSharedEvent, SharedEventPayload, SharedEventSubmitResult } from '../lib/sharedEventApi';

const BRAND = {
  primary: '#1E90FF',
  primaryDark: '#0066CC',
  ink: '#1F2937',
  muted: '#667085',
  border: '#D8E2EF',
  surface: '#FFFFFF',
  background: '#F4F8FC',
  success: '#12805C',
  warning: '#B76E00',
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function normalizeSharedTextFromParams(params: Record<string, string | string[] | undefined>): string {
  return [
    firstParam(params.text),
    firstParam(params.sharedText),
    firstParam(params.body),
  ].filter(Boolean).join('\n');
}

function extractUrl(value: string): string {
  const match = value.match(/https?:\/\/[^\s<>"')]+/i);
  return match?.[0]?.replace(/[.,;:!?]+$/, '') || '';
}

function buildInitialState(params: Record<string, string | string[] | undefined>) {
  const sharedText = normalizeSharedTextFromParams(params);
  const sourceUrl = firstParam(params.url) || firstParam(params.sourceUrl) || extractUrl(sharedText);

  return {
    sourceUrl,
    sharedText,
    title: firstParam(params.title),
    description: firstParam(params.description),
    startDate: firstParam(params.startDate),
    startTime: firstParam(params.startTime),
    locationName: firstParam(params.locationName) || firstParam(params.venueName),
    address: firstParam(params.address),
    mediaUrl: firstParam(params.mediaUrl),
    visibilityHint: firstParam(params.visibilityHint),
    sourceApp: firstParam(params.sourceApp) || firstParam(params.app),
  };
}

function statusCopy(result: SharedEventSubmitResult | null): {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  color: string;
} {
  if (!result) {
    return {
      icon: 'shield-checkmark-outline',
      title: 'Ready to save',
      detail: 'GathR checks source access before public review.',
      color: BRAND.primary,
    };
  }

  if (result.routing === 'public_candidate') {
    return {
      icon: 'earth-outline',
      title: 'Submitted for validation',
      detail: 'A private copy was saved and the public source is queued for review.',
      color: BRAND.success,
    };
  }

  if (result.needsUserReview) {
    return {
      icon: 'create-outline',
      title: 'Saved as draft',
      detail: 'Only you can see it. Add missing details when ready.',
      color: BRAND.warning,
    };
  }

  return {
    icon: 'lock-closed-outline',
    title: 'Saved privately',
    detail: 'Only your account can see this event.',
    color: BRAND.success,
  };
}

export default function SharedEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initial = useMemo(
    () => buildInitialState(params as Record<string, string | string[] | undefined>),
    [params]
  );

  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl);
  const [sharedText, setSharedText] = useState(initial.sharedText);
  const [title, setTitle] = useState(initial.title);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [locationName, setLocationName] = useState(initial.locationName);
  const [address, setAddress] = useState(initial.address);
  const [description, setDescription] = useState(initial.description);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<SharedEventSubmitResult | null>(null);

  useEffect(() => {
    setSourceUrl(initial.sourceUrl);
    setSharedText(initial.sharedText);
    setTitle(initial.title);
    setStartDate(initial.startDate);
    setStartTime(initial.startTime);
    setLocationName(initial.locationName);
    setAddress(initial.address);
    setDescription(initial.description);
    setResult(null);
  }, [initial]);

  const currentStatus = statusCopy(result);
  const canSave = Boolean(sourceUrl.trim() || sharedText.trim() || title.trim() || description.trim());

  const handleSave = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);

    const payload: SharedEventPayload = {
      sourceUrl: sourceUrl.trim() || undefined,
      sharedText: sharedText.trim() || undefined,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      startDate: startDate.trim() || undefined,
      startTime: startTime.trim() || undefined,
      locationName: locationName.trim() || undefined,
      address: address.trim() || undefined,
      mediaUrls: initial.mediaUrl ? [initial.mediaUrl] : undefined,
      visibilityHint: initial.visibilityHint || undefined,
      sourceApp: initial.sourceApp || undefined,
      timezone: 'America/Halifax',
    };

    try {
      const submitResult = await submitSharedEvent(payload);
      setResult(submitResult);
      if (submitResult.event) {
        setTitle(submitResult.event.title || title);
        setDescription(submitResult.event.description || description);
        setStartDate(submitResult.event.startDate || startDate);
        setStartTime(submitResult.event.startTime || startTime);
        setLocationName(submitResult.event.locationName || locationName);
        setAddress(submitResult.event.address || address);
        setSourceUrl(submitResult.event.sourceUrl || sourceUrl);
      }
    } catch (error) {
      Alert.alert('Could not save event', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={BRAND.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Shared Event</Text>
        <Pressable style={styles.iconButton} onPress={() => router.replace('/(tabs)/map')}>
          <Ionicons name="map-outline" size={22} color={BRAND.ink} />
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.sourceBadge}>
          <Ionicons name="logo-facebook" size={17} color="#1877F2" />
          <Text style={styles.sourceBadgeText}>Facebook Event Share</Text>
        </View>

        <View style={[styles.statusPanel, { borderColor: currentStatus.color }]}>
          <View style={[styles.statusIcon, { backgroundColor: `${currentStatus.color}18` }]}>
            <Ionicons name={currentStatus.icon} size={24} color={currentStatus.color} />
          </View>
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>{currentStatus.title}</Text>
            <Text style={styles.statusDetail}>{currentStatus.detail}</Text>
          </View>
        </View>

        {initial.mediaUrl ? (
          <Image source={{ uri: initial.mediaUrl }} style={styles.previewImage} resizeMode="cover" />
        ) : null}

        <View style={styles.formSection}>
          <Text style={styles.label}>Source Link</Text>
          <TextInput
            value={sourceUrl}
            onChangeText={setSourceUrl}
            placeholder="https://www.facebook.com/events/..."
            placeholderTextColor="#8AA2B8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />

          <Text style={styles.label}>Event Name</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Event name"
            placeholderTextColor="#8AA2B8"
            style={styles.input}
          />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Date</Text>
              <TextInput
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#8AA2B8"
                autoCapitalize="none"
                style={styles.input}
              />
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Time</Text>
              <TextInput
                value={startTime}
                onChangeText={setStartTime}
                placeholder="7:00 PM"
                placeholderTextColor="#8AA2B8"
                autoCapitalize="none"
                style={styles.input}
              />
            </View>
          </View>

          <Text style={styles.label}>Place</Text>
          <TextInput
            value={locationName}
            onChangeText={setLocationName}
            placeholder="Venue or area"
            placeholderTextColor="#8AA2B8"
            style={styles.input}
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Street address"
            placeholderTextColor="#8AA2B8"
            style={styles.input}
          />

          <Text style={styles.label}>Shared Text</Text>
          <TextInput
            value={sharedText}
            onChangeText={setSharedText}
            placeholder="Pasted event text"
            placeholderTextColor="#8AA2B8"
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.textArea]}
          />

          <Text style={styles.label}>Notes</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Details"
            placeholderTextColor="#8AA2B8"
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.textAreaSmall]}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.saveButton, (!canSave || isSaving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={21} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Save Event</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND.background,
  },
  header: {
    minHeight: 64,
    paddingTop: Platform.OS === 'ios' ? 10 : 18,
    paddingHorizontal: 16,
    backgroundColor: BRAND.surface,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND.ink,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  sourceBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: BRAND.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CFE2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  sourceBadgeText: {
    color: BRAND.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  statusPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.surface,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statusText: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.ink,
  },
  statusDetail: {
    fontSize: 13,
    color: BRAND.muted,
    marginTop: 3,
    lineHeight: 18,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    marginBottom: 14,
    backgroundColor: BRAND.border,
  },
  formSection: {
    backgroundColor: BRAND.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.ink,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: '#FBFDFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: BRAND.ink,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rowItem: {
    flex: 1,
  },
  textArea: {
    minHeight: 116,
  },
  textAreaSmall: {
    minHeight: 86,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: BRAND.surface,
    borderTopWidth: 1,
    borderTopColor: BRAND.border,
  },
  saveButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: BRAND.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#A8B8C8',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
