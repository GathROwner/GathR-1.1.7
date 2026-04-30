import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

export type CachedStartupLocation = {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number | null;
  source?: 'storage' | 'device_last_known' | 'live_location';
};

type LocationLike = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  };
};

const STARTUP_LOCATION_CACHE_KEY = 'map:lastUserLocation:v1';
export const STARTUP_LOCATION_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DEVICE_LAST_KNOWN_REQUIRED_ACCURACY_METERS = 5000;

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

const toCachedStartupLocation = (
  nextLocation: LocationLike,
  source: CachedStartupLocation['source']
): CachedStartupLocation | null => {
  const { latitude, longitude, accuracy } = nextLocation.coords;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: typeof accuracy === 'number' ? accuracy : null,
    timestamp: Date.now(),
    source,
  };
};

const persistStartupLocation = (payload: CachedStartupLocation) => {
  startupLocationSnapshot = payload;
  startupLocationPromise = Promise.resolve(payload);

  AsyncStorage.setItem(STARTUP_LOCATION_CACHE_KEY, JSON.stringify(payload)).catch(() => {
    // Best-effort cache only; startup must not depend on storage writes.
  });
};

const getDeviceLastKnownStartupLocation = async (): Promise<CachedStartupLocation | null> => {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return null;
    }

    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: STARTUP_LOCATION_CACHE_MAX_AGE_MS,
      requiredAccuracy: DEVICE_LAST_KNOWN_REQUIRED_ACCURACY_METERS,
    });

    if (!lastKnown) {
      return null;
    }

    return toCachedStartupLocation(lastKnown, 'device_last_known');
  } catch {
    return null;
  }
};

export const preloadStartupLocation = () => {
  if (!startupLocationPromise) {
    startupLocationPromise = (async () => {
      const storedLocation = await AsyncStorage.getItem(STARTUP_LOCATION_CACHE_KEY)
        .then((raw) => {
          if (!raw) {
            return null;
          }

          const parsed = JSON.parse(raw);
          if (!isValidCachedStartupLocation(parsed)) {
            return null;
          }

          const cached = { ...parsed, source: parsed.source ?? 'storage' };
          startupLocationSnapshot = cached;
          return cached;
        })
        .catch(() => {
          return null;
        });

      const deviceLocationPromise = getDeviceLastKnownStartupLocation().then((deviceLocation) => {
        if (!deviceLocation) {
          return null;
        }

        if (
          !startupLocationSnapshot ||
          deviceLocation.timestamp >= startupLocationSnapshot.timestamp
        ) {
          persistStartupLocation(deviceLocation);
        }

        return deviceLocation;
      });

      if (storedLocation) {
        void deviceLocationPromise;
        return storedLocation;
      }

      return deviceLocationPromise;
    })();
  }

  return startupLocationPromise;
};

export const cacheStartupLocation = (nextLocation: LocationLike) => {
  const payload = toCachedStartupLocation(nextLocation, 'live_location');
  if (!payload) {
    return;
  }

  persistStartupLocation(payload);
};
