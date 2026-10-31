import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import {
  app,
  auth,
  firebaseTarget,
  firestore,
  functions,
  useFirebaseEmulators,
} from '../config/firebaseConfig';
import { amplitudeTrack } from '../lib/amplitudeAnalytics';
import { SOCIAL_RELEASE_TWO_ENABLED } from '../types/social';
import { getSocialAppCheckToken } from './appCheckService';
import type {
  BlockProjection,
  CheckInInput,
  CheckInEligibilityResult,
  CheckInEligibilitySampleInput,
  CheckInReadinessSampleInput,
  CheckInReadinessReceipt,
  BindCheckInReadinessInput,
  BoundCheckInReadiness,
  FriendActivityProjection,
  FriendEventInput,
  FriendEventLocationSuggestion,
  FriendEventLocationProjection,
  FriendEventProjection,
  FriendEventRsvp,
  FriendProjection,
  FriendRequestProjection,
  NearbyCheckInPlacesResult,
  OwnCheckIn,
  PrivateCheckInPlaceCandidateResult,
  ResolvedFriendEventLocationSuggestion,
  SocialProfile,
} from '../types/social';

export interface SocialCallableErrorDetails {
  condition?: string;
  retryable?: boolean;
}

function safeCallableErrorDetails(value: unknown): SocialCallableErrorDetails | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { condition?: unknown; retryable?: unknown };
  const details: SocialCallableErrorDetails = {};
  // Callable details are server-owned. Keep only the small, non-sensitive
  // control-plane shape used for client recovery; never surface raw payloads.
  if (typeof candidate.condition === 'string' && /^[a-z0-9_]{1,120}$/.test(candidate.condition)) {
    details.condition = candidate.condition;
  }
  if (typeof candidate.retryable === 'boolean') details.retryable = candidate.retryable;
  return Object.keys(details).length > 0 ? details : undefined;
}

export class SocialServiceError extends Error {
  code: string;
  details?: SocialCallableErrorDetails;

  constructor(code: string, message: string, details?: SocialCallableErrorDetails) {
    super(message);
    this.name = 'SocialServiceError';
    this.code = code;
    this.details = details;
  }
}

export interface SocialCallableDiagnostic {
  operation: string;
  requestId: string;
  durationMs: number;
  success: boolean;
  errorCode: string | null;
  errorReason: string | null;
}

let diagnosticSequence = 0;
let lastCallableDiagnostic: SocialCallableDiagnostic | null = null;
const diagnosticSubscribers = new Set<() => void>();

export function getLastSocialCallableDiagnostic() {
  return lastCallableDiagnostic;
}

export function subscribeToSocialCallableDiagnostics(listener: () => void) {
  diagnosticSubscribers.add(listener);
  return () => diagnosticSubscribers.delete(listener);
}

function publishCallableDiagnostic(diagnostic: SocialCallableDiagnostic) {
  lastCallableDiagnostic = diagnostic;
  diagnosticSubscribers.forEach((listener) => listener());
}

function checkInRateLimitErrorReason(error: unknown, callableName: string) {
  const candidate = error as { code?: string; message?: string };
  const code = String(candidate?.code || '').replace(/^functions\//, '');
  if (code !== 'resource-exhausted') return null;
  if (
    callableName === 'createCheckInCallable'
    && candidate?.message === 'Daily private check-in limit reached.'
  ) return 'private_check_in_daily_limit';
  if (
    callableName === 'createCheckInCallable'
    && candidate?.message === 'Please wait before trying again.'
  ) return 'check_in_attempt_rate_limit';
  if (
    callableName === 'createPrivateCheckInPlaceCandidateCallable'
    && candidate?.message === 'Please wait before trying again.'
  ) return 'private_place_candidate_rate_limit';
  return null;
}

function normalizeCallableError(error: unknown, callableName = ''): SocialServiceError {
  const candidate = error as { code?: string; message?: string; details?: unknown };
  const code = String(candidate?.code || 'unknown').replace(/^functions\//, '');
  const fallback: Record<string, string> = {
    unauthenticated: 'Sign in to use friends and check-ins.',
    'permission-denied': 'This social action is not available.',
    'resource-exhausted': 'Please wait a moment before trying again.',
    unavailable: 'GathR social is temporarily unavailable. Try again when you are online.',
  };
  const reason = checkInRateLimitErrorReason(error, callableName);
  const message = reason === 'private_check_in_daily_limit'
    ? 'Daily private check-in limit reached.'
    : reason === 'check_in_attempt_rate_limit'
      ? 'Too many check-in attempts. Try again later.'
      : reason === 'private_place_candidate_rate_limit'
        ? 'Place setup limit reached. Try again later.'
        : fallback[code] || candidate?.message || 'The social request could not be completed.';
  return new SocialServiceError(
    code,
    message,
    safeCallableErrorDetails(candidate?.details)
  );
}

const APP_CHECKED_CALLABLES = new Set([
  'createPrivateCheckInPlaceCandidateCallable',
  'discoverNearbyCheckInPlacesCallable',
  'listNearbyCanonicalCheckInVenuesCallable',
  'recordCheckInEligibilitySampleCallable',
  'recordCheckInReadinessSampleCallable',
  'bindCheckInReadinessCallable',
  'createFriendEventCallable',
  'geocodeFriendEventAddressCallable',
  'suggestFriendEventAddressesCallable',
  'retrieveFriendEventLocationSuggestionCallable',
  'updateFriendEventCallable',
  'inviteToFriendEventCallable',
  'respondToFriendEventCallable',
  'removeFromFriendEventCallable',
  'cancelFriendEventCallable',
  'deleteFriendEventCallable',
]);

function callableUrl(name: string) {
  const projectId = app.options.projectId;
  if (!projectId) throw new SocialServiceError('failed-precondition', 'Firebase is not configured.');
  if (useFirebaseEmulators) {
    const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '10.0.2.2';
    return `http://${host}:5001/${projectId}/northamerica-northeast1/${name}`;
  }
  return `https://northamerica-northeast1-${projectId}.cloudfunctions.net/${name}`;
}

async function callAppCheckedSocial<Request, Response>(
  name: string,
  data: Request,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new SocialServiceError('unauthenticated', 'Sign in to use this feature.');
  const abortError = new Error('The social request was canceled or timed out. Try again shortly.');
  abortError.name = 'AbortError';
  if (options.signal?.aborted) throw abortError;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  let rejectAbort: (error: Error) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  // A token provider may remain pending after cancellation. Its eventual result
  // must never start a late HTTP request or block the observer's next GPS fix.
  void aborted.catch(() => undefined);
  const onAbort = () => rejectAbort(abortError);
  controller.signal.addEventListener('abort', onAbort);
  options.signal?.addEventListener('abort', abortFromCaller);
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const withinDeadline = <T>(operation: () => Promise<T>): Promise<T> => controller.signal.aborted
    ? Promise.reject(abortError)
    : Promise.race([operation(), aborted]);
  try {
    const appCheckToken = await withinDeadline(() => getSocialAppCheckToken());
    // Preserve the intentional Preview compatibility path; token failure must
    // never fall back to an unattested request in Production.
    if (!appCheckToken) {
      return (await withinDeadline(() => httpsCallable<Request, Response>(functions, name, {
        timeout: options.timeoutMs ?? 30_000,
      })(data))).data;
    }
    const idToken = await withinDeadline(() => user.getIdToken());
    const response = await withinDeadline(() => fetch(callableUrl(name), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${idToken}`,
        'content-type': 'application/json',
        ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
      },
      body: JSON.stringify({ data }),
      signal: controller.signal,
    }));
    const payload = await withinDeadline(() => response.json()) as {
      result?: Response;
      data?: Response;
      error?: { status?: string; message?: string; details?: unknown };
    };
    if (!response.ok || payload.error) {
      throw new SocialServiceError(
        String(payload.error?.status || `http-${response.status}`).toLowerCase().replace(/_/g, '-'),
        payload.error?.message || 'The social request could not be completed.',
        safeCallableErrorDetails(payload.error?.details)
      );
    }
    return (payload.result ?? payload.data) as Response;
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener('abort', onAbort);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

async function callSocial<Request, Response>(
  name: string,
  data: Request,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<Response> {
  const startedAt = Date.now();
  const operation = name.replace(/Callable$/, '');
  diagnosticSequence += 1;
  const requestId = `${startedAt.toString(36)}-${diagnosticSequence.toString(36)}`;
  try {
    const result = APP_CHECKED_CALLABLES.has(name)
      ? await callAppCheckedSocial<Request, Response>(name, data, options)
      : (await httpsCallable<Request, Response>(functions, name)(data)).data;
    if (name !== 'recordCheckInReadinessSampleCallable') {
      amplitudeTrack('social_callable_completed', {
        operation,
        success: true,
        firebase_target: firebaseTarget,
        duration_ms: Date.now() - startedAt,
      });
      publishCallableDiagnostic({
        operation,
        requestId,
        durationMs: Date.now() - startedAt,
        success: true,
        errorCode: null,
        errorReason: null,
      });
    }
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    const errorReason = checkInRateLimitErrorReason(error, name);
    const normalized = normalizeCallableError(error, name);
    if (name !== 'recordCheckInReadinessSampleCallable') {
      amplitudeTrack('social_callable_completed', {
        operation,
        success: false,
        firebase_target: firebaseTarget,
        error_code: normalized.code,
        ...(errorReason ? { error_reason: errorReason } : {}),
        duration_ms: Date.now() - startedAt,
      });
      publishCallableDiagnostic({
        operation,
        requestId,
        durationMs: Date.now() - startedAt,
        success: false,
        errorCode: normalized.code,
        errorReason,
      });
    }
    throw normalized;
  }
}

export function normalizeSocialHandle(value: string): string {
  return value.normalize('NFKC').trim().replace(/^@+/, '').toLowerCase();
}

export function normalizePeopleSearchQuery(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-CA')
    .replace(/^@+/, '')
    .replace(/[^\p{Letter}\p{Number}_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

export function validateSocialHandle(value: string): string {
  const handle = normalizeSocialHandle(value);
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
    throw new SocialServiceError(
      'invalid-argument',
      'Use 3–24 lowercase letters, numbers, or underscores.'
    );
  }
  return handle;
}

export function createSocialOperationId(): string {
  const randomPart = Math.random().toString(36).slice(2, 14);
  return `${Date.now().toString(36)}-${randomPart}`;
}

export const claimSocialHandle = (handle: string) =>
  callSocial<{ handle: string }, SocialProfile>('claimSocialHandleCallable', {
    handle: validateSocialHandle(handle),
  });

export async function searchUserByHandle(handle: string): Promise<SocialProfile | null> {
  const result = await callSocial<{ handle: string }, { user: SocialProfile | null }>(
    'searchUserByHandleCallable',
    { handle: validateSocialHandle(handle) }
  );
  return result.user;
}

export async function searchUsers(query: string): Promise<SocialProfile[]> {
  const normalizedQuery = normalizePeopleSearchQuery(query);
  if (normalizedQuery.length < 2) return [];
  const result = await callSocial<{ query: string }, { users: SocialProfile[] }>(
    'searchUsersCallable',
    { query: normalizedQuery }
  );
  return Array.isArray(result.users) ? result.users.slice(0, 5) : [];
}

export const sendFriendRequest = (targetUid: string) =>
  callSocial<{ targetUid: string }, { state: 'accepted' | 'pending'; otherUid: string }>(
    'sendFriendRequestCallable',
    { targetUid }
  );

export const cancelFriendRequest = (otherUid: string) =>
  callSocial('cancelFriendRequestCallable', { otherUid });

export const acceptFriendRequest = (otherUid: string) =>
  callSocial('acceptFriendRequestCallable', { otherUid });

export const declineFriendRequest = (otherUid: string) =>
  callSocial('declineFriendRequestCallable', { otherUid });

export const removeFriend = (otherUid: string) =>
  callSocial('removeFriendCallable', { otherUid });

export const blockUser = (blockedUid: string) =>
  callSocial('blockUserCallable', { blockedUid });

export const unblockUser = (blockedUid: string) =>
  callSocial('unblockUserCallable', { blockedUid });

export const reportUser = (
  reportedUid: string,
  reason: 'harassment' | 'impersonation' | 'privacy' | 'spam' | 'other'
) => callSocial<{ reportedUid: string; reason: string }, { reportId: string }>(
  'reportUserCallable',
  { reportedUid, reason }
);

export const createCheckIn = (input: CheckInInput) =>
  callSocial<CheckInInput, OwnCheckIn>('createCheckInCallable', {
    ...input,
    operationId: input.operationId || createSocialOperationId(),
  });

export const recordCheckInEligibilitySample = (input: CheckInEligibilitySampleInput) =>
  callSocial<CheckInEligibilitySampleInput, CheckInEligibilityResult>(
    'recordCheckInEligibilitySampleCallable',
    input
  );

// Deliberately no fallback to a target-bound dwell session or client-fabricated grant.
function normalizeLocationCaptureTime<T extends { capturedAtMs: number }>(input: T): T {
  // Core Location exports seconds * 1000, which can contain fractional milliseconds.
  // The callable protocol uses integer epoch milliseconds. Floor the original fix
  // time (never Date.now()) so serialization cannot make an old fix appear newer.
  const capturedAtMs = Math.floor(input.capturedAtMs);
  if (!Number.isFinite(input.capturedAtMs) || input.capturedAtMs < 0 || !Number.isSafeInteger(capturedAtMs)) {
    throw new SocialServiceError('invalid-argument', 'Refresh your location and try again.');
  }
  return { ...input, capturedAtMs };
}

export const recordCheckInReadinessSample = async (input: CheckInReadinessSampleInput, options: { signal?: AbortSignal } = {}) =>
  callSocial<CheckInReadinessSampleInput, CheckInReadinessReceipt>(
    'recordCheckInReadinessSampleCallable', normalizeLocationCaptureTime(input), { ...options, timeoutMs: 8_000 }
  );

export const bindCheckInReadiness = async (input: BindCheckInReadinessInput) =>
  callSocial<BindCheckInReadinessInput, BoundCheckInReadiness>(
    'bindCheckInReadinessCallable', normalizeLocationCaptureTime(input)
  );

export const discoverNearbyCheckInPlaces = async (input: {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAtMs: number;
  /** Fetch a bounded nearby pool while the stationary countdown is running. */
  preparation?: true;
  renewPreparationPool?: { poolId: string; readinessSessionId: string };
}, options: { signal?: AbortSignal; timeoutMs?: number } = {}) => callSocial<typeof input, NearbyCheckInPlacesResult>(
  'discoverNearbyCheckInPlacesCallable',
  normalizeLocationCaptureTime(input),
  options
);

export const listNearbyCanonicalCheckInVenues = async (input: {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAtMs: number;
  preparation?: true;
}, options: { signal?: AbortSignal; timeoutMs?: number } = {}) => callSocial<typeof input, NearbyCheckInPlacesResult>(
  'listNearbyCanonicalCheckInVenuesCallable',
  normalizeLocationCaptureTime(input),
  options
);

export const createPrivateCheckInPlaceCandidate = async (input: {
  label: string;
  /** Reuse the server-qualified arrival; never refresh the timestamp of an old fix. */
  readinessSessionId?: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAtMs: number;
}) => callSocial<typeof input, PrivateCheckInPlaceCandidateResult>(
  'createPrivateCheckInPlaceCandidateCallable',
  normalizeLocationCaptureTime(input)
);

export const checkOut = (expectedRevision?: string) =>
  callSocial<{ expectedRevision?: string }, { checkedOut: boolean; removedViewerCount: number }>(
    'checkOutCallable',
    expectedRevision ? { expectedRevision } : {}
  );

export const createFriendEvent = (input: FriendEventInput) =>
  callSocial<FriendEventInput, FriendEventProjection>('createFriendEventCallable', {
    ...input,
    operationId: input.operationId || createSocialOperationId(),
  });

export const geocodeFriendEventAddress = (address: string) =>
  callSocial<{ address: string }, { latitude: number; longitude: number }>(
    'geocodeFriendEventAddressCallable',
    { address }
  );

export const suggestFriendEventLocations = (
  query: string,
  sessionToken: string,
  proximity?: { latitude: number; longitude: number } | null,
  signal?: AbortSignal
) => callSocial<
  {
    query: string;
    sessionToken: string;
    proximityLatitude?: number;
    proximityLongitude?: number;
  },
  { suggestions: FriendEventLocationSuggestion[] }
>('suggestFriendEventAddressesCallable', {
  query,
  sessionToken,
  ...(proximity
    ? {
        proximityLatitude: proximity.latitude,
        proximityLongitude: proximity.longitude,
      }
    : {}),
}, { signal, timeoutMs: 8_000 }).then((result) => result.suggestions);

export const retrieveFriendEventLocationSuggestion = (
  mapboxId: string,
  sessionToken: string,
  signal?: AbortSignal
) => callSocial<
  { mapboxId: string; sessionToken: string },
  ResolvedFriendEventLocationSuggestion
>('retrieveFriendEventLocationSuggestionCallable', {
  mapboxId,
  sessionToken,
}, { signal, timeoutMs: 8_000 });

export const updateFriendEvent = (eventId: string, input: FriendEventInput) =>
  callSocial<FriendEventInput & { eventId: string }, { eventId: string; revision: string }>(
    'updateFriendEventCallable',
    { ...input, eventId }
  );

export const inviteToFriendEvent = (eventId: string, targetUid: string) =>
  callSocial<{ eventId: string; targetUid: string }, { eventId: string; invitedUid: string }>(
    'inviteToFriendEventCallable',
    { eventId, targetUid }
  );

export const respondToFriendEvent = (eventId: string, response: Exclude<FriendEventRsvp, 'host' | 'invited'>) =>
  callSocial<{ eventId: string; response: string }, { eventId: string; response: string }>(
    'respondToFriendEventCallable',
    { eventId, response }
  );

export const removeFromFriendEvent = (eventId: string, memberUid: string) =>
  callSocial('removeFromFriendEventCallable', { eventId, memberUid });

export const cancelFriendEvent = (eventId: string, reason: string) =>
  callSocial('cancelFriendEventCallable', { eventId, reason });

export const deleteFriendEvent = (eventId: string) =>
  callSocial('deleteFriendEventCallable', { eventId });

export const deleteSocialAccountData = () =>
  callSocial<Record<string, never>, {
    relationshipsDeleted: number;
    projectionsDeleted: number;
    incomingBlocksDeleted: number;
    handleReleased: boolean;
    hostedEventsDeleted: number;
    eventMembershipsRevoked: number;
  }>('deleteSocialAccountDataCallable', {});

function mapDocuments<T>(snapshot: QuerySnapshot<DocumentData>): T[] {
  return snapshot.docs
    .map((item) => ({ uid: item.id, ...item.data() } as T))
    .sort((a, b) => {
      const firstData = a as { displayName?: string; uid?: string };
      const secondData = b as { displayName?: string; uid?: string };
      const first = String(firstData.displayName || firstData.uid || '');
      const second = String(secondData.displayName || secondData.uid || '');
      return first.localeCompare(second);
    });
}

export type SocialListenerName =
  | 'friends'
  | 'requests'
  | 'activity'
  | 'blocks'
  | 'ownCheckIn'
  | 'friendEvents'
  | 'friendEventLocations';

export interface SocialListenerCallbacks {
  onFriends: (friends: FriendProjection[], fromCache: boolean) => void;
  onRequests: (requests: FriendRequestProjection[], fromCache: boolean) => void;
  onActivity: (activity: FriendActivityProjection[], fromCache: boolean) => void;
  onBlocks: (blocks: BlockProjection[], fromCache: boolean) => void;
  onOwnCheckIn: (checkIn: OwnCheckIn | null, fromCache: boolean) => void;
  onFriendEvents: (events: FriendEventProjection[], fromCache: boolean) => void;
  onFriendEventLocations: (locations: FriendEventLocationProjection[], fromCache: boolean) => void;
  onError: (listener: SocialListenerName, error: SocialServiceError) => void;
}

export interface FriendEventDetailCallbacks {
  onEvent: (event: FriendEventProjection | null) => void;
  onLocation: (location: FriendEventLocationProjection | null) => void;
  onError: (error: SocialServiceError) => void;
}

/**
 * Verify one private event directly against the server. Collection listeners
 * remain the source for maps and feeds; this focused listener prevents a newly
 * created event from being mistaken for a revoked event while that collection
 * listener is still catching up.
 */
export function subscribeToFriendEventDetail(
  uid: string,
  eventId: string,
  callbacks: FriendEventDetailCallbacks
): Unsubscribe {
  const currentUid = auth.currentUser?.uid;
  if (!uid || !eventId || currentUid !== uid) {
    callbacks.onError(new SocialServiceError('unauthenticated', 'Sign in to open this event.'));
    return () => undefined;
  }

  const eventUnsubscribe = onSnapshot(
    doc(firestore, 'users', uid, 'friendEvents', eventId),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache) return;
      if (!snapshot.exists()) {
        callbacks.onEvent(null);
        return;
      }
      const data = snapshot.data();
      callbacks.onEvent({
        ...data,
        eventId: String(data.eventId || eventId),
      } as FriendEventProjection);
    },
    (error) => callbacks.onError(normalizeCallableError(error))
  );
  const locationUnsubscribe = onSnapshot(
    doc(firestore, 'users', uid, 'friendEventLocations', eventId),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache) return;
      if (!snapshot.exists()) {
        callbacks.onLocation(null);
        return;
      }
      const data = snapshot.data();
      callbacks.onLocation({
        ...data,
        eventId: String(data.eventId || eventId),
      } as FriendEventLocationProjection);
    },
    () => callbacks.onLocation(null)
  );

  return () => {
    eventUnsubscribe();
    locationUnsubscribe();
  };
}

export function subscribeToSocialData(
  uid: string,
  callbacks: SocialListenerCallbacks
): Unsubscribe {
  const error = (listener: SocialListenerName) => (value: unknown) =>
    callbacks.onError(listener, normalizeCallableError(value));
  const subscriptions: Unsubscribe[] = [
    onSnapshot(
      collection(firestore, 'users', uid, 'friends'),
      { includeMetadataChanges: true },
      (snapshot) => callbacks.onFriends(
        mapDocuments<FriendProjection>(snapshot),
        snapshot.metadata.fromCache
      ),
      error('friends')
    ),
    onSnapshot(
      collection(firestore, 'users', uid, 'friendRequests'),
      { includeMetadataChanges: true },
      (snapshot) => callbacks.onRequests(
        mapDocuments<FriendRequestProjection>(snapshot),
        snapshot.metadata.fromCache
      ),
      error('requests')
    ),
    onSnapshot(
      collection(firestore, 'users', uid, 'friendActivity'),
      { includeMetadataChanges: true },
      (snapshot) => callbacks.onActivity(
        mapDocuments<FriendActivityProjection>(snapshot),
        snapshot.metadata.fromCache
      ),
      error('activity')
    ),
    onSnapshot(
      collection(firestore, 'users', uid, 'blocks'),
      { includeMetadataChanges: true },
      (snapshot) => callbacks.onBlocks(mapDocuments<BlockProjection>(snapshot), snapshot.metadata.fromCache),
      error('blocks')
    ),
    onSnapshot(
      doc(firestore, 'activeCheckIns', uid),
      { includeMetadataChanges: true },
      (snapshot) => callbacks.onOwnCheckIn(
        snapshot.exists() ? (snapshot.data() as OwnCheckIn) : null,
        snapshot.metadata.fromCache
      ),
      error('ownCheckIn')
    ),
  ];

  if (SOCIAL_RELEASE_TWO_ENABLED) {
    subscriptions.push(
      onSnapshot(
        collection(firestore, 'users', uid, 'friendEvents'),
        { includeMetadataChanges: true },
        (snapshot) => callbacks.onFriendEvents(
          mapDocuments<FriendEventProjection & { uid: string }>(snapshot).map((event) => ({
            ...event,
            eventId: event.eventId || event.uid,
          })),
          snapshot.metadata.fromCache
        ),
        error('friendEvents')
      ),
      onSnapshot(
        collection(firestore, 'users', uid, 'friendEventLocations'),
        { includeMetadataChanges: true },
        (snapshot) => callbacks.onFriendEventLocations(
          mapDocuments<FriendEventLocationProjection & { uid: string }>(snapshot).map((location) => ({
            ...location,
            eventId: location.eventId || location.uid,
          })),
          snapshot.metadata.fromCache
        ),
        error('friendEventLocations')
      )
    );
  }

  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}
