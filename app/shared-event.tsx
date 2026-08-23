import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  InteractionManager,
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
import { useShareIntentContext } from 'expo-share-intent';
import {
  confirmSharedEventVenue,
  searchSharedEventVenueCandidates,
  submitSharedEvent,
  SharedEventPayload,
  SharedEventCrowdPromotionSummary,
  SharedEventResultEvent,
  SharedEventSubmitResult,
  SharedEventVenueCandidate,
  watchSharedEventIngest,
} from '../lib/sharedEventApi';
import {
  SharedIntentMediaFile,
} from '../lib/sharedEventMediaUpload';
import {
  enqueueSharedEventUpload,
  retrySharedEventUpload,
  SharedEventUploadJob,
  subscribeSharedEventUploadJobs,
} from '../lib/sharedEventUploadQueue';
import { trackPendingSharedEventIngest } from '../lib/sharedEventProcessingTracker';
import {
  crowdIneligibilityMessage,
  crowdIneligibilityReason,
  sharedEventProgressStage,
} from '../lib/sharedEventPresentation';
import {
  requestCurrentUserVerificationEmail,
  VerificationEmailResult,
} from '../lib/accountVerification';
import { refreshMapAfterSharedEventSave } from '../lib/sharedEventMapRefresh';
import { useAuth } from '../contexts/AuthContext';

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
const SHARED_EVENT_RETURN_INTERACTION_GUARD_MS = 10000;

const GATHR_LOGO = require('../assets/icon.png');

type Phase = 'processing' | 'saved' | 'needs_review' | 'error';

type SharedEventSnapshot = {
  privateEventId?: string;
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
  latitude?: number;
  longitude?: number;
  resolvedVenueId?: string;
  googlePlaceId?: string;
  venueResolutionStatus?: 'not_needed' | 'selection_required' | 'confirmed' | 'no_match';
  locationScope?: 'venue' | 'route' | 'unknown';
  mapMode?: 'venue' | 'route' | 'none';
  contentKind?: 'event' | 'special';
  price?: string;
  recurringPattern?: string;
  recurringDaysOfWeek?: string[];
  recurrenceUntilDate?: string;
  mediaUrls: string[];
  mediaFiles: SharedIntentMediaFile[];
  visibilityHint: string;
  sourceApp: string;
  reviewReasons: string[];
  confidence: number;
  needsUserReview: boolean;
  isExpired?: boolean;
  sequenceIndex?: number;
  extractedFromShare?: boolean;
};

type SharedEventSourceContext = {
  badgeLabel: string;
  receiptDetail: string;
  shareSubject: string;
  publicReviewSource: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
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

function parseJsonArrayParam<T>(value: string | string[] | undefined): T[] {
  const raw = firstParam(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function parseStringListParam(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  const raw = String(value || '').trim();
  if (!raw) return [];
  const parsed = parseJsonArrayParam<string>(raw);
  if (parsed.length > 0) return parsed.filter(Boolean);
  return [raw];
}

function mediaFilesFromParams(params: Record<string, string | string[] | undefined>): SharedIntentMediaFile[] {
  const files: SharedIntentMediaFile[] = parseJsonArrayParam<SharedIntentMediaFile>(params.mediaFiles)
    .filter((file) => typeof file?.path === 'string' && file.path.trim().length > 0)
    .map((file) => ({
      path: file.path.trim(),
      mimeType: typeof file.mimeType === 'string' ? file.mimeType : undefined,
      fileName: typeof file.fileName === 'string' ? file.fileName : undefined,
    }));
  const legacyMediaUrl = firstParam(params.mediaUrl);
  if (legacyMediaUrl && !files.some((file) => file.path === legacyMediaUrl)) {
    files.unshift({ path: legacyMediaUrl });
  }
  return files;
}

function buildInitialState(params: Record<string, string | string[] | undefined>): SharedEventSnapshot {
  const sharedText = normalizeSharedTextFromParams(params);
  const sourceUrl = firstParam(params.url) || firstParam(params.sourceUrl) || extractUrl(sharedText);
  const mediaFiles = mediaFilesFromParams(params);
  const mediaUrls = parseStringListParam(params.mediaUrls)
    .filter((url) => /^https?:\/\//i.test(url));

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
    mediaUrls,
    mediaFiles,
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
    snapshot.mediaUrls.join('|'),
    snapshot.mediaFiles.map((file) => file.path).join('|'),
  ].join('::');
}

function hasUsableSnapshot(snapshot: SharedEventSnapshot): boolean {
  return Boolean(
    snapshot.sourceUrl.trim() ||
    snapshot.sharedText.trim() ||
    snapshot.title.trim() ||
    snapshot.description.trim() ||
    snapshot.mediaUrls.length > 0 ||
    snapshot.mediaFiles.length > 0
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

function sharedEventSourceContext(snapshot: SharedEventSnapshot): SharedEventSourceContext {
  const hasMedia = snapshot.mediaUrls.length > 0 || snapshot.mediaFiles.length > 0;
  if (isFacebookUrl(snapshot.sourceUrl)) {
    const isPost = facebookShareKind(snapshot) === 'post';
    return {
      badgeLabel: isPost ? 'Facebook Post' : 'Facebook Event',
      receiptDetail: 'Facebook share',
      shareSubject: 'Facebook share',
      publicReviewSource: isPost ? 'full Facebook post' : 'Facebook event',
      iconName: 'logo-facebook',
      iconColor: '#1877F2',
    };
  }

  if (hasMedia && !snapshot.sourceUrl) {
    const imageCount = Math.max(snapshot.mediaUrls.length, snapshot.mediaFiles.length);
    return {
      badgeLabel: imageCount > 1 ? 'Event Photos' : 'Event Photo',
      receiptDetail: 'Photo share',
      shareSubject: 'photo share',
      publicReviewSource: 'shared image',
      iconName: 'image-outline',
      iconColor: BRAND.primaryDark,
    };
  }

  if (snapshot.sourceUrl) {
    return {
      badgeLabel: hasMedia ? 'Link + Photo' : 'Shared Link',
      receiptDetail: 'Link share',
      shareSubject: hasMedia ? 'link and photo share' : 'link share',
      publicReviewSource: 'shared source',
      iconName: 'link-outline',
      iconColor: BRAND.primaryDark,
    };
  }

  return {
    badgeLabel: 'Shared Item',
    receiptDetail: 'Shared item',
    shareSubject: 'share',
    publicReviewSource: 'shared source',
    iconName: 'share-social-outline',
    iconColor: BRAND.primaryDark,
  };
}

function payloadFromSnapshot(snapshot: SharedEventSnapshot): SharedEventPayload {
  const sourcePlatform = isFacebookUrl(snapshot.sourceUrl) ? 'facebook' : undefined;
  const mediaUrls = Array.from(new Set(snapshot.mediaUrls.filter(Boolean)));

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
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
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
  const mediaUrls = event.mediaUrls?.length
    ? event.mediaUrls
    : event.imageUrl
      ? [event.imageUrl]
      : snapshot.mediaUrls;

  return {
    ...snapshot,
    privateEventId: event.privateEventId || snapshot.privateEventId,
    sourceUrl: event.sourceUrl || snapshot.sourceUrl,
    title: event.title || snapshot.title,
    description: event.description || snapshot.description,
    startDate: event.startDate || snapshot.startDate,
    endDate: event.endDate || snapshot.endDate,
    startTime: event.startTime || snapshot.startTime,
    endTime: event.endTime || snapshot.endTime,
    locationName: event.locationName || snapshot.locationName,
    address: event.address || snapshot.address,
    latitude: event.latitude ?? snapshot.latitude,
    longitude: event.longitude ?? snapshot.longitude,
    resolvedVenueId: event.resolvedVenueId || snapshot.resolvedVenueId,
    googlePlaceId: event.googlePlaceId || snapshot.googlePlaceId,
    venueResolutionStatus: event.venueResolutionStatus || snapshot.venueResolutionStatus,
    locationScope: event.locationScope || snapshot.locationScope,
    mapMode: event.mapMode || snapshot.mapMode,
    contentKind: event.contentKind || snapshot.contentKind,
    price: event.price || snapshot.price,
    recurringPattern: event.recurringPattern || snapshot.recurringPattern,
    recurringDaysOfWeek: event.recurringDaysOfWeek?.length
      ? event.recurringDaysOfWeek
      : snapshot.recurringDaysOfWeek,
    recurrenceUntilDate: event.recurrenceUntilDate || snapshot.recurrenceUntilDate,
    mediaUrls,
    reviewReasons: event.reviewReasons || snapshot.reviewReasons,
    confidence: event.confidence ?? snapshot.confidence,
    needsUserReview: event.needsUserReview ?? snapshot.needsUserReview,
    isExpired: event.isExpired ?? snapshot.isExpired,
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
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
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

function formatRecurrence(snapshot: SharedEventSnapshot): string {
  const pattern = String(snapshot.recurringPattern || '').trim();
  if (!pattern || pattern === 'none') return '';

  const days = (snapshot.recurringDaysOfWeek || [])
    .map((day) => day.trim())
    .filter(Boolean)
    .map((day) => day.charAt(0).toUpperCase() + day.slice(1).toLowerCase());
  const schedule = days.length > 0
    ? days.join(', ')
    : pattern === 'daily'
      ? 'Every day'
      : pattern.replace(/^weekly_/, 'Every ').replace(/_/g, ' ');
  const until = snapshot.recurrenceUntilDate
    ? ` through ${formatDate(snapshot.recurrenceUntilDate)}`
    : '';
  return `${schedule}${until}`;
}

function resultEvents(result: SharedEventSubmitResult | null): SharedEventResultEvent[] {
  if (!result) return [];
  if (result.events?.length) return result.events;
  return result.event ? [result.event] : [];
}

function resultEventIsExpired(event: SharedEventResultEvent): boolean {
  return event.isExpired === true ||
    event.status === 'expired' ||
    event.reviewReasons?.includes('event_expired') === true;
}

function resultIsFullyExpired(result: SharedEventSubmitResult | null): boolean {
  if (!result) return false;
  const events = resultEvents(result);
  if (events.length > 0) return events.every(resultEventIsExpired);
  return result.status === 'expired' || result.reviewReasons?.includes('event_expired') === true;
}

function resultIsStillProcessing(result: SharedEventSubmitResult | null): boolean {
  return result?.processingStatus === 'queued' || result?.processingStatus === 'processing';
}

function publicProcessingCounts(result: SharedEventSubmitResult | null): {
  created: number;
  updated: number;
  unknownVenue: number;
  skipped: number;
  errors: number;
} {
  return {
    created: Math.max(0, Number(result?.publicProcessing?.createdEventCount || 0)),
    updated: Math.max(0, Number(result?.publicProcessing?.updatedEventCount || 0)),
    unknownVenue: Math.max(0, Number(result?.publicProcessing?.unknownVenueCount || 0)),
    skipped: Math.max(0, Number(result?.publicProcessing?.skippedCount || 0)),
    errors: Math.max(0, Number(result?.publicProcessing?.errorCount || 0)),
  };
}

function resultHasPendingAsyncWork(result: SharedEventSubmitResult | null): boolean {
  if (!result) return false;
  if (resultIsStillProcessing(result)) return true;
  const publicStatus = result.publicProcessing?.status;
  if (publicStatus === 'queued' || publicStatus === 'processing') return true;
  const scrapeStatus = result.scrapeEnrichment?.status;
  return scrapeStatus === 'reserved' ||
    scrapeStatus === 'queued' ||
    scrapeStatus === 'running' ||
    scrapeStatus === 'processing' ||
    scrapeStatus === 'duplicate';
}

function shouldWatchIngest(result: SharedEventSubmitResult | null): boolean {
  if (!result?.ingestId) return false;
  if (resultHasPendingAsyncWork(result)) return true;
  if (resultEvents(result).some((event) => event.venueResolutionStatus === 'selection_required')) {
    return true;
  }
  if (result.crowdPromotion?.events.some((event) => (
    event.status === 'collecting' || event.status === 'candidate_pending'
  ))) return true;
  const publicStatus = result.publicProcessing?.status;
  const scrapeStatus = result.scrapeEnrichment?.status;
  const terminalPublicStatus = publicStatus === 'completed' || publicStatus === 'failed' || publicStatus === 'skipped';
  const terminalScrapeStatus = scrapeStatus === 'completed' || scrapeStatus === 'failed' || scrapeStatus === 'skipped';
  return result.routing === 'public_candidate' && !terminalPublicStatus && !terminalScrapeStatus;
}

function formatCountFragment(count: number, singular: string, plural: string): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

function statusCopy(
  phase: Phase,
  result: SharedEventSubmitResult | null,
  errorMessage: string,
  eventCount: number,
  sourceContext: SharedEventSourceContext,
  requiresRouteReview: boolean
): {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  color: string;
} {
  if (phase === 'processing') {
    const uploadAccepted = Boolean(result?.ingestId);
    return {
      icon: uploadAccepted ? 'scan-outline' : 'cloud-upload-outline',
      title: uploadAccepted ? 'Reading your share' : 'Uploading your photo',
      detail: uploadAccepted
        ? `The upload is safe. Return to GathR now while the ${sourceContext.shareSubject} is checked.`
        : 'This is the only step that needs this screen. Return to GathR unlocks as soon as the upload is safe.',
      color: BRAND.primary,
    };
  }

  if (result?.publicProcessing?.status === 'processing' || result?.publicProcessing?.status === 'queued') {
    return {
      icon: 'sync-outline',
      title: 'Finishing the public scan',
      detail: result.publicProcessing.message ||
        `GathR is scanning the ${sourceContext.publicReviewSource}. You can leave this screen while it finishes.`,
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

  if (result?.publicProcessing?.status === 'completed') {
    const counts = publicProcessingCounts(result);
    const changedCount = counts.created + counts.updated;
    if (changedCount > 0) {
      const fragments = [
        formatCountFragment(counts.created, 'event added', 'events added'),
        formatCountFragment(counts.updated, 'event updated', 'events updated'),
        formatCountFragment(counts.unknownVenue, 'needs venue review', 'need venue review'),
      ].filter(Boolean);
      return {
        icon: 'earth-outline',
        title: 'Added to GathR',
        detail: fragments.length > 0
          ? `Full scan finished: ${fragments.join(', ')}.`
          : result.publicProcessing.message || 'The full scan finished.',
        color: BRAND.success,
      };
    }
    if (counts.unknownVenue > 0) {
      return {
        icon: 'location-outline',
        title: 'Needs venue review',
        detail: `${counts.unknownVenue} ${counts.unknownVenue === 1 ? 'event needs' : 'events need'} a venue match before appearing publicly.`,
        color: BRAND.warning,
      };
    }
    return {
      icon: 'earth-outline',
      title: 'Review complete',
      detail: result.publicProcessing.message || 'The full scan finished with no new public events.',
      color: BRAND.success,
    };
  }

  if (result?.publicProcessing?.status === 'failed') {
    return {
      icon: 'alert-circle-outline',
      title: 'Saved for review',
      detail: result.publicProcessing.message || 'GathR saved this share, but the full public scan could not finish.',
      color: BRAND.warning,
    };
  }

  if (resultIsFullyExpired(result)) {
    return {
      icon: 'time-outline',
      title: 'Already happened',
      detail: 'GathR saved this share, but it looks like the event has already passed.',
      color: BRAND.warning,
    };
  }

  const unresolvedVenue = resultEvents(result).find((event) => (
    event.venueResolutionStatus === 'selection_required'
  ));
  if (unresolvedVenue) {
    return {
      icon: 'location-outline',
      title: 'Choose the venue',
      detail: `GathR read the event details, but needs you to confirm where ${unresolvedVenue.locationName || 'it'} takes place.`,
      color: BRAND.warning,
    };
  }

  const crowd = result?.crowdPromotion;
  if (crowd && crowd.promotedEventCount > 0) {
    return {
      icon: 'people-circle-outline',
      title: 'Confirmed by the community',
      detail: crowd.promotedEventCount === 1
        ? 'Independent submissions confirmed this event, so it is now available to everyone in GathR.'
        : `${crowd.promotedEventCount} events were independently confirmed and are now available to everyone in GathR.`,
      color: BRAND.success,
    };
  }
  if (crowd && crowd.candidateEventCount > 0) {
    return {
      icon: 'shield-checkmark-outline',
      title: 'Community threshold reached',
      detail: crowd.candidateEventCount === 1
        ? 'Three independent submissions agree. GathR is checking the venue and duplicate safeguards before making it global.'
        : `${crowd.candidateEventCount} events reached independent confirmation and are completing GathR's safety checks.`,
      color: BRAND.success,
    };
  }
  if (crowd && crowd.reviewEventCount > 0) {
    return {
      icon: 'shield-outline',
      title: 'Community confirmed; under review',
      detail: crowd.reviewEventCount === 1
        ? 'Independent submissions agree, but GathR could not safely resolve every public detail. Your saved copy is unaffected while the event is reviewed.'
        : `${crowd.reviewEventCount} independently confirmed events need a venue or safety review before they can become global.`,
      color: BRAND.warning,
    };
  }
  if (crowd && crowd.collectingEventCount > 0) {
    const count = Math.min(crowd.maxContributorCount, crowd.threshold);
    return {
      icon: 'people-outline',
      title: 'Saved and helping the community',
      detail: `${count} of ${crowd.threshold} independent confirmations. It stays private to you until matching submissions and GathR's safety checks agree.`,
      color: BRAND.primary,
    };
  }

  const ineligibilityReason = crowdIneligibilityReason(crowd);
  if (crowd && crowd.eligibleEventCount === 0 && ineligibilityReason) {
    return {
      icon: 'lock-closed-outline',
      title: 'Saved privately',
      detail: crowdIneligibilityMessage(ineligibilityReason),
      color: BRAND.warning,
    };
  }

  if (result?.routing === 'public_candidate') {
    return {
      icon: 'earth-outline',
      title: 'Saved and queued for review',
      detail: eventCount > 1
        ? `GathR saved ${eventCount} events. The ${sourceContext.publicReviewSource} may add or update public listings after review.`
        : 'GathR saved this share and will add or update the event after review if it is valid.',
      color: BRAND.success,
    };
  }

  if (phase === 'needs_review' || result?.needsUserReview) {
    return {
      icon: requiresRouteReview ? 'map-outline' : 'shield-outline',
      title: requiresRouteReview ? 'Saved for route review' : 'Saved for review',
      detail: requiresRouteReview
        ? 'The event is in your GathR. Its route stays private until the path can be checked safely.'
        : 'The event is in your GathR while its venue and details are checked.',
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
    eventSnapshot.description
  )).length;
}

function summaryTitleForResult(
  result: SharedEventSubmitResult | null,
  parsedDetailsCount: number,
  eventSnapshots: SharedEventSnapshot[]
): string {
  if (!result) return 'Share received';
  const parsedKinds = eventSnapshots
    .filter((eventSnapshot) => (
      eventSnapshot.title ||
      eventSnapshot.startDate ||
      eventSnapshot.startTime ||
      eventSnapshot.locationName ||
      eventSnapshot.address ||
      eventSnapshot.description
    ))
    .map((eventSnapshot) => eventSnapshot.contentKind);
  const allSpecials = parsedKinds.length > 0 && parsedKinds.every((kind) => kind === 'special');
  const allEvents = parsedKinds.length > 0 && parsedKinds.every((kind) => kind !== 'special');
  const singularLabel = allSpecials ? 'Special' : 'Event';
  const pluralLabel = allSpecials ? 'specials' : allEvents ? 'events' : 'items';
  if (result.publicProcessing?.status === 'completed') {
    const counts = publicProcessingCounts(result);
    const changed = counts.created + counts.updated;
    if (changed > 0 && counts.unknownVenue > 0) return `${changed} added or updated, ${counts.unknownVenue} need venue review`;
    if (changed > 0) return `${changed} added or updated`;
    if (counts.unknownVenue > 0) return `${counts.unknownVenue} need venue review`;
  }
  if (resultIsFullyExpired(result)) {
    return parsedDetailsCount > 1
      ? `Expired ${pluralLabel} found`
      : `Expired ${singularLabel.toLowerCase()} found`;
  }
  if (result.needsUserReview) {
    if (parsedDetailsCount > 1) return `${parsedDetailsCount} ${pluralLabel} saved for review`;
    if (parsedDetailsCount === 1) return `${singularLabel} saved for review`;
  }
  if (parsedDetailsCount > 1) return `${parsedDetailsCount} ${pluralLabel} saved`;
  if (parsedDetailsCount === 1) return `${singularLabel} saved`;
  return 'Share received';
}

function reviewReasonLabel(value: string): string {
  switch (value) {
    case 'missing_title':
      return 'Needs title';
    case 'missing_start_date':
      return 'Needs date';
    case 'missing_location':
      return 'Needs place';
    case 'venue_selection_required':
      return 'Confirm venue';
    case 'venue_not_confirmed':
      return 'Venue not confirmed';
    case 'event_expired':
      return 'Already happened';
    default:
      return value.replace(/_/g, ' ');
  }
}

export default function SharedEventScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { resetShareIntent } = useShareIntentContext();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams();
  const initial = useMemo(
    () => buildInitialState(params as Record<string, string | string[] | undefined>),
    [params]
  );
  const initialSignature = useMemo(() => signatureForSnapshot(initial), [initial]);
  const requestedIngestId = firstParam(params.ingestId);
  const submittedSignatureRef = useRef('');
  const ingestUnsubscribeRef = useRef<null | (() => void)>(null);
  const venueCrowdOverrideRef = useRef<{
    ingestId: string;
    crowdPromotion: SharedEventCrowdPromotionSummary;
  } | null>(null);

  const [snapshot, setSnapshot] = useState<SharedEventSnapshot>(initial);
  const [eventSnapshots, setEventSnapshots] = useState<SharedEventSnapshot[]>([initial]);
  const [previewUri, setPreviewUri] = useState(
    initial.mediaFiles[0]?.path || initial.mediaUrls[0] || ''
  );
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('processing');
  const [result, setResult] = useState<SharedEventSubmitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<
    VerificationEmailResult | { status: 'sending' } | null
  >(null);
  const [venueCandidates, setVenueCandidates] = useState<SharedEventVenueCandidate[]>([]);
  const [venueSearchLoading, setVenueSearchLoading] = useState(false);
  const [venueSearchError, setVenueSearchError] = useState('');
  const [venueMenuOpen, setVenueMenuOpen] = useState(false);
  const [venueConfirmingId, setVenueConfirmingId] = useState('');
  const [uploadJob, setUploadJob] = useState<SharedEventUploadJob | null>(null);
  const isReturningToMapRef = useRef(false);
  const verificationAttemptedRef = useRef(false);
  const handledUploadJobRef = useRef('');

  const stopIngestWatcher = useCallback(() => {
    ingestUnsubscribeRef.current?.();
    ingestUnsubscribeRef.current = null;
  }, []);

  const applySubmitResult = useCallback((baseSnapshot: SharedEventSnapshot, submitResult: SharedEventSubmitResult) => {
    const nextEventSnapshots = snapshotsFromResult(baseSnapshot, submitResult);
    setResult(submitResult);
    setEventSnapshots(nextEventSnapshots);
    setSelectedEventIndex(0);
    setSnapshot(nextEventSnapshots[0] || mergeResultIntoSnapshot(baseSnapshot, submitResult));
    setPhase(submitResult.needsUserReview ? 'needs_review' : 'saved');
  }, []);

  const startIngestWatcher = useCallback((ingestId: string, baseSnapshot: SharedEventSnapshot) => {
    stopIngestWatcher();
    ingestUnsubscribeRef.current = watchSharedEventIngest(
      ingestId,
      (nextResult) => {
        const venueCrowdOverride = venueCrowdOverrideRef.current;
        const incomingCrowdHasCaughtUp = nextResult.crowdPromotion?.events.some((event) => (
          event.status !== 'ineligible'
        )) === true;
        const effectiveResult = venueCrowdOverride?.ingestId === ingestId && !incomingCrowdHasCaughtUp
          ? { ...nextResult, crowdPromotion: venueCrowdOverride.crowdPromotion }
          : nextResult;
        if (venueCrowdOverride?.ingestId === ingestId && incomingCrowdHasCaughtUp) {
          venueCrowdOverrideRef.current = null;
        }
        setResult(effectiveResult);
        if (effectiveResult.processingStatus === 'failed') {
          stopIngestWatcher();
          setPhase('error');
          setErrorMessage(effectiveResult.processingError || 'GathR could not process this share.');
          return;
        }
        if (effectiveResult.processingStatus === 'completed' || resultEvents(effectiveResult).length > 0) {
          const shouldContinueWatching = shouldWatchIngest(effectiveResult);
          if (!shouldContinueWatching) {
            stopIngestWatcher();
          }
          applySubmitResult(baseSnapshot, effectiveResult);
          return;
        }
        if (!shouldWatchIngest(effectiveResult)) {
          stopIngestWatcher();
        }
      },
      (error) => {
        stopIngestWatcher();
        setPhase('error');
        setErrorMessage(error.message || 'GathR could not watch this share.');
      }
    );
  }, [applySubmitResult, stopIngestWatcher]);

  const handleAcceptedSubmit = useCallback((
    baseSnapshot: SharedEventSnapshot,
    submitResult: SharedEventSubmitResult
  ) => {
    setResult(submitResult);
    if (submitResult.ingestId && resultIsStillProcessing(submitResult)) {
      void trackPendingSharedEventIngest({
        ingestId: submitResult.ingestId,
        sourceLabel: sharedEventSourceContext(baseSnapshot).badgeLabel,
      });
    }
    if (submitResult.ingestId && shouldWatchIngest(submitResult)) {
      startIngestWatcher(submitResult.ingestId, baseSnapshot);
      if (resultIsStillProcessing(submitResult) && resultEvents(submitResult).length === 0) {
        return;
      }
    }
    applySubmitResult(baseSnapshot, submitResult);
  }, [applySubmitResult, startIngestWatcher]);

  const submitSnapshot = useCallback(async (nextSnapshot: SharedEventSnapshot) => {
    if (!hasUsableSnapshot(nextSnapshot)) {
      setPhase('error');
      setErrorMessage('Facebook did not send an event link or event text.');
      return;
    }

    setPhase('processing');
    setErrorMessage('');
    venueCrowdOverrideRef.current = null;
    stopIngestWatcher();

    try {
      if (nextSnapshot.mediaFiles.some((file) => !/^https?:\/\//i.test(file.path))) {
        if (!user) throw new Error('Log in to upload shared event images.');
        const nextJob = await enqueueSharedEventUpload({
          ownerUid: user.uid,
          payload: payloadFromSnapshot(nextSnapshot),
          files: nextSnapshot.mediaFiles,
          sourceLabel: sharedEventSourceContext(nextSnapshot).badgeLabel,
        });
        setUploadJob(nextJob);
        return;
      }
      const submitResult = await submitSharedEvent(payloadFromSnapshot(nextSnapshot));
      handleAcceptedSubmit(nextSnapshot, submitResult);
    } catch (error) {
      setPhase('error');
      setErrorMessage(error instanceof Error ? error.message : 'Please try again.');
    }
  }, [handleAcceptedSubmit, stopIngestWatcher, user]);

  useEffect(() => subscribeSharedEventUploadJobs((jobs) => {
    const current = uploadJob ? jobs.find((job) => job.id === uploadJob.id) : undefined;
    if (!current) return;
    setUploadJob(current);
    if (current.status === 'retry_waiting') {
      setPhase('error');
      setErrorMessage(current.error || 'The upload was interrupted.');
      return;
    }
    if (current.status !== 'accepted' || !current.submitResult) {
      setPhase('processing');
      setErrorMessage('');
      return;
    }
    if (handledUploadJobRef.current === current.id) return;
    handledUploadJobRef.current = current.id;
    handleAcceptedSubmit(snapshot, current.submitResult);
  }), [handleAcceptedSubmit, snapshot, uploadJob?.id]);

  useEffect(() => {
    const submissionKey = requestedIngestId ? `ingest:${requestedIngestId}` : initialSignature;
    if (submittedSignatureRef.current === submissionKey) return;
    submittedSignatureRef.current = submissionKey;
    setSnapshot(initial);
    setEventSnapshots([initial]);
    const nextPreviewUri = initial.mediaFiles[0]?.path || initial.mediaUrls[0] || '';
    if (nextPreviewUri) setPreviewUri(nextPreviewUri);
    setSelectedEventIndex(0);
    setShowDetails(false);
    setResult(null);
    setUploadJob(null);
    handledUploadJobRef.current = '';
    setErrorMessage('');
    venueCrowdOverrideRef.current = null;
    stopIngestWatcher();
    if (requestedIngestId) {
      setPhase('processing');
      startIngestWatcher(requestedIngestId, initial);
    } else {
      void submitSnapshot(initial);
    }
  }, [initial, initialSignature, requestedIngestId, startIngestWatcher, stopIngestWatcher, submitSnapshot]);

  useEffect(() => () => stopIngestWatcher(), [stopIngestWatcher]);

  const accountNeedsVerification = crowdIneligibilityReason(result?.crowdPromotion) === 'account_not_eligible';

  useEffect(() => {
    if (!accountNeedsVerification || verificationAttemptedRef.current) return;
    verificationAttemptedRef.current = true;
    setVerificationEmail({ status: 'sending' });
    void requestCurrentUserVerificationEmail().then(setVerificationEmail);
  }, [accountNeedsVerification]);

  const eventCount = eventSnapshots.length;
  const unresolvedVenueEvent = useMemo(() => resultEvents(result).find((event) => (
    event.venueResolutionStatus === 'selection_required' && Boolean(event.privateEventId)
  )), [result]);

  useEffect(() => {
    const privateEventId = unresolvedVenueEvent?.privateEventId;
    if (!privateEventId) {
      setVenueCandidates([]);
      setVenueSearchError('');
      setVenueMenuOpen(false);
      return;
    }
    let active = true;
    setVenueSearchLoading(true);
    setVenueSearchError('');
    void searchSharedEventVenueCandidates(privateEventId)
      .then((searchResult) => {
        if (!active) return;
        setVenueCandidates(searchResult.candidates || []);
        setVenueMenuOpen(true);
      })
      .catch((error) => {
        if (!active) return;
        setVenueSearchError(error instanceof Error ? error.message : 'Could not search for venues.');
      })
      .finally(() => {
        if (active) setVenueSearchLoading(false);
      });
    return () => {
      active = false;
    };
  }, [unresolvedVenueEvent?.privateEventId]);

  const chooseVenue = useCallback(async (placeId?: string) => {
    const privateEventId = unresolvedVenueEvent?.privateEventId;
    if (!privateEventId || venueConfirmingId) return;
    setVenueConfirmingId(placeId || 'none');
    setVenueSearchError('');
    try {
      const confirmation = await confirmSharedEventVenue({
        privateEventId,
        ...(placeId ? { placeId } : { noMatch: true }),
      });
      // Venue resolution and crowd contribution are two server writes. The ingest
      // listener can briefly observe the resolved venue with its old ineligible
      // crowd status, so use the endpoint's final summary as the authoritative
      // result and resume the watcher when community confirmation is ongoing.
      if (confirmation.crowdPromotion) {
        venueCrowdOverrideRef.current = {
          ingestId: confirmation.ingestId,
          crowdPromotion: confirmation.crowdPromotion,
        };
        setResult((current) => current
          ? { ...current, crowdPromotion: confirmation.crowdPromotion }
          : current);
        const crowdStillActive = confirmation.crowdPromotion.events.some((event) => (
          event.status === 'collecting' || event.status === 'candidate_pending'
        ));
        if (crowdStillActive) {
          startIngestWatcher(confirmation.ingestId, snapshot);
        }
      }
      setVenueMenuOpen(false);
    } catch (error) {
      setVenueSearchError(error instanceof Error ? error.message : 'Could not confirm that venue.');
    } finally {
      setVenueConfirmingId('');
    }
  }, [snapshot, startIngestWatcher, unresolvedVenueEvent?.privateEventId, venueConfirmingId]);
  const cardWidth = Math.max(280, width - 32);
  const sourceContext = sharedEventSourceContext(snapshot);
  const requiresRouteReview = eventSnapshots.some((eventSnapshot) => (
    eventSnapshot.reviewReasons.includes('route_event_requires_review')
  ));
  const status = statusCopy(
    phase,
    result,
    errorMessage,
    eventCount,
    sourceContext,
    requiresRouteReview
  );
  const parsedDetailsCount = phase === 'processing' || phase === 'error'
    ? 0
    : usefulParsedDetailsCount(result, eventSnapshots);
  const detailsAvailable = parsedDetailsCount > 0;
  const shouldShowDetails = showDetails && detailsAvailable;
  const summaryTitle = summaryTitleForResult(result, parsedDetailsCount, eventSnapshots);
  const hasFinalPublicProcessing = result?.publicProcessing?.status === 'completed';
  const isExpiredResult = resultIsFullyExpired(result);
  const isUploading = phase === 'processing' && !result?.ingestId;
  const isSecuringUpload = isUploading && snapshot.mediaFiles.length > 0 && !uploadJob;
  const publicCounts = publicProcessingCounts(result);
  const progressStage = sharedEventProgressStage(phase, Boolean(result?.ingestId));
  const finalStepLabel = phase === 'error'
    ? 'Retry'
    : result?.crowdPromotion?.promotedEventCount
      ? 'Global'
      : result?.needsUserReview
        ? 'Review'
        : 'Ready';
  const crowdCount = Math.min(
    result?.crowdPromotion?.maxContributorCount || 0,
    result?.crowdPromotion?.threshold || 3
  );
  const crowdThreshold = result?.crowdPromotion?.threshold || 3;
  const showCrowdProgress = Boolean(result?.crowdPromotion && (
    result.crowdPromotion.collectingEventCount > 0 ||
    result.crowdPromotion.candidateEventCount > 0 ||
    result.crowdPromotion.reviewEventCount > 0 ||
    result.crowdPromotion.promotedEventCount > 0
  ));
  const routingLabel = phase === 'processing'
    ? isUploading ? 'Uploading' : 'Reading'
    : phase === 'error'
      ? 'Retry needed'
      : phase === 'needs_review' || result?.needsUserReview
        ? 'Needs review'
      : result?.publicProcessing?.status === 'processing' || result?.publicProcessing?.status === 'queued'
        ? 'Scanning'
      : result?.publicProcessing?.status === 'completed' && publicCounts.created + publicCounts.updated > 0
        ? 'Added'
      : result?.publicProcessing?.status === 'completed' && publicCounts.unknownVenue > 0
        ? 'Venue review'
      : isExpiredResult
        ? 'Expired'
      : result?.crowdPromotion?.promotedEventCount
        ? 'Community confirmed'
      : result?.crowdPromotion?.candidateEventCount
        ? 'Safety check'
      : result?.crowdPromotion?.reviewEventCount
        ? 'Venue review'
      : result?.crowdPromotion?.collectingEventCount
        ? `${Math.min(result.crowdPromotion.maxContributorCount, result.crowdPromotion.threshold)}/${result.crowdPromotion.threshold} confirmed`
      : result?.routing === 'public_candidate'
        ? 'Public review'
        : 'Private';
  const routingIcon: keyof typeof Ionicons.glyphMap = phase === 'processing'
    ? 'sync-outline'
    : phase === 'error'
      ? 'alert-circle-outline'
      : phase === 'needs_review' || result?.needsUserReview
        ? requiresRouteReview ? 'map-outline' : 'shield-outline'
      : result?.publicProcessing?.status === 'processing' || result?.publicProcessing?.status === 'queued'
        ? 'sync-outline'
      : result?.publicProcessing?.status === 'completed' && publicCounts.created + publicCounts.updated > 0
        ? 'checkmark-circle-outline'
      : result?.publicProcessing?.status === 'completed' && publicCounts.unknownVenue > 0
        ? 'location-outline'
      : isExpiredResult
        ? 'time-outline'
      : result?.crowdPromotion?.promotedEventCount
        ? 'people-circle-outline'
      : result?.crowdPromotion?.candidateEventCount
        ? 'shield-checkmark-outline'
      : result?.crowdPromotion?.reviewEventCount
        ? 'shield-outline'
      : result?.crowdPromotion?.collectingEventCount
        ? 'people-outline'
      : result?.routing === 'public_candidate'
        ? 'earth-outline'
        : 'lock-closed-outline';

  const onCarouselMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 12));
    setSelectedEventIndex(Math.max(0, Math.min(eventCount - 1, nextIndex)));
  }, [cardWidth, eventCount]);

  const renderEventDetailsPanel = (eventSnapshot: SharedEventSnapshot, index: number) => {
    const title = eventSnapshot.title || (eventCount > 1 ? `Saved event ${index + 1}` : summaryTitle);
    const dateTime = eventSnapshot.startDate || eventSnapshot.startTime ? formatDateTime(eventSnapshot) : '';
    const recurrence = formatRecurrence(eventSnapshot);
    const description = eventSnapshot.description;
    const crowdEvent = result?.crowdPromotion?.events.find((entry) => (
      entry.privateEventId === eventSnapshot.privateEventId
    ));
    const isPubliclyAvailable = publicCounts.created + publicCounts.updated > 0 ||
      crowdEvent?.status === 'promoted' || crowdEvent?.status === 'duplicate_existing';
    const visibilityDetail = isPubliclyAvailable
      ? 'Available to everyone in GathR'
      : crowdEvent?.status === 'collecting'
        ? `Private to you - ${Math.min(crowdEvent.contributorCount, crowdEvent.threshold)} of ${crowdEvent.threshold} community confirmations`
        : crowdEvent?.status === 'candidate_pending'
          ? 'Private to you while community safety checks finish'
          : crowdEvent?.status === 'needs_review'
            ? 'Private to you while GathR reviews it'
            : crowdEvent?.status === 'ineligible'
              ? `Private to your account - ${crowdIneligibilityMessage(crowdEvent.reason)}`
            : 'Private to your account';
    const detailRows: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
      ...(dateTime ? [{ icon: 'calendar-outline' as const, text: dateTime }] : []),
      ...(eventSnapshot.locationName ? [{ icon: 'business-outline' as const, text: eventSnapshot.locationName }] : []),
      ...(eventSnapshot.address ? [{ icon: 'location-outline' as const, text: eventSnapshot.address }] : []),
      ...(eventSnapshot.price ? [{ icon: 'pricetag-outline' as const, text: eventSnapshot.price }] : []),
      ...(recurrence ? [{ icon: 'repeat-outline' as const, text: recurrence }] : []),
      ...(eventSnapshot.mapMode === 'route'
        ? [{ icon: 'map-outline' as const, text: 'Route event - path pending review' }]
        : []),
      ...(!eventSnapshot.locationName && !eventSnapshot.address && eventSnapshot.locationScope === 'unknown'
        ? [{ icon: 'location-outline' as const, text: 'Location still needs confirmation' }]
        : []),
      { icon: isPubliclyAvailable
        ? 'earth-outline' as const
        : 'lock-closed-outline' as const, text: visibilityDetail },
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
        <View style={styles.detailBody}>
          <View style={styles.detailHeadingRow}>
            <Text style={styles.detailKicker}>{eventCount > 1 ? `${index + 1} of ${eventCount}` : 'Saved details'}</Text>
            <Text style={styles.detailSource}>
              {eventSnapshot.contentKind === 'special' ? 'Special' : eventSnapshot.mapMode === 'route' ? 'Route' : 'Event'}
            </Text>
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
              GathR saved the share, but no reliable event fields were available to show.
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

  const handleFinish = useCallback(() => {
    if (isSecuringUpload || isReturningToMapRef.current) return;
    isReturningToMapRef.current = true;
    const venueStillNeeded = resultEvents(result).some((event) => (
      event.venueResolutionStatus === 'selection_required'
    ));
    if (result?.ingestId && (resultIsStillProcessing(result) || venueStillNeeded)) {
      void trackPendingSharedEventIngest({
        ingestId: result.ingestId,
        sourceLabel: sourceContext.badgeLabel,
      });
    }
    const now = Date.now();
    const globalAny = globalThis as any;
    globalAny.__gathrReturningFromSharedEventAt = now;
    globalAny.__gathrSharedEventReturnGuardUntil = now + SHARED_EVENT_RETURN_INTERACTION_GUARD_MS;
    globalAny.__gathrDismissedShareIntentUntil = now + 15000;
    globalAny.__gathrDismissedShareIntentSignature = globalAny.__gathrCurrentShareIntentSignature || '';
    globalAny.__gathrDismissedShareLaunchUrl = globalAny.__gathrCurrentShareLaunchUrl || '';
    resetShareIntent();
    const shouldRefreshMap = resultEvents(result).some((event) => Boolean(event.privateEventId));
    router.replace('/(tabs)/map');

    if (shouldRefreshMap) {
      InteractionManager.runAfterInteractions(() => {
        void refreshMapAfterSharedEventSave(result?.privateEventIds).catch((error) => {
          console.warn('[SharedEvent] Failed to refresh saved event on map:', error);
        });
      });
    }
  }, [isSecuringUpload, resetShareIntent, result, router, sourceContext.badgeLabel]);

  const handleRetry = useCallback(() => {
    setPhase('processing');
    setErrorMessage('');
    if (uploadJob) {
      void retrySharedEventUpload(uploadJob.id);
      return;
    }
    void submitSnapshot(snapshot);
  }, [snapshot, submitSnapshot, uploadJob]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isSecuringUpload) {
        void handleFinish();
      }
      return true;
    });
    return () => subscription.remove();
  }, [handleFinish, isSecuringUpload]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={handleFinish} disabled={isSecuringUpload}>
          <Ionicons name="chevron-back" size={24} color={isSecuringUpload ? '#A7B4C3' : BRAND.ink} />
        </Pressable>
        <View style={styles.headerBrand}>
          <Image source={GATHR_LOGO} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerTitle}>Share to GathR</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={handleFinish} disabled={isSecuringUpload}>
          <Ionicons name="map-outline" size={22} color={isSecuringUpload ? '#A7B4C3' : BRAND.ink} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroller} contentContainerStyle={styles.content}>
        <View style={[styles.receiptCard, { borderColor: `${status.color}44` }]}>
          <View style={[styles.receiptAccent, { backgroundColor: status.color }]} />

          <View style={styles.receiptTopRow}>
            <View style={styles.sourceBadge}>
              <Ionicons name={sourceContext.iconName} size={15} color={sourceContext.iconColor} />
              <Text style={styles.sourceBadgeText}>{sourceContext.badgeLabel}</Text>
            </View>
            <View style={[styles.receiptRouteBadge, {
              backgroundColor: `${status.color}12`,
              borderColor: `${status.color}38`,
            }]}>
              <Ionicons name={routingIcon} size={14} color={status.color} />
              <Text style={[styles.receiptRouteText, { color: status.color }]}>{routingLabel}</Text>
            </View>
          </View>

          <View style={styles.receiptHero}>
            <View style={styles.receiptHeroCopy}>
              <View style={styles.receiptEyebrowRow}>
                <View style={[styles.receiptEyebrowIcon, { backgroundColor: `${status.color}16` }]}>
                  <Ionicons name={status.icon} size={15} color={status.color} />
                </View>
                <Text style={[styles.receiptEyebrowText, { color: status.color }]}>
                  {phase === 'processing' ? 'In progress' : phase === 'error' ? 'Action needed' : 'Share complete'}
                </Text>
              </View>
              <Text style={styles.receiptTitle}>{status.title}</Text>
              <Text style={styles.receiptDetail}>{status.detail}</Text>
            </View>
            {previewUri ? (
              <View style={styles.receiptPreviewFrame}>
                <Image source={{ uri: previewUri }} style={styles.receiptPreview} resizeMode="cover" />
                <View style={styles.receiptPreviewBadge}>
                  <Ionicons name="image-outline" size={12} color="#FFFFFF" />
                </View>
              </View>
            ) : (
              <View style={[styles.receiptFallbackIcon, { backgroundColor: `${status.color}14` }]}>
                <Ionicons name={status.icon} size={30} color={status.color} />
              </View>
            )}
          </View>

          <View style={styles.progressCard}>
            {['Received', 'Uploading', 'Reading', finalStepLabel].map((label, index) => {
              const isDone = index < progressStage || (progressStage === 3 && index === 3);
              const isActive = index === progressStage && progressStage < 3;
              const stepColor = phase === 'error' && isActive ? BRAND.danger : isDone ? BRAND.success : status.color;
              return (
                <React.Fragment key={label}>
                  <View style={styles.progressStep}>
                    <View style={[
                      styles.progressDot,
                      isDone && { backgroundColor: stepColor, borderColor: stepColor },
                      isActive && { borderColor: stepColor, backgroundColor: `${stepColor}16` },
                    ]}>
                      {isDone ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
                    </View>
                    <Text style={[
                      styles.progressLabel,
                      (isDone || isActive) && { color: stepColor },
                    ]}>{label}</Text>
                  </View>
                  {index < 3 ? (
                    <View style={[
                      styles.progressConnector,
                      index < progressStage && { backgroundColor: BRAND.success },
                    ]} />
                  ) : null}
                </React.Fragment>
              );
            })}
          </View>

          {phase === 'processing' ? (
            <View style={[
              styles.processingNotice,
              isUploading ? styles.processingNoticeUploading : styles.processingNoticeReady,
            ]}>
              <View style={styles.processingNoticeIcon}>
                <ActivityIndicator size="small" color={BRAND.primaryDark} />
              </View>
              <View style={styles.processingNoticeCopy}>
                <Text style={styles.processingNoticeTitle}>
                  {isSecuringUpload
                    ? 'Securing your photo'
                    : isUploading
                      ? 'Upload continuing safely'
                      : 'Stay tuned - we will let you know'}
                </Text>
                <Text style={styles.processingNoticeDetail}>
                  {isSecuringUpload
                    ? 'This quick device copy makes the upload safe to continue after you leave.'
                    : isUploading
                      ? 'You can return to GathR or switch apps. We will notify you when the scan is ready.'
                      : 'You can return now. GathR will show an in-app alert when this is ready, or a notification if you are using another app.'}
                </Text>
              </View>
            </View>
          ) : null}

          {showCrowdProgress ? (
            <View style={styles.communityProgressCard}>
              <View style={styles.communityProgressCopy}>
                <Text style={styles.communityProgressLabel}>Community confirmations</Text>
                <Text style={styles.communityProgressDetail}>
                  {crowdCount} of {crowdThreshold} independent shares
                </Text>
              </View>
              <View style={styles.communityDots}>
                {Array.from({ length: crowdThreshold }).map((_, index) => (
                  <View
                    key={`community-${index}`}
                    style={[
                      styles.communityDot,
                      index < crowdCount && styles.communityDotActive,
                    ]}
                  >
                    <Ionicons name="person" size={12} color={index < crowdCount ? '#FFFFFF' : '#94A3B8'} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {unresolvedVenueEvent ? (
            <View style={styles.venueResolutionCard}>
              <View style={styles.venueResolutionHeader}>
                <View style={styles.venueResolutionIcon}>
                  <Ionicons name="location-outline" size={20} color={BRAND.warning} />
                </View>
                <View style={styles.venueResolutionCopy}>
                  <Text style={styles.venueResolutionTitle}>Confirm the venue</Text>
                  <Text style={styles.venueResolutionDetail}>
                    {`Select the correct Places match for ${unresolvedVenueEvent.locationName || 'this event'} before submitting it to the community.`}
                  </Text>
                </View>
              </View>

              <Pressable
                style={styles.venueDropdownButton}
                onPress={() => setVenueMenuOpen((open) => !open)}
                disabled={venueSearchLoading || Boolean(venueConfirmingId)}
              >
                <View style={styles.venueDropdownText}>
                  <Text style={styles.venueDropdownLabel}>
                    {venueSearchLoading ? 'Searching nearby places...' : 'Choose a venue'}
                  </Text>
                  {!venueSearchLoading ? (
                    <Text style={styles.venueDropdownHint}>
                      {venueCandidates.length > 0
                        ? `${venueCandidates.length} possible ${venueCandidates.length === 1 ? 'match' : 'matches'}`
                        : 'No confident matches found'}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name={venueMenuOpen ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={BRAND.primaryDark}
                />
              </Pressable>

              {venueMenuOpen && !venueSearchLoading ? (
                <View style={styles.venueOptions}>
                  {venueCandidates.map((candidate, index) => (
                    <Pressable
                      key={candidate.placeId}
                      style={styles.venueOption}
                      onPress={() => void chooseVenue(candidate.placeId)}
                      disabled={Boolean(venueConfirmingId)}
                    >
                      <View style={styles.venueOptionRank}>
                        <Text style={styles.venueOptionRankText}>{index + 1}</Text>
                      </View>
                      <View style={styles.venueOptionCopy}>
                        <Text style={styles.venueOptionName}>{candidate.name}</Text>
                        <Text style={styles.venueOptionAddress} numberOfLines={2}>
                          {candidate.formattedAddress}
                        </Text>
                      </View>
                      {venueConfirmingId === candidate.placeId ? (
                        <Ionicons name="sync-outline" size={19} color={BRAND.primaryDark} />
                      ) : (
                        <Ionicons name="chevron-forward" size={19} color="#8BA0B5" />
                      )}
                    </Pressable>
                  ))}
                  <Pressable
                    style={[styles.venueOption, styles.venueNoneOption]}
                    onPress={() => void chooseVenue()}
                    disabled={Boolean(venueConfirmingId)}
                  >
                    <View style={[styles.venueOptionRank, styles.venueNoneIcon]}>
                      <Ionicons name="help-outline" size={16} color={BRAND.muted} />
                    </View>
                    <View style={styles.venueOptionCopy}>
                      <Text style={styles.venueOptionName}>None of these</Text>
                      <Text style={styles.venueOptionAddress}>Keep it private for manual review.</Text>
                    </View>
                  </Pressable>
                </View>
              ) : null}

              {venueSearchError ? (
                <Text style={styles.venueSearchError}>{venueSearchError}</Text>
              ) : null}
            </View>
          ) : null}

          {accountNeedsVerification && verificationEmail ? (
            <View style={styles.verificationCard}>
              <View style={styles.verificationIcon}>
                <Ionicons
                  name={verificationEmail.status === 'failed' || verificationEmail.status === 'unavailable'
                    ? 'alert-circle-outline'
                    : verificationEmail.status === 'sending'
                      ? 'mail-unread-outline'
                      : 'mail-outline'}
                  size={20}
                  color={verificationEmail.status === 'failed' || verificationEmail.status === 'unavailable'
                    ? BRAND.warning
                    : BRAND.primaryDark}
                />
              </View>
              <View style={styles.verificationCopy}>
                <Text style={styles.verificationTitle}>
                  {verificationEmail.status === 'sending'
                    ? 'Sending verification email'
                    : verificationEmail.status === 'sent'
                      ? 'Verification email sent'
                      : verificationEmail.status === 'recently_sent'
                        ? 'Check your inbox'
                        : verificationEmail.status === 'already_verified'
                          ? 'Email verified'
                          : 'Verification email unavailable'}
                </Text>
                <Text style={styles.verificationDetail}>
                  {verificationEmail.status === 'sending'
                    ? 'GathR is requesting a secure verification link from Firebase.'
                    : verificationEmail.status === 'sent'
                      ? 'Open the link in the email, then share the photo again so it can count toward community confirmation.'
                      : verificationEmail.status === 'recently_sent'
                        ? 'A verification link was sent recently. Open it, then share the photo again.'
                        : verificationEmail.status === 'already_verified'
                          ? 'Share the photo again so Firebase can apply the verified account status.'
                          : verificationEmail.message}
                </Text>
              </View>
            </View>
          ) : null}

          {phase !== 'processing' && phase !== 'error' && result && detailsAvailable ? (
            <>
              <View style={styles.receiptDivider} />
              <View style={styles.receiptFoundRow}>
                <View style={styles.receiptFoundText}>
                  <Text style={styles.receiptFoundLabel}>
                    {hasFinalPublicProcessing ? 'Final result' : 'Saved to your GathR'}
                  </Text>
                  <Text style={styles.receiptFoundTitle}>{summaryTitle}</Text>
                </View>
                <Pressable
                  style={styles.detailsButton}
                  onPress={() => setShowDetails((current) => !current)}
                >
                  <Ionicons name={showDetails ? 'chevron-up-outline' : 'list-outline'} size={18} color={BRAND.primaryDark} />
                  <Text style={styles.detailsButtonText}>{showDetails ? 'Hide' : 'Details'}</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>

        {shouldShowDetails && eventCount > 1 ? (
          <View style={styles.carouselSection}>
            <View style={styles.carouselHeader}>
              <Text style={styles.carouselTitle}>
                {`${eventCount} saved ${eventCount === 1 ? 'item' : 'items'}`}
              </Text>
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
          <Pressable style={styles.saveButton} onPress={handleRetry}>
            <Ionicons name="refresh-outline" size={21} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Try Again</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.saveButton, isSecuringUpload && styles.saveButtonDisabled]}
            onPress={handleFinish}
            disabled={isSecuringUpload}
          >
            <Ionicons
              name={isSecuringUpload ? 'cloud-upload-outline' : 'map-outline'}
              size={21}
              color="#FFFFFF"
            />
            <Text style={styles.saveButtonText}>
              {isSecuringUpload ? 'Securing photo...' : 'Return to GathR'}
            </Text>
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
    padding: 14,
    paddingBottom: 24,
  },
  receiptCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    paddingTop: 22,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 5,
  },
  receiptAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  receiptTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  receiptHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginTop: 22,
  },
  receiptHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  receiptEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  receiptEyebrowIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptEyebrowText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  receiptPreviewFrame: {
    width: 94,
    height: 118,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#EAF1F8',
    borderWidth: 1,
    borderColor: '#D6E2EF',
  },
  receiptPreview: {
    width: '100%',
    height: '100%',
  },
  receiptPreviewBadge: {
    position: 'absolute',
    right: 7,
    bottom: 7,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  receiptFallbackIcon: {
    width: 82,
    height: 82,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 22,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F7FAFD',
    borderWidth: 1,
    borderColor: '#E3ECF5',
  },
  progressStep: {
    width: 62,
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  progressConnector: {
    flex: 1,
    height: 2,
    marginTop: 10,
    marginHorizontal: -7,
    backgroundColor: '#DCE5EF',
  },
  progressLabel: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  processingNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  processingNoticeUploading: {
    backgroundColor: '#F7FAFD',
    borderColor: '#DDE7F1',
  },
  processingNoticeReady: {
    backgroundColor: '#EEF7FF',
    borderColor: '#C6E2FA',
  },
  processingNoticeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  processingNoticeCopy: {
    flex: 1,
    minWidth: 0,
  },
  processingNoticeTitle: {
    color: BRAND.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  processingNoticeDetail: {
    color: BRAND.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: 2,
  },
  communityProgressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#EEF7FF',
    borderWidth: 1,
    borderColor: '#CCE4FA',
  },
  communityProgressCopy: {
    flex: 1,
  },
  communityProgressLabel: {
    color: BRAND.ink,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  communityProgressDetail: {
    color: BRAND.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  communityDots: {
    flexDirection: 'row',
    gap: 5,
  },
  communityDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },
  verificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F0F7FF',
    borderWidth: 1,
    borderColor: '#C9E2FA',
  },
  verificationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  verificationCopy: {
    flex: 1,
  },
  verificationTitle: {
    color: BRAND.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  verificationDetail: {
    color: BRAND.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: 2,
  },
  communityDotActive: {
    backgroundColor: BRAND.primaryDark,
  },
  venueResolutionCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#FFF9ED',
    borderWidth: 1,
    borderColor: '#F0D39A',
  },
  venueResolutionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  venueResolutionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  venueResolutionCopy: {
    flex: 1,
  },
  venueResolutionTitle: {
    color: BRAND.ink,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  venueResolutionDetail: {
    color: BRAND.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: 2,
  },
  venueDropdownButton: {
    minHeight: 56,
    marginTop: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFC188',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  venueDropdownText: {
    flex: 1,
  },
  venueDropdownLabel: {
    color: BRAND.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  venueDropdownHint: {
    color: BRAND.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  venueOptions: {
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E6D2AA',
    backgroundColor: '#FFFFFF',
  },
  venueOption: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6EDF5',
  },
  venueNoneOption: {
    borderBottomWidth: 0,
    backgroundColor: '#F8FAFC',
  },
  venueOptionRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF4FF',
  },
  venueOptionRankText: {
    color: BRAND.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  venueNoneIcon: {
    backgroundColor: '#EEF2F6',
  },
  venueOptionCopy: {
    flex: 1,
  },
  venueOptionName: {
    color: BRAND.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  venueOptionAddress: {
    color: BRAND.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  venueSearchError: {
    color: BRAND.danger,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: 9,
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
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900',
    marginTop: 10,
  },
  receiptDetail: {
    color: BRAND.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
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
