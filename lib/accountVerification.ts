import AsyncStorage from '@react-native-async-storage/async-storage';
import { reload, sendEmailVerification } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';

const VERIFICATION_EMAIL_COOLDOWN_MS = 15 * 60 * 1000;
const VERIFICATION_EMAIL_SENT_AT_PREFIX = '@gathr/verification-email-sent-at/';
const VERIFICATION_CONTINUE_URL = 'https://www.gathrapp.ca/app?source=email-verification';

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
    await sendEmailVerification(user, {
      url: VERIFICATION_CONTINUE_URL,
      handleCodeInApp: false,
    });
    await AsyncStorage.setItem(cooldownKey, String(now));
    return { status: 'sent' };
  } catch (error) {
    return { status: 'failed', message: verificationEmailErrorMessage(error) };
  }
}
