import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  submitSharedEvent,
  SharedEventPayload,
  SharedEventResultEvent,
  SharedEventSubmitResult,
} from '../lib/sharedEventApi';

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

const GATHR_LOGO = require('../assets/icon.png');

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
  reviewReasons: string[];
  confidence: number;
  needsUserReview: boolean;
  sequenceIndex?: number;
  extractedFromShare?: boolean;
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
    reviewReasons: [],
    confidence: 0,
    needsUserReview: false,
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

function facebookShareKind(snapshot: SharedEventSnapshot): 'event' | 'post' {
  const value = snapshot.sourceUrl || snapshot.sharedText;
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    if (url.hostname.toLowerCase().includes('fb.me') && path.startsWith('/e/')) return 'event';
    if (path.includes('/events/')) return 'event';
    if (path.includes('/share/p') || path.includes('/posts/') || path.includes('/story.php')) return 'post';
  } catch {
    if (/facebook\.com\/share\/p|facebook\.com\/.+\/posts\/|story\.php/i.test(value)) return 'post';
    if (/fb\.me\/e\/|facebook\.com\/events\//i.test(value)) return 'event';
  }
  return 'event';
}

function facebookShareLabel(snapshot: SharedEventSnapshot): string {
  return facebookShareKind(snapshot) === 'post' ? 'Facebook Post' : 'Facebook Event';
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
  return mergeEventIntoSnapshot(snapshot, event);
}

function mergeEventIntoSnapshot(
  snapshot: SharedEventSnapshot,
  event: SharedEventResultEvent
): SharedEventSnapshot {
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
    reviewReasons: event.reviewReasons || snapshot.reviewReasons,
    confidence: event.confidence ?? snapshot.confidence,
    needsUserReview: event.needsUserReview ?? snapshot.needsUserReview,
    sequenceIndex: event.sequenceIndex ?? snapshot.sequenceIndex,
    extractedFromShare: event.extractedFromShare ?? snapshot.extractedFromShare,
  };
}

function snapshotsFromResult(
  baseSnapshot: SharedEventSnapshot,
  result: SharedEventSubmitResult
): SharedEventSnapshot[] {
  const events = result.events?.length ? result.events : result.event ? [result.event] : [];
  if (events.length === 0) return [baseSnapshot];
  return events.map((event) => mergeEventIntoSnapshot(baseSnapshot, event));
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

function statusCopy(phase: Phase, result: SharedEventSubmitResult | null, errorMessage: string, eventCount: number): {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  color: string;
} {
  if (phase === 'processing') {
    return {
      icon: 'checkmark-circle-outline',
      title: 'Thanks for submitting',
      detail: 'GathR is saving this Facebook share. If it is not already tracked, it will be added soon.',
      color: BRAND.primary,
    };
  }

  if (phase === 'error') {
    return {
      icon: 'alert-circle-outline',
      title: 'Could not save share',
      detail: errorMessage || 'GathR could not process this share.',
      color: BRAND.danger,
    };
  }

  if (result?.routing === 'public_candidate') {
    return {
      icon: 'earth-outline',
      title: 'Thanks for submitting',
      detail: eventCount > 1
        ? `GathR found ${eventCount} possible events. If they are not already tracked, they will be added after review.`
        : 'If this event is not already tracked, it will be added to GathR after review.',
      color: BRAND.success,
    };
  }

  if (phase === 'needs_review' || result?.needsUserReview) {
    return {
      icon: 'lock-closed-outline',
      title: 'Saved privately',
      detail: 'Only your account can see this share unless it is promoted later.',
      color: BRAND.warning,
    };
  }

  return {
    icon: 'lock-closed-outline',
    title: 'Saved privately',
    detail: 'Only your account can see this share.',
    color: BRAND.success,
  };
}

function usefulParsedDetailsCount(result: SharedEventSubmitResult | null, eventSnapshots: SharedEventSnapshot[]): number {
  const resultEventCount = Math.max(
    result?.extractedEventCount || 0,
    result?.events?.length || 0,
    result?.event ? 1 : 0
  );
  if (resultEventCount > 0) return resultEventCount;
  return eventSnapshots.filter((eventSnapshot) => (
    eventSnapshot.title ||
    eventSnapshot.startDate ||
    eventSnapshot.startTime ||
    eventSnapshot.locationName ||
    eventSnapshot.address ||
    eventSnapshot.description ||
    eventSnapshot.mediaUrl
  )).length;
}

function summaryTitleForResult(result: SharedEventSubmitResult | null, parsedDetailsCount: number): string {
  if (!result) return 'Share received';
  if (parsedDetailsCount > 1) return `${parsedDetailsCount} possible events found`;
  if (parsedDetailsCount === 1) return 'Possible event found';
  return 'Facebook share received';
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
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams();
  const initial = useMemo(
    () => buildInitialState(params as Record<string, string | string[] | undefined>),
    [params]
  );
  const initialSignature = useMemo(() => signatureForSnapshot(initial), [initial]);
  const submittedSignatureRef = useRef('');

  const [snapshot, setSnapshot] = useState<SharedEventSnapshot>(initial);
  const [eventSnapshots, setEventSnapshots] = useState<SharedEventSnapshot[]>([initial]);
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('processing');
  const [result, setResult] = useState<SharedEventSubmitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);

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
      const nextEventSnapshots = snapshotsFromResult(nextSnapshot, submitResult);
      setResult(submitResult);
      setEventSnapshots(nextEventSnapshots);
      setSelectedEventIndex(0);
      setSnapshot(nextEventSnapshots[0] || mergeResultIntoSnapshot(nextSnapshot, submitResult));
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
    setEventSnapshots([initial]);
    setSelectedEventIndex(0);
    setShowDetails(false);
    setResult(null);
    setErrorMessage('');
    void submitSnapshot(initial);
  }, [initial, initialSignature, submitSnapshot]);

  const eventCount = eventSnapshots.length;
  const cardWidth = Math.max(280, width - 32);
  const status = statusCopy(phase, result, errorMessage, eventCount);
  const parsedDetailsCount = phase === 'processing' || phase === 'error'
    ? 0
    : usefulParsedDetailsCount(result, eventSnapshots);
  const detailsAvailable = parsedDetailsCount > 0;
  const shouldShowDetails = showDetails && detailsAvailable;
  const summaryTitle = summaryTitleForResult(result, parsedDetailsCount);
  const shareLabel = facebookShareLabel(snapshot);
  const routingLabel = phase === 'processing'
    ? 'Sending'
    : phase === 'error'
      ? 'Retry needed'
      : result?.routing === 'public_candidate'
        ? 'Public review'
        : 'Private';
  const routingIcon: keyof typeof Ionicons.glyphMap = phase === 'processing'
    ? 'sync-outline'
    : phase === 'error'
      ? 'alert-circle-outline'
      : result?.routing === 'public_candidate'
        ? 'earth-outline'
        : 'lock-closed-outline';

  useEffect(() => {
    setFailedImageUrls([]);
  }, [eventSnapshots]);

  const onCarouselMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 12));
    setSelectedEventIndex(Math.max(0, Math.min(eventCount - 1, nextIndex)));
  }, [cardWidth, eventCount]);

  const markImageFailed = useCallback((imageUrl: string) => {
    setFailedImageUrls((current) => current.includes(imageUrl) ? current : [...current, imageUrl]);
  }, []);

  const renderEventDetailsPanel = (eventSnapshot: SharedEventSnapshot, index: number) => {
    const imageUri = eventSnapshot.mediaUrl;
    const canShowImage = Boolean(imageUri && !failedImageUrls.includes(imageUri));
    const title = eventSnapshot.title || (eventCount > 1 ? `Possible event ${index + 1}` : summaryTitle);
    const dateTime = eventSnapshot.startDate || eventSnapshot.startTime ? formatDateTime(eventSnapshot) : '';
    const location = eventSnapshot.address || eventSnapshot.locationName;
    const description = eventSnapshot.description;
    const detailRows: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
      ...(dateTime ? [{ icon: 'calendar-outline' as const, text: dateTime }] : []),
      ...(location ? [{ icon: 'location-outline' as const, text: location }] : []),
      ...(eventSnapshot.sourceUrl ? [{ icon: 'link-outline' as const, text: sourceLabel(eventSnapshot) }] : []),
    ];
    const reviewReasons = eventSnapshot.reviewReasons.length > 0
      ? eventSnapshot.reviewReasons
      : eventCount === 1
        ? result?.reviewReasons || []
        : [];

    return (
      <View
        key={`${eventSnapshot.startDate || 'event'}-${eventSnapshot.title || index}-${index}`}
        style={[styles.detailPanel, eventCount > 1 && { width: cardWidth }]}
      >
        {canShowImage ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.detailImage}
            resizeMode="cover"
            onError={() => markImageFailed(imageUri)}
          />
        ) : null}

        <View style={styles.detailBody}>
          <View style={styles.detailHeadingRow}>
            <Text style={styles.detailKicker}>{eventCount > 1 ? `${index + 1} of ${eventCount}` : 'Details'}</Text>
            <Text style={styles.detailSource}>{shareLabel}</Text>
          </View>

          <Text style={styles.detailTitle} numberOfLines={3}>{title}</Text>

          {detailRows.length > 0 ? (
            <View style={styles.detailMetaList}>
              {detailRows.map((row) => (
                <View key={`${row.icon}-${row.text}`} style={styles.detailMetaRow}>
                  <Ionicons name={row.icon} size={18} color={BRAND.primaryDark} />
                  <Text style={styles.detailMetaText} numberOfLines={2}>{row.text}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.detailEmptyText}>
              GathR saved the share and will attach more event details if they become available.
            </Text>
          )}

          {description ? (
            <Text style={styles.detailDescription} numberOfLines={5}>{description}</Text>
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
    );
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
        <View style={styles.headerBrand}>
          <Image source={GATHR_LOGO} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerTitle}>Sent to GathR</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={() => router.replace('/(tabs)/map')}>
          <Ionicons name="map-outline" size={22} color={BRAND.ink} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroller} contentContainerStyle={styles.content}>
        <View style={[styles.receiptCard, { borderColor: `${status.color}44` }]}>
          <View style={styles.receiptHeaderRow}>
            <Image source={GATHR_LOGO} style={styles.receiptLogo} resizeMode="contain" />
            <View style={styles.receiptBrandText}>
              <Text style={styles.receiptBrandTitle}>GathR</Text>
              <Text style={styles.receiptBrandDetail}>Facebook share</Text>
            </View>
            <View style={[styles.receiptRouteBadge, {
              backgroundColor: `${status.color}12`,
              borderColor: `${status.color}38`,
            }]}>
              <Ionicons name={routingIcon} size={14} color={status.color} />
              <Text style={[styles.receiptRouteText, { color: status.color }]}>{routingLabel}</Text>
            </View>
          </View>

          <View style={styles.receiptSourceRow}>
            <View style={styles.sourceBadge}>
              <Ionicons name="logo-facebook" size={16} color="#1877F2" />
              <Text style={styles.sourceBadgeText}>{shareLabel}</Text>
            </View>
          </View>

          <View style={styles.receiptMain}>
            <View style={[styles.receiptStatusIcon, { backgroundColor: `${status.color}16` }]}>
              <Ionicons name={status.icon} size={25} color={status.color} />
            </View>
            <Text style={styles.receiptTitle}>{status.title}</Text>
            <Text style={styles.receiptDetail}>{status.detail}</Text>
          </View>

          {phase !== 'processing' && phase !== 'error' && result && detailsAvailable ? (
            <>
              <View style={styles.receiptDivider} />
              <View style={styles.receiptFoundRow}>
                <View style={styles.receiptFoundText}>
                  <Text style={styles.receiptFoundLabel}>Detected</Text>
                  <Text style={styles.receiptFoundTitle}>{summaryTitle}</Text>
                </View>
                <Pressable
                  style={styles.detailsButton}
                  onPress={() => setShowDetails((current) => !current)}
                >
                  <Ionicons name={showDetails ? 'chevron-up-outline' : 'list-outline'} size={18} color={BRAND.primaryDark} />
                  <Text style={styles.detailsButtonText}>{showDetails ? 'Hide details' : 'View details'}</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>

        {shouldShowDetails && eventCount > 1 ? (
          <View style={styles.carouselSection}>
            <View style={styles.carouselHeader}>
              <Text style={styles.carouselTitle}>{eventCount} events found</Text>
              <Text style={styles.carouselCounter}>{selectedEventIndex + 1}/{eventCount}</Text>
            </View>
            <ScrollView
              horizontal
              pagingEnabled={false}
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={cardWidth + 12}
              snapToAlignment="start"
              onMomentumScrollEnd={onCarouselMomentumEnd}
              contentContainerStyle={styles.carouselContent}
            >
              {eventSnapshots.map((eventSnapshot, index) => renderEventDetailsPanel(eventSnapshot, index))}
            </ScrollView>
            <View style={styles.paginationDots}>
              {eventSnapshots.map((eventSnapshot, index) => (
                <View
                  key={`${eventSnapshot.title || index}-dot`}
                  style={[styles.paginationDot, index === selectedEventIndex && styles.paginationDotActive]}
                />
              ))}
            </View>
          </View>
        ) : shouldShowDetails ? (
          renderEventDetailsPanel(eventSnapshots[0] || snapshot, 0)
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {phase === 'error' ? (
          <Pressable style={styles.saveButton} onPress={() => submitSnapshot(snapshot)}>
            <Ionicons name="refresh-outline" size={21} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Try Again</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.saveButton}
            onPress={() => router.replace('/(tabs)/map')}
          >
            <Ionicons name="checkmark-circle-outline" size={21} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Done</Text>
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
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLogo: {
    width: 28,
    height: 28,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  scroller: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  receiptCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  receiptHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  receiptLogo: {
    width: 48,
    height: 48,
  },
  receiptBrandText: {
    flex: 1,
    minWidth: 0,
  },
  receiptBrandTitle: {
    color: BRAND.ink,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  receiptBrandDetail: {
    color: BRAND.muted,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 1,
  },
  receiptRouteBadge: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  receiptRouteText: {
    fontSize: 12,
    fontWeight: '800',
  },
  receiptSourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  receiptMain: {
    alignItems: 'center',
    paddingTop: 18,
  },
  receiptStatusIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptTitle: {
    color: BRAND.ink,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 14,
  },
  receiptDetail: {
    color: BRAND.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 7,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: '#E6EDF5',
    marginVertical: 18,
  },
  receiptFoundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  receiptFoundText: {
    flex: 1,
    minWidth: 0,
  },
  receiptFoundLabel: {
    color: BRAND.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  receiptFoundTitle: {
    color: BRAND.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  brandStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  brandStripLogo: {
    width: 38,
    height: 38,
  },
  brandStripText: {
    flex: 1,
  },
  brandStripTitle: {
    color: BRAND.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  brandStripDetail: {
    color: BRAND.muted,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
  },
  eventCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    overflow: 'hidden',
    marginBottom: 14,
  },
  detailPanel: {
    backgroundColor: BRAND.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    overflow: 'hidden',
    marginBottom: 14,
  },
  detailImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: BRAND.border,
  },
  detailBody: {
    padding: 16,
  },
  detailHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  detailKicker: {
    color: BRAND.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailSource: {
    color: BRAND.primaryDark,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  detailTitle: {
    color: BRAND.ink,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
  },
  detailMetaList: {
    gap: 10,
    marginTop: 14,
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  detailMetaText: {
    flex: 1,
    color: BRAND.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  detailEmptyText: {
    color: BRAND.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  detailDescription: {
    color: BRAND.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
  },
  carouselSection: {
    marginBottom: 14,
  },
  carouselHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  carouselTitle: {
    color: BRAND.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  carouselCounter: {
    color: BRAND.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  carouselContent: {
    gap: 12,
  },
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C9D6E5',
  },
  paginationDotActive: {
    width: 16,
    backgroundColor: BRAND.primaryDark,
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
  countBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: '#F7FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  countBadgeText: {
    color: BRAND.muted,
    fontSize: 12,
    fontWeight: '800',
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
  summaryPanel: {
    backgroundColor: BRAND.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 16,
    marginBottom: 14,
  },
  summaryBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  summaryTitle: {
    color: BRAND.ink,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
  },
  summaryDetail: {
    color: BRAND.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  detailsButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CFE2FF',
    backgroundColor: '#F3F8FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  detailsButtonText: {
    color: BRAND.primaryDark,
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
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
