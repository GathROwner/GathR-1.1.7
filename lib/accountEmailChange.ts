import { auth } from '../config/firebaseConfig';

const DEFAULT_FUNCTIONS_BASE_URL = 'https://northamerica-northeast2-gathr-m1.cloudfunctions.net';
const FUNCTIONS_BASE_URL = (
  (typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_GATHR_FUNCTIONS_BASE_URL) ||
  DEFAULT_FUNCTIONS_BASE_URL
).replace(/\/+$/, '');

export type AccountEmailChangeResult =
  | { status: 'sent'; pendingEmail: string }
  | { status: 'requires_recent_login' }
  | { status: 'email_already_in_use' }
  | { status: 'email_unchanged' }
  | { status: 'invalid_email' }
  | { status: 'rate_limited' }
  | { status: 'unavailable'; message: string }
  | { status: 'failed'; message: string };

export async function requestCurrentUserEmailChange(newEmail: string): Promise<AccountEmailChangeResult> {
  const user = auth.currentUser;
  if (!user) {
    return { status: 'unavailable', message: 'Sign in again to change your email.' };
  }

  const normalizedEmail = newEmail.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { status: 'invalid_email' };
  }

  try {
    const response = await fetch(`${FUNCTIONS_BASE_URL}/sendBrandedEmailVerification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await user.getIdToken(true)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newEmail: normalizedEmail }),
    });
    const payload = await response.json().catch(() => ({})) as {
      status?: string;
      pendingEmail?: string;
      error?: string;
    };

    if (response.ok && payload.status === 'sent') {
      return { status: 'sent', pendingEmail: payload.pendingEmail || normalizedEmail };
    }
    if (response.status === 429 || payload.error === 'too_many_requests') return { status: 'rate_limited' };
    if (payload.error === 'requires_recent_login') return { status: 'requires_recent_login' };
    if (payload.error === 'email_already_in_use') return { status: 'email_already_in_use' };
    if (payload.error === 'email_unchanged') return { status: 'email_unchanged' };
    if (payload.error === 'invalid_email') return { status: 'invalid_email' };
    if (response.status === 401) return { status: 'requires_recent_login' };

    return { status: 'failed', message: 'GathR could not send the confirmation email right now.' };
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
    if (code === 'auth/network-request-failed') {
      return { status: 'failed', message: 'Connect to the internet and try again.' };
    }
    return { status: 'failed', message: 'GathR could not send the confirmation email right now.' };
  }
}
