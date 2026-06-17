import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  danger: '#B42318',
};

type Phase = 'processing' | 'saved' | 'needs_review' | 'error';

type SharedEventSnapshot = {
  sourceUrl: string;
  sharedText: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  locationName: string;
  address: string;
  mediaUrl: string;
  visibilityHint: string;
  sourceApp: string;
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

function buildInitialState(params: Record<string, string | string[] | undefined>): SharedEventSnapshot {
  const sharedText = normalizeSharedTextFromParams(params);
  const sourceUrl = firstParam(params.url) || firstParam(params.sourceUrl) || extractUrl(sharedText);

  return {
    sourceUrl,
    sharedText,
    title: firstParam(params.title),
    description: firstParam(params.description),
    startDate: firstParam(params.startDate),
    endDate: firstParam(params.endDate),
    startTime: firstParam(params.startTime),
    endTime: firstParam(params.endTime),
    locationName: firstParam(params.locationName) || firstParam(params.venueName),
    address: firstParam(params.address),
    mediaUrl: firstParam(params.mediaUrl),
    visibilityHint: firstParam(params.visibilityHint),
    sourceApp: firstParam(params.sourceApp) || firstParam(params.app),
  };
}

function signatureForSnapshot(snapshot: SharedEventSnapshot): string {
  return [
    snapshot.sourceUrl,
    snapshot.sharedText,
    snapshot.title,
    snapshot.description,
    snapshot.startDate,
    snapshot.startTime,
    snapshot.locationName,
    snapshot.mediaUrl,
  ].join('::');
}

function hasUsableSnapshot(snapshot: SharedEventSnapshot): boolean {
  return Boolean(
    snapshot.sourceUrl.trim() ||
    snapshot.sharedText.trim() ||
    snapshot.title.trim() ||
    snapshot.description.trim()
  );
}

function isFacebookUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.includes('facebook.com') || host.includes('fb.me');
  } catch {
    return false;
  }
}

function payloadFromSnapshot(snapshot: SharedEventSnapshot): SharedEventPayload {
  const sourcePlatform = isFacebookUrl(snapshot.sourceUrl) ? 'facebook' : undefined;

  return {
    sourceUrl: snapshot.sourceUrl.trim() || undefined,
    sharedText: snapshot.sharedText.trim() || undefined,
    title: snapshot.title.trim() || undefined,
    description: snapshot.description.trim() || undefined,
    startDate: snapshot.startDate.trim() || undefined,
    endDate: snapshot.endDate.trim() || undefined,
    startTime: snapshot.startTime.trim() || undefined,
    endTime: snapshot.endTime.trim() || undefined,
    locationName: snapshot.locationName.trim() || undefined,
    address: snapshot.address.trim() || undefined,
    mediaUrls: snapshot.mediaUrl ? [snapshot.mediaUrl] : undefined,
    visibilityHint: snapshot.visibilityHint || undefined,
    sourceApp: snapshot.sourceApp || undefined,
    sourcePlatform,
    timezone: 'America/Halifax',
  };
}

function mergeResultIntoSnapshot(
  snapshot: SharedEventSnapshot,
  result: SharedEventSubmitResult
): SharedEventSnapshot {
  const event = result.event;
  if (!event) return snapshot;
  const mediaUrl = event.imageUrl || event.mediaUrls?.[0] || snapshot.mediaUrl;

  return {
    ...snapshot,
    sourceUrl: event.sourceUrl || snapshot.sourceUrl,
    title: event.title || snapshot.title,
    description: event.description || snapshot.description,
    startDate: event.startDate || snapshot.startDate,
    endDate: event.endDate || snapshot.endDate,
    startTime: event.startTime || snapshot.startTime,
    endTime: event.endTime || snapshot.endTime,
    locationName: event.locationName || snapshot.locationName,
    address: event.address || snapshot.address,
    mediaUrl,
  };
}

function formatTime(value: string): string {
  const match = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return value;
  const hour24 = Number(match[1]);
  const minute = match[2];
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function formatDate(value: string): string {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatDateTime(snapshot: SharedEventSnapshot): string {
  const startDate = formatDate(snapshot.startDate);
  const endDate = snapshot.endDate && snapshot.endDate !== snapshot.startDate
    ? formatDate(snapshot.endDate)
    : '';
  const startTime = snapshot.startTime ? formatTime(snapshot.startTime) : '';

  if (startDate && endDate) return `${startDate} - ${endDate}${startTime ? ` at ${startTime}` : ''}`;
  if (startDate && startTime) return `${startDate} at ${startTime}`;
  if (startDate) return startDate;
  if (startTime) return startTime;
  return 'Date to be confirmed';
}

function sourceLabel(snapshot: SharedEventSnapshot): string {
  if (!snapshot.sourceUrl) return 'Facebook';
  try {
    const url = new URL(snapshot.sourceUrl);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return 'Facebook';
  }
}

function statusCopy(phase: Phase, result: SharedEventSubmitResult | null, errorMessage: string): {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  color: string;
} {
  if (phase === 'processing') {
    return {
      icon: 'sparkles-outline',
      title: 'Reading Facebook event',
      detail: 'GathR is checking the shared source and saving the event.',
      color: BRAND.primary,
    };
  }

  if (phase === 'error') {
    return {
      icon: 'alert-circle-outline',
      title: 'Could not read event',
      detail: errorMessage || 'GathR could not process this share.',
      color: BRAND.danger,
    };
  }

  if (result?.routing === 'public_candidate') {
    return {
      icon: 'earth-outline',
      title: 'Submitted for validation',
      detail: 'Saved to your GathR and queued for public review.',
      color: BRAND.success,
    };
  }

  if (phase === 'needs_review' || result?.needsUserReview) {
    return {
      icon: 'lock-closed-outline',
      title: 'Saved privately',
      detail: 'Only your account can see this draft while GathR keeps the source private.',
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

function reviewReasonLabel(value: string): string {
  switch (value) {
    case 'missing_title':
      return 'Needs title';
    case 'missing_start_date':
      return 'Needs date';
    case 'missing_location':
      return 'Needs place';
    default:
      return value.replace(/_/g, ' ');
  }
}

export default function SharedEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initial = useMemo(
    () => buildInitialState(params as Record<string, string | string[] | undefined>),
    [params]
  );
  const initialSignature = useMemo(() => signatureForSnapshot(initial), [initial]);
  const submittedSignatureRef = useRef('');

  const [snapshot, setSnapshot] = useState<SharedEventSnapshot>(initial);
  const [phase, setPhase] = useState<Phase>('processing');
  const [result, setResult] = useState<SharedEventSubmitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const submitSnapshot = useCallback(async (nextSnapshot: SharedEventSnapshot) => {
    if (!hasUsableSnapshot(nextSnapshot)) {
      setPhase('error');
      setErrorMessage('Facebook did not send an event link or event text.');
      return;
    }

    setPhase('processing');
    setErrorMessage('');

    try {
      const submitResult = await submitSharedEvent(payloadFromSnapshot(nextSnapshot));
      setResult(submitResult);
      setSnapshot((current) => mergeResultIntoSnapshot(current, submitResult));
      setPhase(submitResult.needsUserReview ? 'needs_review' : 'saved');
    } catch (error) {
      setPhase('error');
      setErrorMessage(error instanceof Error ? error.message : 'Please try again.');
    }
  }, []);

  useEffect(() => {
    if (submittedSignatureRef.current === initialSignature) return;
    submittedSignatureRef.current = initialSignature;
    setSnapshot(initial);
    setResult(null);
    setErrorMessage('');
    void submitSnapshot(initial);
  }, [initial, initialSignature, submitSnapshot]);

  const status = statusCopy(phase, result, errorMessage);
  const imageUri = snapshot.mediaUrl;
  const canShowImage = Boolean(imageUri && !imageLoadFailed);
  const title = snapshot.title || (phase === 'processing' ? 'Reading event...' : 'Facebook event');
  const location = snapshot.address || snapshot.locationName || 'Location to be confirmed';
  const description = snapshot.description;
  const reviewReasons = result?.reviewReasons || [];
  const isProcessing = phase === 'processing';

  useEffect(() => {
    setImageLoadFailed(false);
  }, [imageUri]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={BRAND.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Save to GathR</Text>
        <Pressable style={styles.iconButton} onPress={() => router.replace('/(tabs)/map')}>
          <Ionicons name="map-outline" size={22} color={BRAND.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.eventCard}>
          {canShowImage ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.heroImage}
              resizeMode="cover"
              onError={() => setImageLoadFailed(true)}
            />
          ) : (
            <View style={styles.heroPlaceholder}>
              {isProcessing ? (
                <ActivityIndicator color={BRAND.primaryDark} />
              ) : (
                <Ionicons name="calendar-outline" size={44} color={BRAND.primaryDark} />
              )}
            </View>
          )}

          <View style={styles.cardBody}>
            <View style={styles.badgeRow}>
              <View style={styles.sourceBadge}>
                <Ionicons name="logo-facebook" size={16} color="#1877F2" />
                <Text style={styles.sourceBadgeText}>Facebook Event</Text>
              </View>
              <View style={[
                styles.visibilityBadge,
                result?.routing === 'public_candidate' ? styles.publicBadge : styles.privateBadge,
              ]}>
                <Ionicons
                  name={result?.routing === 'public_candidate' ? 'earth-outline' : 'lock-closed-outline'}
                  size={14}
                  color={result?.routing === 'public_candidate' ? BRAND.success : BRAND.warning}
                />
                <Text style={[
                  styles.visibilityBadgeText,
                  result?.routing === 'public_candidate' ? styles.publicBadgeText : styles.privateBadgeText,
                ]}>
                  {result?.routing === 'public_candidate' ? 'Public review' : 'Private'}
                </Text>
              </View>
            </View>

            <Text style={styles.eventTitle} numberOfLines={3}>{title}</Text>

            <View style={styles.metaList}>
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={18} color={BRAND.primaryDark} />
                <Text style={styles.metaText}>{formatDateTime(snapshot)}</Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={18} color={BRAND.primaryDark} />
                <Text style={styles.metaText} numberOfLines={2}>{location}</Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="link-outline" size={18} color={BRAND.primaryDark} />
                <Text style={styles.metaText} numberOfLines={1}>{sourceLabel(snapshot)}</Text>
              </View>
            </View>

            {description ? (
              <Text style={styles.description} numberOfLines={5}>{description}</Text>
            ) : null}

            {reviewReasons.length > 0 ? (
              <View style={styles.reasonRow}>
                {reviewReasons.slice(0, 3).map((reason) => (
                  <View key={reason} style={styles.reasonChip}>
                    <Text style={styles.reasonChipText}>{reviewReasonLabel(reason)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.statusPanel, { borderColor: status.color }]}>
          <View style={[styles.statusIcon, { backgroundColor: `${status.color}18` }]}>
            <Ionicons name={status.icon} size={23} color={status.color} />
          </View>
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>{status.title}</Text>
            <Text style={styles.statusDetail}>{status.detail}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {phase === 'error' ? (
          <Pressable style={styles.saveButton} onPress={() => submitSnapshot(snapshot)}>
            <Ionicons name="refresh-outline" size={21} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Try Again</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.saveButton, isProcessing && styles.saveButtonDisabled]}
            onPress={() => router.replace('/(tabs)/map')}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Saving Event</Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={21} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Done</Text>
              </>
            )}
          </Pressable>
        )}
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
    paddingBottom: 112,
  },
  eventCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    overflow: 'hidden',
    marginBottom: 14,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: BRAND.border,
  },
  heroPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF4FF',
  },
  cardBody: {
    padding: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F8FF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CFE2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sourceBadgeText: {
    color: BRAND.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  publicBadge: {
    backgroundColor: '#EFFAF5',
    borderColor: '#BDE8D5',
  },
  privateBadge: {
    backgroundColor: '#FFF7E8',
    borderColor: '#F4D8A6',
  },
  visibilityBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  publicBadgeText: {
    color: BRAND.success,
  },
  privateBadgeText: {
    color: BRAND.warning,
  },
  eventTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: BRAND.ink,
    marginBottom: 14,
  },
  metaList: {
    gap: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  metaText: {
    flex: 1,
    color: BRAND.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  description: {
    color: BRAND.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  reasonChip: {
    backgroundColor: '#FFF7E8',
    borderColor: '#F4D8A6',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reasonChipText: {
    color: BRAND.warning,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  statusPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.surface,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
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
