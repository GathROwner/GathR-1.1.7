const DEFAULT_BACKEND_URL =
  'https://gathr-backend-924732524090.northamerica-northeast1.run.app';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const normalizeBaseUrl = (raw?: string): string => {
  if (!raw) return '';
  return raw.trim().replace(/\/+$/, '');
};

const parseBoolean = (raw: string | undefined, defaultValue: boolean): boolean => {
  if (!raw) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return defaultValue;
};

const parsePositiveInt = (
  raw: string | undefined,
  defaultValue: number,
  minValue: number
): number => {
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(minValue, parsed);
};

const envBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_GATHR_BACKEND_URL);

export const BACKEND_BASE_URL = envBaseUrl || DEFAULT_BACKEND_URL;
export const FIRESTORE_API_BASE = `${BACKEND_BASE_URL}/api/v2/firestore`;
export const LEGACY_EVENTS_API_BASE = `${BACKEND_BASE_URL}/api/v2/events`;

// Firestore is the default data source for active app paths.
export const USE_FIRESTORE_EVENTS = parseBoolean(
  process.env.EXPO_PUBLIC_USE_FIRESTORE_EVENTS,
  true
);

// Short-lived compatibility guard for legacy endpoints.
export const ENABLE_LEGACY_EVENTS_FALLBACK = parseBoolean(
  process.env.EXPO_PUBLIC_ENABLE_LEGACY_EVENTS_FALLBACK,
  false
);

export const ENABLE_LEGACY_DETAILS_FALLBACK = parseBoolean(
  process.env.EXPO_PUBLIC_ENABLE_LEGACY_DETAILS_FALLBACK,
  false
);

export const FIRESTORE_INCLUDE_EXPIRED_DEFAULT = parseBoolean(
  process.env.EXPO_PUBLIC_FIRESTORE_INCLUDE_EXPIRED,
  false
);

export const FIRESTORE_PAGE_LIMIT = parsePositiveInt(
  process.env.EXPO_PUBLIC_FIRESTORE_PAGE_LIMIT,
  100,
  1
);

export const FIRESTORE_MAX_PAGES = parsePositiveInt(
  process.env.EXPO_PUBLIC_FIRESTORE_MAX_PAGES,
  20,
  1
);

