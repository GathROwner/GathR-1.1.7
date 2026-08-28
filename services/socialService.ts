import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { firestore, functions } from '../config/firebaseConfig';
import { amplitudeTrack } from '../lib/amplitudeAnalytics';
import type {
  BlockProjection,
  CheckInInput,
  FriendActivityProjection,
  FriendProjection,
  FriendRequestProjection,
  OwnCheckIn,
  SocialProfile,
} from '../types/social';

export class SocialServiceError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SocialServiceError';
    this.code = code;
  }
}

export interface SocialCallableDiagnostic {
  operation: string;
  requestId: string;
  durationMs: number;
  success: boolean;
  errorCode: string | null;
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

function normalizeCallableError(error: unknown): SocialServiceError {
  const candidate = error as { code?: string; message?: string };
  const code = String(candidate?.code || 'unknown').replace(/^functions\//, '');
  const fallback: Record<string, string> = {
    unauthenticated: 'Sign in to use friends and check-ins.',
    'permission-denied': 'This social action is not available.',
    'resource-exhausted': 'Please wait a moment before trying again.',
    unavailable: 'GathR social is temporarily unavailable. Try again when you are online.',
  };
  return new SocialServiceError(
    code,
    fallback[code] || candidate?.message || 'The social request could not be completed.'
  );
}

async function callSocial<Request, Response>(
  name: string,
  data: Request
): Promise<Response> {
  const startedAt = Date.now();
  const operation = name.replace(/Callable$/, '');
  diagnosticSequence += 1;
  const requestId = `${startedAt.toString(36)}-${diagnosticSequence.toString(36)}`;
  try {
    const callable = httpsCallable<Request, Response>(functions, name);
    const result = (await callable(data)).data;
    amplitudeTrack('social_callable_completed', {
      operation,
      success: true,
      duration_ms: Date.now() - startedAt,
    });
    publishCallableDiagnostic({
      operation,
      requestId,
      durationMs: Date.now() - startedAt,
      success: true,
      errorCode: null,
    });
    return result;
  } catch (error) {
    const normalized = normalizeCallableError(error);
    amplitudeTrack('social_callable_completed', {
      operation,
      success: false,
      error_code: normalized.code,
      duration_ms: Date.now() - startedAt,
    });
    publishCallableDiagnostic({
      operation,
      requestId,
      durationMs: Date.now() - startedAt,
      success: false,
      errorCode: normalized.code,
    });
    throw normalized;
  }
}

export function normalizeSocialHandle(value: string): string {
  return value.normalize('NFKC').trim().replace(/^@+/, '').toLowerCase();
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

export const checkOut = () =>
  callSocial<Record<string, never>, { checkedOut: true; removedViewerCount: number }>(
    'checkOutCallable',
    {}
  );

export const deleteSocialAccountData = () =>
  callSocial<Record<string, never>, {
    relationshipsDeleted: number;
    projectionsDeleted: number;
    incomingBlocksDeleted: number;
    handleReleased: boolean;
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

export interface SocialListenerCallbacks {
  onFriends: (friends: FriendProjection[], fromCache: boolean) => void;
  onRequests: (requests: FriendRequestProjection[], fromCache: boolean) => void;
  onActivity: (activity: FriendActivityProjection[], fromCache: boolean) => void;
  onBlocks: (blocks: BlockProjection[], fromCache: boolean) => void;
  onOwnCheckIn: (checkIn: OwnCheckIn | null, fromCache: boolean) => void;
  onError: (error: SocialServiceError) => void;
}

export function subscribeToSocialData(
  uid: string,
  callbacks: SocialListenerCallbacks
): Unsubscribe {
  const error = (value: unknown) => callbacks.onError(normalizeCallableError(value));
  const subscriptions: Unsubscribe[] = [
    onSnapshot(
      collection(firestore, 'users', uid, 'friends'),
      { includeMetadataChanges: true },
      (snapshot) => callbacks.onFriends(
        mapDocuments<FriendProjection>(snapshot),
        snapshot.metadata.fromCache
      ),
      error
    ),
    onSnapshot(
      collection(firestore, 'users', uid, 'friendRequests'),
      { includeMetadataChanges: true },
      (snapshot) => callbacks.onRequests(
        mapDocuments<FriendRequestProjection>(snapshot),
        snapshot.metadata.fromCache
      ),
      error
    ),
    onSnapshot(
      collection(firestore, 'users', uid, 'friendActivity'),
      { includeMetadataChanges: true },
      (snapshot) => callbacks.onActivity(
        mapDocuments<FriendActivityProjection>(snapshot),
        snapshot.metadata.fromCache
      ),
      error
    ),
    onSnapshot(
      collection(firestore, 'users', uid, 'blocks'),
      { includeMetadataChanges: true },
      (snapshot) => callbacks.onBlocks(mapDocuments<BlockProjection>(snapshot), snapshot.metadata.fromCache),
      error
    ),
    onSnapshot(
      doc(firestore, 'activeCheckIns', uid),
      { includeMetadataChanges: true },
      (snapshot) => callbacks.onOwnCheckIn(
        snapshot.exists() ? (snapshot.data() as OwnCheckIn) : null,
        snapshot.metadata.fromCache
      ),
      error
    ),
  ];

  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}
