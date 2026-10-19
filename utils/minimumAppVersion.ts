export type StorePlatform = 'ios' | 'android';

export type PlatformVersionPolicy = {
  enabled: boolean;
  storeReleaseAvailable: boolean;
  minimumVersion: string;
  minimumOSVersion?: string;
  minimumApiLevel?: number;
};

export type MinimumAppVersionPolicy = {
  schemaVersion: 1;
  ios?: PlatformVersionPolicy;
  android?: PlatformVersionPolicy;
};

export const APP_STORE_URLS: Record<StorePlatform, string> = {
  ios: 'https://apps.apple.com/app/id6743016252',
  android: 'https://play.google.com/store/apps/details?id=com.craigb.gathr',
};

// Public, non-sensitive release policy. The download token grants read access
// to this one object only; it is not a Firebase account credential.
export const MINIMUM_VERSION_POLICY_URL =
  'https://firebasestorage.googleapis.com/v0/b/gathr-m1.firebasestorage.app/o/app-config%2Fminimum-versions.json?alt=media&token=733d57b9-49f8-4a9d-b231-4f4859e31cb1';

function numericVersion(value: unknown, exactAppVersion = false): number[] | null {
  if (typeof value !== 'string' || value.length > 32) return null;
  const pattern = exactAppVersion ? /^\d+\.\d+\.\d+$/ : /^\d+(?:\.\d+){0,2}$/;
  if (!pattern.test(value)) return null;
  const parts = value.split('.').map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  return [...parts, 0, 0].slice(0, 3);
}

function compare(left: number[], right: number[]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

/** A bad platform entry never blocks that platform or invalidates its sibling. */
function readPlatform(value: unknown, platform: StorePlatform): PlatformVersionPolicy | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entry = value as Record<string, unknown>;
  if (typeof entry.enabled !== 'boolean' || typeof entry.storeReleaseAvailable !== 'boolean' ||
      !numericVersion(entry.minimumVersion, true)) return undefined;
  if (platform === 'ios' && !numericVersion(entry.minimumOSVersion)) return undefined;
  if (platform === 'android' &&
      (!Number.isSafeInteger(entry.minimumApiLevel) || (entry.minimumApiLevel as number) < 1)) return undefined;
  return {
    enabled: entry.enabled,
    storeReleaseAvailable: entry.storeReleaseAvailable,
    minimumVersion: entry.minimumVersion as string,
    ...(platform === 'ios'
      ? { minimumOSVersion: entry.minimumOSVersion as string }
      : { minimumApiLevel: entry.minimumApiLevel as number }),
  };
}

export function parseMinimumAppVersionPolicy(value: unknown): MinimumAppVersionPolicy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const policy = value as Record<string, unknown>;
  if (policy.schemaVersion !== 1) return null;
  return {
    schemaVersion: 1,
    ios: readPlatform(policy.ios, 'ios'),
    android: readPlatform(policy.android, 'android'),
  };
}

export function requiredAppVersion(
  policy: MinimumAppVersionPolicy | null,
  platform: string,
  installedVersion: string | null,
  osVersion: string | number,
): string | null {
  if (platform !== 'ios' && platform !== 'android') return null;
  const entry = policy?.[platform];
  const installed = numericVersion(installedVersion, true);
  const minimum = numericVersion(entry?.minimumVersion, true);
  if (!entry?.enabled || !entry.storeReleaseAvailable || !installed || !minimum) return null;

  // Do not require a store build that cannot run on this device's OS.
  if (platform === 'ios') {
    const os = numericVersion(osVersion);
    const minimumOS = numericVersion(entry.minimumOSVersion);
    if (!os || !minimumOS || compare(os, minimumOS) < 0) return null;
  } else if (typeof osVersion !== 'number' || !Number.isSafeInteger(osVersion) ||
             !entry.minimumApiLevel || osVersion < entry.minimumApiLevel) {
    return null;
  }
  return compare(installed, minimum) < 0 ? entry.minimumVersion : null;
}

export function shouldCheckMinimumAppVersion(channel: string | null, platform: string, development: boolean): boolean {
  return !development && channel === 'production' && (platform === 'ios' || platform === 'android');
}
