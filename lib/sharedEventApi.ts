import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { auth, firestore } from '../config/firebaseConfig';

const DEFAULT_FUNCTIONS_BASE_URL = 'https://northamerica-northeast2-gathr-m1.cloudfunctions.net';

export const FUNCTIONS_BASE_URL = (
  (typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_GATHR_FUNCTIONS_BASE_URL) ||
  DEFAULT_FUNCTIONS_BASE_URL
).replace(/\/+$/, '');

export type SharedEventPayload = {
  sourceUrl?: string;
  sharedText?: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  mediaUrls?: string[];
  sourcePlatform?: string;
  sourceApp?: string;
  visibilityHint?: string;
  timezone?: string;
};

export type SharedEventResultEvent = {
  privateEventId?: string;
  publicCandidateId?: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  locationScope?: 'venue' | 'route' | 'unknown';
  mapMode?: 'venue' | 'route' | 'none';
  contentKind?: 'event' | 'special';
  price?: string;
  recurringPattern?: string;
  recurringDaysOfWeek?: string[];
  recurrenceUntilDate?: string;
  mediaUrls?: string[];
  imageUrl?: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  routing?: 'private_only' | 'public_candidate' | 'not_public_candidate';
  status?: 'needs_user_review' | 'saved' | 'submitted_public_candidate' | 'expired';
  confidence?: number;
  needsUserReview?: boolean;
  reviewReasons?: string[];
  isExpired?: boolean;
  sequenceIndex?: number;
  extractedFromShare?: boolean;
};

export type SharedEventProcessingStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type SharedEventScrapeEnrichmentStatus =
  | 'reserved'
  | 'queued'
  | 'running'
  | 'processing'
  | 'completed'
  | 'duplicate'
  | 'skipped'
  | 'failed';

export type SharedEventPublicProcessingStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'skipped'
  | 'failed';

export type SharedEventPublicProcessingSummary = {
  status?: SharedEventPublicProcessingStatus;
  source?: string;
  fileId?: string;
  fileName?: string;
  runId?: string;
  createdEventCount?: number;
  updatedEventCount?: number;
  duplicateEventCount?: number;
  unknownVenueCount?: number;
  skippedCount?: number;
  errorCount?: number;
  message?: string;
};

export type SharedEventCrowdPromotionStatus =
  | 'ineligible'
  | 'collecting'
  | 'candidate_pending'
  | 'promoted'
  | 'duplicate_existing'
  | 'needs_review'
  | 'failed';

export type SharedEventCrowdPromotionSummary = {
  eligibleEventCount: number;
  collectingEventCount: number;
  candidateEventCount: number;
  reviewEventCount: number;
  promotedEventCount: number;
  threshold: number;
  maxContributorCount: number;
  events: Array<{
    privateEventId: string;
    aggregateId?: string;
    publicCandidateId?: string;
    contributorCount: number;
    threshold: number;
    status: SharedEventCrowdPromotionStatus;
    reason?: string;
  }>;
};

export type SharedEventSubmitResult = {
  success: boolean;
  ingestId?: string;
  privateEventId?: string;
  privateEventIds?: string[];
  publicCandidateId?: string;
  publicCandidateIds?: string[];
  routing?: 'private_only' | 'public_candidate' | 'not_public_candidate';
  sourceVisibility?: 'public_verified' | 'restricted_unverified' | 'user_private' | 'unknown';
  status?: 'needs_user_review' | 'saved' | 'submitted_public_candidate' | 'expired';
  processingStatus?: SharedEventProcessingStatus;
  processingError?: string;
  scrapeEnrichment?: {
    status?: SharedEventScrapeEnrichmentStatus;
    enrichmentId?: string;
    reason?: string;
    actorRunId?: string;
    datasetId?: string;
    fileId?: string;
    fileName?: string;
    error?: string;
  };
  publicProcessing?: SharedEventPublicProcessingSummary;
  crowdPromotion?: SharedEventCrowdPromotionSummary;
  extractedEventCount?: number;
  needsUserReview?: boolean;
  reviewReasons?: string[];
  confidence?: number;
  event?: SharedEventResultEvent;
  events?: SharedEventResultEvent[];
  visibilityEvidence?: {
    method?: string;
    reason?: string;
    httpStatus?: number;
    finalUrl?: string;
  };
  error?: string;
};

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function eventsFromIngestPreview(value: unknown): SharedEventResultEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const raw = entry as Record<string, any>;
      return {
        title: typeof raw.title === 'string' ? raw.title : undefined,
        description: typeof raw.description === 'string' ? raw.description : undefined,
        startDate: typeof raw.startDate === 'string' ? raw.startDate : undefined,
        endDate: typeof raw.endDate === 'string' ? raw.endDate : undefined,
        startTime: typeof raw.startTime === 'string' ? raw.startTime : undefined,
        endTime: typeof raw.endTime === 'string' ? raw.endTime : undefined,
        locationName: typeof raw.locationName === 'string' ? raw.locationName : undefined,
        address: typeof raw.address === 'string' ? raw.address : undefined,
        locationScope: raw.locationScope,
        mapMode: raw.mapMode,
        contentKind: raw.contentKind,
        price: typeof raw.price === 'string' ? raw.price : undefined,
        recurringPattern: typeof raw.recurringPattern === 'string' ? raw.recurringPattern : undefined,
        recurringDaysOfWeek: Array.isArray(raw.recurringDaysOfWeek)
          ? raw.recurringDaysOfWeek.filter((day: unknown) => typeof day === 'string')
          : undefined,
        recurrenceUntilDate: typeof raw.recurrenceUntilDate === 'string' ? raw.recurrenceUntilDate : undefined,
        mediaUrls: Array.isArray(raw.mediaUrls) ? raw.mediaUrls.filter((url: unknown) => typeof url === 'string') : undefined,
        imageUrl: Array.isArray(raw.mediaUrls) && typeof raw.mediaUrls[0] === 'string' ? raw.mediaUrls[0] : undefined,
        sourceUrl: typeof raw.sourceUrl === 'string' ? raw.sourceUrl : undefined,
        sourcePlatform: typeof raw.sourcePlatform === 'string' ? raw.sourcePlatform : undefined,
        routing: raw.routing,
        status: raw.status,
        confidence: typeof raw.confidence === 'number' ? raw.confidence : undefined,
        needsUserReview: typeof raw.needsUserReview === 'boolean' ? raw.needsUserReview : undefined,
        reviewReasons: Array.isArray(raw.reviewReasons)
          ? raw.reviewReasons.filter((reason: unknown) => typeof reason === 'string')
          : undefined,
        isExpired: typeof raw.isExpired === 'boolean' ? raw.isExpired : undefined,
        sequenceIndex: typeof raw.sequenceIndex === 'number' ? raw.sequenceIndex : undefined,
        extractedFromShare: typeof raw.extractedFromShare === 'boolean' ? raw.extractedFromShare : undefined,
      };
    });
}

function resultFromIngestDoc(ingestId: string, data: Record<string, any>): SharedEventSubmitResult {
  const events = eventsFromIngestPreview(data.eventsPreview);
  const eventLinks = Array.isArray(data.eventLinks) ? data.eventLinks : [];
  const privateEventIds = Array.isArray(data.privateEventIds)
    ? data.privateEventIds.filter((id: unknown) => typeof id === 'string')
    : eventLinks.map((link: any) => link?.privateEventId).filter((id: unknown) => typeof id === 'string');
  const publicCandidateIds = Array.isArray(data.publicCandidateIds)
    ? data.publicCandidateIds.filter((id: unknown) => typeof id === 'string')
    : eventLinks.map((link: any) => link?.publicCandidateId).filter((id: unknown) => typeof id === 'string');
  const reviewReasons = uniqueStrings(events.flatMap((event) => event.reviewReasons || []));
  const confidenceValues = events
    .map((event) => event.confidence)
    .filter((value): value is number => typeof value === 'number');

  return {
    success: true,
    ingestId,
    privateEventId: typeof data.privateEventId === 'string' ? data.privateEventId : privateEventIds[0],
    privateEventIds,
    publicCandidateId: typeof data.publicCandidateId === 'string' ? data.publicCandidateId : publicCandidateIds[0],
    publicCandidateIds,
    routing: data.routing,
    sourceVisibility: data.sourceVisibility,
    status: data.status,
    processingStatus: data.processingStatus,
    processingError: typeof data.processingError === 'string' ? data.processingError : undefined,
    scrapeEnrichment: data.scrapeEnrichment && typeof data.scrapeEnrichment === 'object'
      ? {
        status: data.scrapeEnrichment.status,
        enrichmentId: typeof data.scrapeEnrichment.enrichmentId === 'string' ? data.scrapeEnrichment.enrichmentId : undefined,
        reason: typeof data.scrapeEnrichment.reason === 'string' ? data.scrapeEnrichment.reason : undefined,
        actorRunId: typeof data.scrapeEnrichment.actorRunId === 'string' ? data.scrapeEnrichment.actorRunId : undefined,
        datasetId: typeof data.scrapeEnrichment.datasetId === 'string' ? data.scrapeEnrichment.datasetId : undefined,
        fileId: typeof data.scrapeEnrichment.fileId === 'string' ? data.scrapeEnrichment.fileId : undefined,
        fileName: typeof data.scrapeEnrichment.fileName === 'string' ? data.scrapeEnrichment.fileName : undefined,
        error: typeof data.scrapeEnrichment.error === 'string' ? data.scrapeEnrichment.error : undefined,
      }
      : undefined,
    publicProcessing: data.publicProcessing && typeof data.publicProcessing === 'object'
      ? {
        status: data.publicProcessing.status,
        source: typeof data.publicProcessing.source === 'string' ? data.publicProcessing.source : undefined,
        fileId: typeof data.publicProcessing.fileId === 'string' ? data.publicProcessing.fileId : undefined,
        fileName: typeof data.publicProcessing.fileName === 'string' ? data.publicProcessing.fileName : undefined,
        runId: typeof data.publicProcessing.runId === 'string' ? data.publicProcessing.runId : undefined,
        createdEventCount: typeof data.publicProcessing.createdEventCount === 'number' ? data.publicProcessing.createdEventCount : undefined,
        updatedEventCount: typeof data.publicProcessing.updatedEventCount === 'number' ? data.publicProcessing.updatedEventCount : undefined,
        duplicateEventCount: typeof data.publicProcessing.duplicateEventCount === 'number' ? data.publicProcessing.duplicateEventCount : undefined,
        unknownVenueCount: typeof data.publicProcessing.unknownVenueCount === 'number' ? data.publicProcessing.unknownVenueCount : undefined,
        skippedCount: typeof data.publicProcessing.skippedCount === 'number' ? data.publicProcessing.skippedCount : undefined,
        errorCount: typeof data.publicProcessing.errorCount === 'number' ? data.publicProcessing.errorCount : undefined,
        message: typeof data.publicProcessing.message === 'string' ? data.publicProcessing.message : undefined,
      }
      : undefined,
    crowdPromotion: data.crowdPromotion && typeof data.crowdPromotion === 'object'
      ? {
        eligibleEventCount: Math.max(0, Number(data.crowdPromotion.eligibleEventCount || 0)),
        collectingEventCount: Math.max(0, Number(data.crowdPromotion.collectingEventCount || 0)),
        candidateEventCount: Math.max(0, Number(data.crowdPromotion.candidateEventCount || 0)),
        reviewEventCount: Math.max(0, Number(data.crowdPromotion.reviewEventCount || 0)),
        promotedEventCount: Math.max(0, Number(data.crowdPromotion.promotedEventCount || 0)),
        threshold: Math.max(1, Number(data.crowdPromotion.threshold || 3)),
        maxContributorCount: Math.max(0, Number(data.crowdPromotion.maxContributorCount || 0)),
        events: Array.isArray(data.crowdPromotion.events)
          ? data.crowdPromotion.events.filter((entry: unknown) => entry && typeof entry === 'object')
          : [],
      }
      : undefined,
    extractedEventCount: typeof data.extractedEventCount === 'number' ? data.extractedEventCount : events.length,
    needsUserReview: events.some((event) => event.needsUserReview),
    reviewReasons,
    confidence: confidenceValues.length ? Math.min(...confidenceValues) : undefined,
    event: events[0],
    events,
    visibilityEvidence: data.visibilityEvidence,
  };
}

export async function submitSharedEvent(payload: SharedEventPayload): Promise<SharedEventSubmitResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Log in to save shared events.');
  }

  const token = await user.getIdToken();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/submitSharedEvent`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ payload }),
  });

  const result = await response.json().catch(() => ({})) as SharedEventSubmitResult;
  if (!response.ok || result.success === false) {
    throw new Error(result.error || `Shared event save failed (${response.status})`);
  }

  return result;
}

export function watchSharedEventIngest(
  ingestId: string,
  onResult: (result: SharedEventSubmitResult) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Log in to watch shared event processing.');
  }

  const ref = doc(firestore, 'users', user.uid, 'sharedEventIngests', ingestId);
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onError?.(new Error('Shared event processing record was not found.'));
        return;
      }
      onResult(resultFromIngestDoc(snapshot.id, snapshot.data() as Record<string, any>));
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  );
}
