import AsyncStorage from '@react-native-async-storage/async-storage';

export type CachedStartupLocation = {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number | null;
};

type LocationLike = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  };
};

const STARTUP_LOCATION_CACHE_KEY = 'map:lastUserLocation:v1';
const STARTUP_LOCATION_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let startupLocationPromise: Promise<CachedStartupLocation | null> | null = null;
let startupLocationSnapshot: CachedStartupLocation | null = null;

const isValidCachedStartupLocation = (value: unknown): value is CachedStartupLocation => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CachedStartupLocation>;
  return (
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number' &&
    typeof candidate.timestamp === 'number' &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude) &&
    Number.isFinite(candidate.timestamp) &&
    Math.abs(candidate.latitude) <= 90 &&
    Math.abs(candidate.longitude) <= 180 &&
    Date.now() - candidate.timestamp <= STARTUP_LOCATION_CACHE_MAX_AGE_MS
  );
};

export const getPreloadedStartupLocationSnapshot = () => startupLocationSnapshot;

export const preloadStartupLocation = () => {
  if (!startupLocationPromise) {
    startupLocationPromise = AsyncStorage.getItem(STARTUP_LOCATION_CACHE_KEY)
      .then((raw) => {
        if (!raw) {
          startupLocationSnapshot = null;
          return null;
        }

        const parsed = JSON.parse(raw);
        if (!isValidCachedStartupLocation(parsed)) {
          startupLocationSnapshot = null;
          return null;
        }

        startupLocationSnapshot = parsed;
        return parsed;
      })
      .catch(() => {
        startupLocationSnapshot = null;
        return null;
      });
  }

  return startupLocationPromise;
};

export const cacheStartupLocation = (nextLocation: LocationLike) => {
  const { latitude, longitude, accuracy } = nextLocation.coords;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return;
  }

  const payload: CachedStartupLocation = {
    latitude,
    longitude,
    accuracy: typeof accuracy === 'number' ? accuracy : null,
    timestamp: Date.now(),
  };

  startupLocationSnapshot = payload;
  startupLocationPromise = Promise.resolve(payload);

  AsyncStorage.setItem(STARTUP_LOCATION_CACHE_KEY, JSON.stringify(payload)).catch(() => {
    // Best-effort cache only; startup must not depend on storage writes.
  });
};
