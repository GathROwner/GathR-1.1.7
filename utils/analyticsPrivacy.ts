const EMAIL_PATTERN = /^[^@\s]+@([a-z0-9.-]+\.[a-z]{2,})$/i;

/**
 * Keeps authentication analytics useful without sending a full email address.
 * Invalid or accidentally contaminated input is deliberately collapsed to a
 * fixed value so pasted passwords or other secrets cannot enter analytics.
 */
export function getAnalyticsEmailDomain(value: string): string {
  const match = value.trim().match(EMAIL_PATTERN);
  return match?.[1]?.toLowerCase() ?? 'invalid';
}
