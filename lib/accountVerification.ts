import AsyncStorage from '@react-native-async-storage/async-storage';
import { reload } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';

const VERIFICATION_EMAIL_COOLDOWN_MS = 15 * 60 * 1000;
const VERIFICATION_EMAIL_SENT_AT_PREFIX = '@gathr/verification-email-sent-at/';
const DEFAULT_FUNCTIONS_BASE_URL = 'https://northamerica-northeast2-gathr-m1.cloudfunctions.net';
const FUNCTIONS_BASE_URL = (
  (typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_GATHR_FUNCTIONS_BASE_URL) ||
  DEFAULT_FUNCTIONS_BASE_URL
).replace(/\/+$/, '');

export type VerificationEmailResult =
  | { status: 'sent' }
  | { status: 'recently_sent' }
  | { status: 'already_verified' }
  | { status: 'unavailable'; message: string }
  | { status: 'failed'; message: string };

function verificationEmailErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';

  if (code === 'auth/too-many-requests') {
    return 'Firebase has temporarily limited verification emails. Please try again later.';
  }
  if (code === 'auth/network-request-failed') {
    return 'The verification email could not be sent while the device was offline.';
  }
  return 'The verification email could not be sent right now.';
}

async function sendBrandedVerificationEmail(idToken: string): Promise<'sent' | 'already_verified' | 'recently_sent'> {
  const response = await fetch(`${FUNCTIONS_BASE_URL}/sendBrandedEmailVerification`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const payload = await response.json().catch(() => ({})) as {
    status?: string;
    error?: string;
  };

  if (response.status === 429 || payload.error === 'too_many_requests') {
    return 'recently_sent';
  }
  if (!response.ok) {
    const error = new Error(payload.error || `Verification email request failed (${response.status}).`);
    (error as Error & { code?: string }).code = payload.error || 'delivery_failed';
    throw error;
  }
  if (payload.status === 'already_verified') return 'already_verified';
  if (payload.status !== 'sent') throw new Error('Verification email response was incomplete.');
  return 'sent';
}

export async function requestCurrentUserVerificationEmail(
  now = Date.now()
): Promise<VerificationEmailResult> {
  const user = auth.currentUser;
  if (!user) {
    return { status: 'unavailable', message: 'Sign in again to verify this account.' };
  }

  try {
    await reload(user);
  } catch {
    // A stale local user can still request an email; Firebase will validate it.
  }

  if (user.emailVerified) return { status: 'already_verified' };
  if (!user.email) {
    return {
      status: 'unavailable',
      message: 'This account does not have an email address that Firebase can verify.',
    };
  }

  const cooldownKey = `${VERIFICATION_EMAIL_SENT_AT_PREFIX}${user.uid}`;
  const previousSentAtValue = await AsyncStorage.getItem(cooldownKey);
  const previousSentAt = Number(previousSentAtValue);
  if (
    previousSentAtValue !== null &&
    Number.isFinite(previousSentAt) &&
    now - previousSentAt < VERIFICATION_EMAIL_COOLDOWN_MS
  ) {
    return { status: 'recently_sent' };
  }

  try {
    const serverStatus = await sendBrandedVerificationEmail(await user.getIdToken());
    if (serverStatus === 'already_verified') return { status: 'already_verified' };
    if (serverStatus === 'recently_sent') return { status: 'recently_sent' };
    await AsyncStorage.setItem(cooldownKey, String(now));
    return { status: 'sent' };
  } catch (error) {
    return { status: 'failed', message: verificationEmailErrorMessage(error) };
  }
}
