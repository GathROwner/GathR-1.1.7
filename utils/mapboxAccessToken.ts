import Constants from 'expo-constants';

export const MAPBOX_ACCESS_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  (Constants.expoConfig?.extra?.mapboxAccessToken as string | undefined) ||
  '';

type MapboxModule = {
  setAccessToken: (token: string) => void;
};

export function initializeMapboxAccessToken(MapboxGL: MapboxModule) {
  if (!MAPBOX_ACCESS_TOKEN) {
    console.error('Mapbox access token is not configured.');
    return;
  }

  try {
    MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);
  } catch (error) {
    console.error('Error setting Mapbox token:', error);
  }
}
