import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Svg, { Circle } from 'react-native-svg';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../../contexts/AuthContext';
import {
  createPrivateCheckInPlaceCandidate,
  discoverNearbyCheckInPlaces,
  listNearbyCanonicalCheckInVenues,
  SocialServiceError,
} from '../../services/socialService';
import { useMapStore } from '../../store';
import { useSocialStore } from '../../store/socialStore';
import type {
  NearbyCheckInPlaceCandidate,
} from '../../types/social';
import { SOCIAL_FEATURE_ENABLED, SOCIAL_RELEASE_TWO_ENABLED } from '../../types/social';
import { useCheckInReadinessStore } from '../../store/checkInReadinessStore';
import { claimReadinessPrompt } from '../../services/checkInReadinessPreferences';
import { CHECK_IN_READINESS, isFreshReadiness, mayPromptReadiness, projectedReadinessMs } from '../../utils/checkInReadiness';
import { readinessLevels } from '../../utils/checkInReadinessContract';

const MAX_ACCURACY_METRES = 75;
const BASE_RADIUS_METRES = 50;


export interface VenueCandidate {
  id: string;
  type: 'gathr_venue' | 'external_place' | 'private_place';
  venueId?: string;
  placeCandidateId?: string;
  venueName: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
  distanceMetres: number;
  imageUrl: string;
}

interface Props {
  enabled: boolean;
  rightOffset?: number;
  bottomOffset?: number;
}

function distanceMetres(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(secondLatitude - firstLatitude);
  const longitudeDelta = radians(secondLongitude - firstLongitude);
  const firstLatitudeRadians = radians(firstLatitude);
  const secondLatitudeRadians = radians(secondLatitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitudeRadians)
    * Math.cos(secondLatitudeRadians)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}

function remoteImageUrl(value: unknown): string {
  const imageUrl = String(value || '').trim();
  return /^https?:\/\//i.test(imageUrl) ? imageUrl : '';
}

function placeIcon(category: string) {
  const normalized = category.toLowerCase();
  if (/bar|pub|beer|wine|nightlife/.test(normalized)) return 'beer-outline';
  if (/restaurant|food|cafe|coffee|bakery/.test(normalized)) return 'restaurant-outline';
  if (/cinema|theatre|entertainment/.test(normalized)) return 'film-outline';
  if (/shop|store|retail/.test(normalized)) return 'storefront-outline';
  return 'business-outline';
}

const PRIVATE_PLACE_LABELS = ['Home', "Friend's place", 'Private gathering'] as const;

export function VenueAvatar({ venue, active = false }: { venue: VenueCandidate | null; active?: boolean }) {
  if (venue?.imageUrl) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: venue.imageUrl }}
        style={[styles.venueAvatar, active && styles.activeVenueAvatar]}
      />
    );
  }

  if (venue?.type === 'external_place') {
    return (
      <View style={[styles.venueAvatar, styles.externalAvatar, active && styles.activeVenueAvatar]}>
        <Ionicons name={placeIcon(venue.category)} size={19} color="#B54708" />
      </View>
    );
  }


  if (venue?.type === 'private_place') {
    return (
      <View style={[styles.venueAvatar, styles.privateAvatar, active && styles.activeVenueAvatar]}>
        <Ionicons name="home-outline" size={19} color="#6941C6" />
      </View>
    );
  }

  const initial = venue?.venueName.trim().charAt(0).toUpperCase();
  return (
    <View style={[styles.venueAvatar, styles.venueAvatarFallback, active && styles.activeVenueAvatar]}>
      {initial
        ? <Text style={styles.venueAvatarInitial}>{initial}</Text>
        : <Ionicons name="location" size={18} color="#175CD3" />}
    </View>
  );
}

export function buildNearbyCheckInRoute(
  venue: VenueCandidate,
  readinessSessionId: string,
  eligibleCandidates: VenueCandidate[]
) {
  if (venue.type !== 'gathr_venue') {
    return {
      pathname: '/check-in' as const,
      params: {
        placeCandidateId: venue.placeCandidateId || venue.id,
        placeType: venue.type,
        placeName: venue.venueName,
        ...(venue.type === 'external_place' ? { placeAddress: venue.address } : {}),
        placeCategory: venue.category,
        readinessSessionId,
      },
    };
  }
  return {
    pathname: '/check-in' as const,
    params: {
      venueId: venue.venueId,
      readinessSessionId,
      eligibleVenueIds: eligibleCandidates
        .filter((item) => item.type === 'gathr_venue' && item.venueId)
        .map((item) => item.venueId)
        .join(','),
    },
  };
}

export function closestNearbyPlaceId(candidates: VenueCandidate[]): string {
  return candidates.reduce<VenueCandidate | null>((closest, current) => (
    !closest || current.distanceMetres < closest.distanceMetres ? current : closest
  ), null)?.id || '';
}

export function ReadinessRings({ here, place, hereReady, placeReady, emphasizedRing, children }: {
  here: number; place: number; hereReady: boolean; placeReady: boolean;
  emphasizedRing?: 'here' | 'place'; children: React.ReactNode;
}) {
  const ring = (name: 'here' | 'place', radius: number, progress: number, ready: boolean, color: string, readyColor: string) => {
    const circumference = 2 * Math.PI * radius;
    // A fresh local stationary threshold opens the choices immediately. The
    // server receipt remains mandatory before any check-in is saved.
    const displayedProgress = ready ? 1 : Math.min(1, Math.max(0, progress));
    return <React.Fragment key={radius}>
      <Circle cx={24} cy={24} r={radius} stroke={color} strokeOpacity={0.16} strokeWidth={3.5} fill="none" />
      {displayedProgress > 0 && <Circle testID={`check-in-${name}-ring`} cx={24} cy={24} r={radius}
        stroke={ready ? readyColor : color} strokeWidth={ready ? (emphasizedRing === name ? 5.5 : 4.5) : 3.5} fill="none"
        strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - displayedProgress)} rotation={-90} origin="24, 24" />}
    </React.Fragment>;
  };
  return <View style={styles.rings} pointerEvents="none">
    <Svg width={36} height={36} viewBox="0 0 48 48" style={StyleSheet.absoluteFill}>
      {ring('place', 21.5, place, placeReady, '#2F80ED', '#175CD3')}
      {ring('here', 16, here, hereReady, '#8B5CF6', '#6D28D9')}
    </Svg>
    {children}
  </View>;
}

function usePresentedReadiness(
  evidence: ReturnType<typeof useCheckInReadinessStore.getState>['evidence'],
  interrupted: boolean
) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    setNowMs(Date.now());
    if (evidence.reason !== 'qualifying'
      || (evidence.hereMs >= CHECK_IN_READINESS.hereMs && evidence.placeMs >= CHECK_IN_READINESS.placeMs)) return;
    const timer = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(timer);
  }, [evidence.hereMs, evidence.placeMs, evidence.previous?.capturedAtMs, evidence.reason]);
  return projectedReadinessMs(
    evidence,
    nowMs,
    interrupted ? CHECK_IN_READINESS.maxResumeGapMs : CHECK_IN_READINESS.maxSampleGapMs
  );
}

function findCandidates(venues: VenueCandidate[], location: Location.LocationObject): VenueCandidate[] {
  const accuracy = Number(location.coords.accuracy);
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_ACCURACY_METRES) return [];
  const nearby: { venue: VenueCandidate; distance: number }[] = [];
  for (const venue of venues) {
    const distance = distanceMetres(
      location.coords.latitude,
      location.coords.longitude,
      venue.latitude,
      venue.longitude
    );
    if (distance > BASE_RADIUS_METRES + accuracy) continue;
    nearby.push({ venue, distance });
  }
  return nearby
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 4)
    .map(({ venue, distance }) => ({ ...venue, distanceMetres: Math.round(distance) }));
}

function messageForError(error: unknown) {
  return error instanceof SocialServiceError || error instanceof Error
    ? error.message
    : 'Nearby places could not be loaded right now.';
}

function isNearbyPublicPlacesLookupUnavailable(error: unknown) {
  return error instanceof SocialServiceError
    && error.code === 'unavailable'
    && error.details?.condition === 'nearby_public_places_external_lookup_unavailable'
    && error.details.retryable === true;
}

function acceptedReadinessLocation(uid: string, requirePlace: boolean) {
  const current = useCheckInReadinessStore.getState();
  const now = Date.now();
  const levels = readinessLevels(current.evidence, current.receipt, current.sessionId, now);
  const sample = current.evidence.previous;
  const accuracyLimit = requirePlace
    ? CHECK_IN_READINESS.placeAccuracyMetres
    : CHECK_IN_READINESS.hereAccuracyMetres;
  const ageMs = sample ? now - sample.capturedAtMs : Number.POSITIVE_INFINITY;
  if (
    current.uid !== uid
    || !current.appActive
    || current.interruptedAtMs !== null
    || !current.sessionId
    || !(requirePlace ? levels.place : levels.here)
    || !sample
    || !Number.isFinite(sample.accuracyMeters)
    || sample.accuracyMeters! < 0
    || sample.accuracyMeters! > accuracyLimit
    || ageMs < 0
    || ageMs > CHECK_IN_READINESS.maxSampleGapMs
  ) return null;
  return {
    latitude: sample.latitude,
    longitude: sample.longitude,
    accuracyMeters: sample.accuracyMeters!,
    speedMetersPerSecond: sample.speedMetersPerSecond,
    capturedAtMs: Math.floor(sample.capturedAtMs),
    sessionId: current.sessionId,
  };
}

function localReadinessLocation(uid: string, requirePlace: boolean) {
  const current = useCheckInReadinessStore.getState();
  const now = Date.now();
  const elapsed = projectedReadinessMs(current.evidence, now);
  const sample = current.evidence.previous;
  const accuracyLimit = requirePlace
    ? CHECK_IN_READINESS.placeAccuracyMetres
    : CHECK_IN_READINESS.hereAccuracyMetres;
  const ageMs = sample ? now - sample.capturedAtMs : Number.POSITIVE_INFINITY;
  const localThresholdMet = isFreshReadiness(current.evidence, now)
    && (requirePlace ? elapsed.placeMs >= CHECK_IN_READINESS.placeMs : elapsed.hereMs >= CHECK_IN_READINESS.hereMs);
  if (
    current.uid !== uid
    || !current.appActive
    || current.interruptedAtMs !== null
    || !current.sessionId
    || !localThresholdMet
    || !sample
    || !Number.isFinite(sample.accuracyMeters)
    || sample.accuracyMeters! < 0
    || sample.accuracyMeters! > accuracyLimit
    || ageMs < 0
    || ageMs > CHECK_IN_READINESS.maxSampleGapMs
  ) return null;
  return {
    latitude: sample.latitude,
    longitude: sample.longitude,
    accuracyMeters: sample.accuracyMeters!,
    speedMetersPerSecond: sample.speedMetersPerSecond,
    capturedAtMs: Math.floor(sample.capturedAtMs),
    sessionId: current.sessionId,
  };
}

// A near-ready sample may still be in flight when the ring reaches its local
// threshold. Allow the 8-second sample-call timeout plus a near-ready retry and
// a small margin before telling the user server confirmation failed.
function waitForServerReadiness(uid: string, requirePlace: boolean, sessionId: string, timeoutMs = 12_000) {
  return new Promise<boolean>((resolve) => {
    let finished = false;
    let unsubscribe: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (ready: boolean) => {
      if (finished) return;
      finished = true;
      if (timeout) clearTimeout(timeout);
      unsubscribe?.();
      resolve(ready);
    };
    const inspect = () => {
      const current = useCheckInReadinessStore.getState();
      const now = Date.now();
      if (current.uid !== uid || !current.appActive || current.interruptedAtMs !== null
        || current.sessionId !== sessionId || !isFreshReadiness(current.evidence, now)) {
        finish(false);
        return;
      }
      const levels = readinessLevels(current.evidence, current.receipt, current.sessionId, now);
      if (requirePlace ? levels.place : levels.here) finish(true);
    };
    timeout = setTimeout(() => finish(false), timeoutMs);
    unsubscribe = useCheckInReadinessStore.subscribe(inspect);
    inspect();
  });
}

export default function ContextualCheckInControl({ enabled, rightOffset = 10, bottomOffset = 0 }: Props) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const allEvents = useMapStore((state) => state.allEvents);
  const ownCheckIn = useSocialStore((state) => state.ownCheckIn);
  const readiness = useCheckInReadinessStore();
  const [bubble, setBubble] = useState('');
  const [binding, setBinding] = useState(false);
  const bindingRef = useRef(false);
  const privateCreationRef = useRef(false);
  const flowGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const autoBubbleRef = useRef(false);
  const visibleRef = useRef(false);
  const checkInRouteOpeningRef = useRef(false);
  const retryKnownVenuesRef = useRef<((capture: NonNullable<ReturnType<typeof localReadinessLocation>>, flowGeneration: number) => Promise<void>) | null>(null);




  const [pickerVisible, setPickerVisible] = useState(false);
  const [externalSearchVisible, setExternalSearchVisible] = useState(false);
  const [knownNearbyPlaces, setKnownNearbyPlaces] = useState<VenueCandidate[]>([]);
  const [knownVenuesLoading, setKnownVenuesLoading] = useState(false);
  const [knownVenuesNotice, setKnownVenuesNotice] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [confirmingReadiness, setConfirmingReadiness] = useState(false);
  const [discoveryError, setDiscoveryError] = useState('');
  const [partialDiscoveryNotice, setPartialDiscoveryNotice] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [nearbyPlaces, setNearbyPlaces] = useState<VenueCandidate[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState('');
  const [privateSetupVisible, setPrivateSetupVisible] = useState(false);
  const [privateLabelChoice, setPrivateLabelChoice] = useState<string>('Home');
  const [privateCustomLabel, setPrivateCustomLabel] = useState('');
  const [creatingPrivatePlace, setCreatingPrivatePlace] = useState(false);
  const [privatePlaceError, setPrivatePlaceError] = useState('');
  const [locationInfoVisible, setLocationInfoVisible] = useState(false);
  const canonicalCacheRef = useRef<{ sessionId: string; expiresAtMs: number; places: VenueCandidate[] } | null>(null);
  const venues = useMemo(() => {
    const byId = new Map<string, VenueCandidate>();
    for (const event of allEvents) {
      const venueId = String(event.venueId || '').trim();
      if (
        !venueId
        || event.locationScope === 'city'
        || event.locationScope === 'area'
        || event.locationScope === 'route'
        || event.locationScope === 'unknown'
        || !Number.isFinite(event.latitude)
        || !Number.isFinite(event.longitude)
      ) continue;
      const existing = byId.get(venueId);
      if (existing) {
        const imageUrl = remoteImageUrl(event.profileUrl);
        if (!existing.imageUrl && imageUrl) byId.set(venueId, { ...existing, imageUrl });
        continue;
      }
      byId.set(venueId, {
        id: `venue:${venueId}`,
        type: 'gathr_venue',
        venueId,
        venueName: event.venue || event.title || 'GathR venue',
        address: event.address || '',
        category: 'GathR venue',
        latitude: event.latitude,
        longitude: event.longitude,
        distanceMetres: 0,
        imageUrl: remoteImageUrl(event.profileUrl),
      });
    }
    return [...byId.values()];
  }, [allEvents]);

  const presentedReadiness = usePresentedReadiness(readiness.evidence, readiness.interruptedAtMs !== null);
  const recordedLevels = readinessLevels(readiness.evidence, readiness.receipt, readiness.sessionId, Date.now());
  // Both the completion cue and action wait for a fresh return fix after an interruption.
  const levels = readiness.interruptedAtMs === null ? recordedLevels : { here: false, place: false };
  visibleRef.current = enabled && isFocused && readiness.appActive && !pickerVisible && !checkInRouteOpeningRef.current;
  const nearby = readiness.evidence.previous
    ? findCandidates(venues, { coords: {
      ...readiness.evidence.previous, accuracy: readiness.evidence.previous.accuracyMeters,
    } } as unknown as Location.LocationObject) : [];
  const knownPlaces = (() => {
    const byId = new Map<string, VenueCandidate>();
    nearby.forEach((place) => byId.set(place.id, place));
    knownNearbyPlaces.forEach((place) => byId.set(place.id, place));
    const sample = readiness.evidence.previous;
    return [...byId.values()]
      .map((place) => ({
        ...place,
        distanceMetres: sample
          ? Math.round(distanceMetres(sample.latitude, sample.longitude, place.latitude, place.longitude))
          : place.distanceMetres,
      }))
      .sort((first, second) => first.distanceMetres - second.distanceMetres)
      .slice(0, 5);
  })();
  // GPS cannot identify one business among overlapping venues. Keep the generic icon when ambiguous.
  const localHereCapture = user ? localReadinessLocation(user.uid, false) : null;
  const localPlaceCapture = user ? localReadinessLocation(user.uid, true) : null;
  const hereEntryReady = levels.here || !!localHereCapture;
  const placeEntryReady = levels.place || !!localPlaceCapture;
  const candidate = nearby.length === 1 && nearby[0].distanceMetres <= 25 && placeEntryReady ? nearby[0] : null;
  const showBubble = useCallback((message: string, automatic = false) => {
    autoBubbleRef.current = automatic;
    setBubble(message);
  }, []);
  useEffect(() => {
    if (pickerVisible && externalSearchVisible && !placeEntryReady) {
      setNearbyPlaces([]);
      setSelectedPlaceId('');
      if (!discovering) {
        setDiscoveryError('Your location needs to settle again. Wait for the blue Place ring, then search again.');
      }
    }
  }, [discovering, externalSearchVisible, placeEntryReady, pickerVisible]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    if (isFocused) checkInRouteOpeningRef.current = false;
  }, [isFocused]);
  useEffect(() => {
    if (!readiness.restorePickerOnReturn || !isFocused || !enabled || !user) return;
    useCheckInReadinessStore.setState({ restorePickerOnReturn: false });
    flowGenerationRef.current += 1;
    setBubble('');
    setPickerVisible(true);
    setExternalSearchVisible(false);
    setPrivateSetupVisible(false);
    setLocationInfoVisible(false);
    setKnownVenuesLoading(false);
    setDiscovering(false);
    setDiscoveryError('');
    setPartialDiscoveryNotice('');
    setSelectionError('');
    setPrivatePlaceError('');
    setNearbyPlaces([]);
  }, [enabled, isFocused, readiness.restorePickerOnReturn, user]);
  useEffect(() => {
    const now = Date.now();
    if (!ownCheckIn && readiness.uid === user?.uid && readiness.preferencesLoaded
      && mayPromptReadiness(readiness.evidence, now, readiness.lastPromptAtMs,
        enabled && isFocused && readiness.appActive && !pickerVisible && !checkInRouteOpeningRef.current, levels.place)) {
      void claimReadinessPrompt(now).then((claimed) => {
        const current = useCheckInReadinessStore.getState();
        if (claimed && mountedRef.current && visibleRef.current && current.uid === user?.uid && current.appActive
          && current.interruptedAtMs === null
          && readinessLevels(current.evidence, current.receipt, current.sessionId, Date.now()).place) {
          showBubble(candidate ? `You can check in at ${candidate.venueName}` : 'You can check in here.', true);
        }
      });
    }
  }, [candidate, enabled, isFocused, levels.place, ownCheckIn, pickerVisible, readiness, showBubble, user?.uid]);
  // If the local ring opens the picker before its server receipt is ready,
  // the first canonical lookup can time out. Retry it once Here is confirmed
  // so the temporary notice cannot remain after readiness catches up.
  useEffect(() => {
    if (!pickerVisible || externalSearchVisible || knownVenuesLoading
      || !knownVenuesNotice.startsWith('GathR is still confirming your location.')
      || !levels.here || !user) return;
    const capture = acceptedReadinessLocation(user.uid, false);
    if (capture) void retryKnownVenuesRef.current?.(capture, flowGenerationRef.current);
  }, [externalSearchVisible, knownVenuesLoading, knownVenuesNotice, levels.here, pickerVisible, user]);

  if (!enabled || !SOCIAL_FEATURE_ENABLED || !SOCIAL_RELEASE_TWO_ENABLED || !user) return null;

  const decorateNearbyCandidate = (place: NearbyCheckInPlaceCandidate): VenueCandidate => {
    const recognized = place.venueId
      ? venues.find((venue) => venue.venueId === place.venueId)
      : null;
    return {
      id: place.id,
      type: place.type,
      venueId: place.venueId,
      placeCandidateId: place.type === 'external_place' ? place.id : undefined,
      venueName: place.name,
      address: place.address,
      category: place.category,
      latitude: place.latitude,
      longitude: place.longitude,
      distanceMetres: place.distanceMetres,
      imageUrl: recognized?.imageUrl || '',
    };
  };

  const loadKnownNearbyVenues = async (
    capture: NonNullable<ReturnType<typeof localReadinessLocation>>,
    flowGeneration: number
  ) => {
    const sessionId = capture.sessionId;
    const cached = canonicalCacheRef.current;
    if (cached && cached.sessionId === sessionId && cached.expiresAtMs > Date.now()) {
      setKnownNearbyPlaces(cached.places);
      setKnownVenuesNotice('');
      setKnownVenuesLoading(false);
      return;
    }
    setKnownVenuesLoading(true);
    setKnownVenuesNotice('');
    try {
      // The picker and locally known venues appear as soon as Here is complete.
      // Wait for the server receipt only before asking the canonical venue service.
      const confirmed = await waitForServerReadiness(user.uid, false, sessionId);
      if (!mountedRef.current || flowGenerationRef.current !== flowGeneration) return;
      if (!confirmed) {
        const stillHere = localReadinessLocation(user.uid, false);
        if (stillHere?.sessionId === sessionId) {
          setKnownVenuesNotice('GathR is still confirming your location. Nearby venues already loaded on the map remain available.');
        }
        return;
      }
      const verifiedCapture = acceptedReadinessLocation(user.uid, false);
      if (!verifiedCapture || verifiedCapture.sessionId !== sessionId) return;
      const { sessionId: verifiedSessionId, ...location } = verifiedCapture;
      const result = await listNearbyCanonicalCheckInVenues(location);
      const current = useCheckInReadinessStore.getState();
      const stillReady = localReadinessLocation(user.uid, false);
      if (!mountedRef.current || flowGenerationRef.current !== flowGeneration
        || !stillReady || current.sessionId !== verifiedSessionId || stillReady.sessionId !== verifiedSessionId) return;
      const places = result.candidates.map(decorateNearbyCandidate);
      canonicalCacheRef.current = { sessionId: verifiedSessionId, expiresAtMs: Date.now() + 5 * 60_000, places };
      setKnownNearbyPlaces(places);
      setSelectedPlaceId((currentId) => places.some((place) => place.id === currentId)
        ? currentId : closestNearbyPlaceId([...nearby, ...places]));
    } catch {
      const current = useCheckInReadinessStore.getState();
      if (!mountedRef.current || flowGenerationRef.current !== flowGeneration || current.sessionId !== sessionId) return;
      setKnownVenuesNotice('Could not refresh GathR venues. Showing the nearby places already loaded.');
    } finally {
      if (mountedRef.current && flowGenerationRef.current === flowGeneration) setKnownVenuesLoading(false);
    }
  };
  retryKnownVenuesRef.current = loadKnownNearbyVenues;

  const openCheckInPicker = () => {
    const capture = localReadinessLocation(user.uid, false);
    if (!capture) {
      showBubble('Your location is updating. The check-in choices will be ready when the purple ring is complete.');
      return;
    }
    flowGenerationRef.current += 1;
    const flowGeneration = flowGenerationRef.current;
    setBubble('');
    setPickerVisible(true);
    setExternalSearchVisible(false);
    setPrivateSetupVisible(false);
    setKnownVenuesLoading(false);
    setDiscovering(false);
    setConfirmingReadiness(false);
    setDiscoveryError('');
    setPartialDiscoveryNotice('');
    setSelectionError('');
    setNearbyPlaces([]);
    setKnownVenuesNotice('');
    const localKnown = findCandidates(venues, { coords: {
      latitude: capture.latitude,
      longitude: capture.longitude,
      accuracy: capture.accuracyMeters,
    } } as Location.LocationObject);
    setKnownNearbyPlaces(localKnown);
    setSelectedPlaceId(closestNearbyPlaceId(localKnown));
    void loadKnownNearbyVenues(capture, flowGeneration);
  };

  const searchSomewhereElse = async () => {
    if (discovering) return;
    const localCapture = localReadinessLocation(user.uid, true);
    setExternalSearchVisible(true);
    setDiscoveryError('');
    setPartialDiscoveryNotice('');
    setNearbyPlaces([]);
    setSelectedPlaceId('');
    if (!localCapture) {
      setDiscoveryError('The blue Place ring needs to be ready before searching nearby. Stay here while it finishes.');
      return;
    }
    const flowGeneration = flowGenerationRef.current;
    setDiscovering(true);
    setConfirmingReadiness(true);
    try {
      const confirmed = await waitForServerReadiness(user.uid, true, localCapture.sessionId);
      setConfirmingReadiness(false);
      if (!mountedRef.current || flowGenerationRef.current !== flowGeneration) return;
      const capture = confirmed ? acceptedReadinessLocation(user.uid, true) : null;
      if (!capture || capture.sessionId !== localCapture.sessionId) {
        setDiscoveryError('Location confirmation did not finish. Stay here until the blue Place ring is ready, then try again.');
        return;
      }
      const { sessionId, ...location } = capture;
      const result = await discoverNearbyCheckInPlaces(location);
      const current = useCheckInReadinessStore.getState();
      const stillReady = acceptedReadinessLocation(user.uid, true);
      if (!mountedRef.current || flowGenerationRef.current !== flowGeneration) return;
      if (!stillReady || current.sessionId !== sessionId || stillReady.sessionId !== sessionId) {
        setDiscoveryError('Your location changed during the search. Stay still until the blue ring is ready, then try again.');
        return;
      }
      const external = result.candidates
        .filter((place) => place.type === 'external_place')
        .map(decorateNearbyCandidate)
        .sort((first, second) => first.distanceMetres - second.distanceMetres);
      setNearbyPlaces(external);
      setSelectedPlaceId('');
      if (result.externalLookupStatus === 'partial_unavailable') {
        setPartialDiscoveryNotice('OpenStreetMap could not load additional places. Your nearby GathR venues are still available.');
      } else if (external.length === 0) {
        setDiscoveryError('No additional public places showed up nearby. Your GathR venues are still available.');
      }
    } catch (error) {
      if (!mountedRef.current || flowGenerationRef.current !== flowGeneration) return;
      setDiscoveryError(isNearbyPublicPlacesLookupUnavailable(error)
        ? 'Nearby public places could not be loaded. Your GathR venues are still available.'
        : messageForError(error));
    } finally {
      if (mountedRef.current && flowGenerationRef.current === flowGeneration) {
        setDiscovering(false);
        setConfirmingReadiness(false);
      }
    }
  };

  const choosePlace = async (place: VenueCandidate | null) => {
    if (!place || bindingRef.current) return;
    const initial = useCheckInReadinessStore.getState();
    const requirePlace = place.type !== 'private_place';
    const localCapture = localReadinessLocation(user.uid, requirePlace);
    const report = (message: string) => place.type === 'private_place' ? setPrivatePlaceError(message) : setSelectionError(message);
    if (initial.uid !== user.uid || !initial.appActive || initial.interruptedAtMs !== null
      || !localCapture || localCapture.sessionId !== initial.sessionId) {
      report('Readiness changed. Return to the map; the rings will update as your location settles.');
      return;
    }
    bindingRef.current = true;
    const flowGeneration = flowGenerationRef.current;
    setBinding(true);
    setSelectionError('');
    try {
      const confirmed = await waitForServerReadiness(user.uid, requirePlace, localCapture.sessionId);
      if (!confirmed) throw new Error('Location confirmation did not finish. Stay here until the ring is ready, then try again.');
      const capture = acceptedReadinessLocation(user.uid, requirePlace);
      if (!capture || capture.sessionId !== localCapture.sessionId) {
        throw new Error('Your location changed before GathR could confirm it. Wait for the ring to fill again.');
      }
      const sessionId = capture.sessionId;
      const current = useCheckInReadinessStore.getState();
      if (!mountedRef.current || flowGenerationRef.current !== flowGeneration) return;
      const freshLevels = readinessLevels(current.evidence, current.receipt, current.sessionId, Date.now());
      if (current.uid !== user.uid || !current.appActive || current.interruptedAtMs !== null
        || current.sessionId !== initial.sessionId || current.sessionId !== sessionId
        || (place.type === 'private_place' ? !freshLevels.here : !freshLevels.place)) {
        throw new Error('Readiness changed. Return to the map to check your location.');
      }
      checkInRouteOpeningRef.current = true;
      visibleRef.current = false;
      setPickerVisible(false);
      setPrivateSetupVisible(false);
      setExternalSearchVisible(false);
      setLocationInfoVisible(false);
      setBubble('');
      autoBubbleRef.current = false;
      // Keep observing movement while the user chooses privacy settings. The
      // server session is one-use and target-bound, so bind it only when they
      // confirm the final check-in.
      const route = buildNearbyCheckInRoute(place, sessionId, [place]);
      router.push({ ...route, params: { ...route.params, readinessVersion: '1',
        ...(place.type === 'gathr_venue' ? { placeType: 'gathr_venue', placeName: place.venueName, placeAddress: place.address } : {}),
      } });
      void Haptics.selectionAsync().catch(() => undefined);
    } catch (error) {
      if (mountedRef.current) report(messageForError(error));
    } finally {
      bindingRef.current = false;
      if (mountedRef.current) setBinding(false);
    }
  };

  const selectedPlace = (externalSearchVisible ? nearbyPlaces : knownPlaces)
    .find((place) => place.id === selectedPlaceId) || null;
  const returnToKnownPlaces = () => {
    setExternalSearchVisible(false);
    setLocationInfoVisible(false);
    setDiscoveryError('');
    setPartialDiscoveryNotice('');
    setNearbyPlaces([]);
    setSelectedPlaceId(closestNearbyPlaceId(knownPlaces));
  };
  const refreshCurrentPlaces = () => {
    if (externalSearchVisible) void searchSomewhereElse();
    else openCheckInPicker();
  };
  const openPrivateSetup = () => {
    setPrivatePlaceError('');
    setPrivateSetupVisible(true);
  };

  const createPrivatePlace = async () => {
    if (privateCreationRef.current || bindingRef.current) return;
    const current = useCheckInReadinessStore.getState();
    const localCapture = localReadinessLocation(user.uid, false);
    if (current.uid !== user.uid || !current.appActive || current.interruptedAtMs !== null
      || !localCapture || localCapture.sessionId !== current.sessionId) {
      setPrivatePlaceError('Readiness changed. Return to the map to check your location.');
      return;
    }
    const label = privateLabelChoice === 'Custom'
      ? privateCustomLabel.trim()
      : privateLabelChoice;
    if (label.length < 2) {
      setPrivatePlaceError('Add a short private-place label. Do not enter an address.');
      return;
    }
    setCreatingPrivatePlace(true);
    privateCreationRef.current = true;
    const flowGeneration = flowGenerationRef.current;
    setPrivatePlaceError('');
    try {
      const confirmed = await waitForServerReadiness(user.uid, false, localCapture.sessionId);
      if (!confirmed) {
        setPrivatePlaceError('Location confirmation is taking longer than expected. Stay here and try again.');
        return;
      }
      if (!mountedRef.current || flowGenerationRef.current !== flowGeneration) return;
      const capture = acceptedReadinessLocation(user.uid, false);
      if (!capture || capture.sessionId !== localCapture.sessionId) {
        setPrivatePlaceError('Your location is updating. Wait for the purple ring to be ready, then retry.');
        return;
      }
      const { sessionId: capturedSessionId, ...location } = capture;
      const result = await createPrivateCheckInPlaceCandidate({
        label,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracyMeters: location.accuracyMeters,
        capturedAtMs: location.capturedAtMs,
      });
      if (useCheckInReadinessStore.getState().sessionId !== capturedSessionId
        || !acceptedReadinessLocation(user.uid, false)) {
        throw new Error('Your location changed while preparing this private place. Wait for the purple ring to be ready again.');
      }
      const place = result.candidate;
      if (!mountedRef.current || flowGenerationRef.current !== flowGeneration) return;
      await choosePlace({
        id: place.id,
        type: 'private_place',
        placeCandidateId: place.id,
        venueName: place.name,
        address: '',
        category: 'Private location',
        latitude: place.latitude,
        longitude: place.longitude,
        distanceMetres: 0,
        imageUrl: '',
      });
    } catch (error) {
      setPrivatePlaceError(messageForError(error));
    } finally {
      privateCreationRef.current = false;
      setCreatingPrivatePlace(false);
    }
  };
  const closePicker = () => { flowGenerationRef.current += 1; setPickerVisible(false); };

  const defaultReadinessCopy = 'Here prepares a private check-in. Place prepares a nearby public venue.';
  const earlyCopy = readiness.mode === 'basic' || !readiness.foregroundGranted
    ? 'Browse without location. Enable While Using GathR to prepare a nearby check-in.'
    : readiness.evidence.reason === 'driving'
      ? 'Check-in readiness is paused after driving. It will resume once you have settled.'
      : readiness.evidence.reason === 'moving'
        ? 'The rings reset when you move. They build once your location settles.'
        : readiness.evidence.reason === 'low_accuracy' || readiness.evidence.reason === 'stale'
          ? 'Waiting for fresh, accurate location fixes. You can keep browsing while the rings prepare.'
        : hereEntryReady
          ? 'The 30-second wait is complete. Tap the checkmark to choose; GathR confirms your location before saving.'
        : readiness.serviceError
          ? 'Check-in verification is unavailable right now. You can keep browsing.'
          : defaultReadinessCopy;
  const hereProgress = hereEntryReady ? 1 : Math.min(1, presentedReadiness.hereMs / CHECK_IN_READINESS.hereMs);
  const placeProgress = placeEntryReady ? 1 : Math.min(1, presentedReadiness.placeMs / CHECK_IN_READINESS.placeMs);
  const explanation = autoBubbleRef.current && levels.place ? bubble : hereEntryReady
    ? placeEntryReady ? 'Ready for a private or public-place check-in. Tap the checkmark to choose.'
      : 'Private check-in is ready. Tap the checkmark to choose. Public places need the blue ring too.'
    : earlyCopy;
  const readinessNotice = explanation === defaultReadinessCopy ? '' : explanation;
  const ringStatus = (ready: boolean, elapsed: number, required: number) => ready ? 'Ready'
    : elapsed >= required ? 'Confirming' : `${Math.floor(elapsed / 1000)}/${required / 1000}s`;
  const progressCopy = (ready: boolean, elapsed: number, required: number) => ready ? 'Ready'
    : elapsed >= required ? 'Confirming' : `${Math.floor(elapsed / 1000)} / ${required / 1000} sec`;
  const control = <>
    {!!bubble && isFocused && <View style={[styles.bubble, { right: rightOffset + 44, bottom: 42 + bottomOffset }]} testID="check-in-readiness-explanation" accessibilityLiveRegion="polite">
      <View style={styles.bubbleHeading}>
        <View style={styles.bubbleTitleIcon}>
          <Ionicons name="location-outline" size={18} color="#6941C6" />
        </View>
        <Text style={styles.bubbleTitle}>Check-in readiness</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss check-in hint"
          onPress={() => setBubble('')} style={styles.bubbleClose}><Ionicons name="close" size={19} color="#475467" /></TouchableOpacity>
      </View>
      <View style={styles.readinessRows}>
        <View style={styles.readinessRow}>
          <View style={[styles.readinessIcon, styles.hereReadinessIcon]}>
            <Ionicons name="home-outline" size={17} color="#6941C6" />
          </View>
          <View style={styles.readinessBody}>
            <View style={styles.readinessRowHeading}>
              <View style={styles.readinessLabelGroup}>
                <Text style={styles.hereReadinessLabel}>Here</Text>
                <Text numberOfLines={1} style={styles.readinessDescription}>Private check-in</Text>
              </View>
              <Text numberOfLines={1} style={styles.hereProgressText}>
                {progressCopy(hereEntryReady, presentedReadiness.hereMs, CHECK_IN_READINESS.hereMs)}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, styles.hereProgressFill, { width: `${Math.round(hereProgress * 100)}%` }]} />
            </View>
          </View>
        </View>
        <View style={styles.readinessRow}>
          <View style={[styles.readinessIcon, styles.placeReadinessIcon]}>
            <Ionicons name="business-outline" size={17} color="#175CD3" />
          </View>
          <View style={styles.readinessBody}>
            <View style={styles.readinessRowHeading}>
              <View style={styles.readinessLabelGroup}>
                <Text style={styles.placeReadinessLabel}>Place</Text>
                <Text numberOfLines={1} style={styles.readinessDescription}>Nearby public venue</Text>
              </View>
              <Text numberOfLines={1} style={styles.placeProgressText}>
                {progressCopy(placeEntryReady, presentedReadiness.placeMs, CHECK_IN_READINESS.placeMs)}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, styles.placeProgressFill, { width: `${Math.round(placeProgress * 100)}%` }]} />
            </View>
          </View>
        </View>
      </View>
      {!!readinessNotice && (
        <View style={styles.readinessNotice}>
          <Ionicons name="information-circle-outline" size={16} color="#667085" />
          <Text style={styles.readinessNoticeText}>{readinessNotice}</Text>
        </View>
      )}
      <TouchableOpacity accessibilityRole="button" onPress={() => { setBubble(''); router.push('/check-in-settings'); }} style={styles.settingsLink}>
        <Text style={styles.settingsText}>Location &amp; arrival reminders</Text>
        <Ionicons name="chevron-forward" size={15} color="#175CD3" />
      </TouchableOpacity>
    </View>}
    <TouchableOpacity accessibilityRole="button" activeOpacity={0.85}
      accessibilityLabel={ownCheckIn ? `Manage active check-in at ${ownCheckIn.venueNameSnapshot}`
        : `${hereEntryReady ? 'Check-in ready' : 'Check-in readiness'}. Here ${ringStatus(hereEntryReady, presentedReadiness.hereMs, CHECK_IN_READINESS.hereMs)}. Place ${ringStatus(placeEntryReady, presentedReadiness.placeMs, CHECK_IN_READINESS.placeMs)}.`}
      onPress={() => {
        if (ownCheckIn) router.push('/check-in');
        else if (hereEntryReady && readiness.uid === user.uid) openCheckInPicker();
        else showBubble(earlyCopy);
      }}
        style={[styles.control, { right: rightOffset, bottom: 42 + bottomOffset }, ownCheckIn ? styles.checkedInControl : hereEntryReady && styles.readyControl]}
      testID={ownCheckIn ? 'contextual-check-in-active' : hereEntryReady ? 'contextual-check-in-ready' : 'contextual-check-in-idle'}>
      {ownCheckIn ? <ReadinessRings
        here={1} place={1} hereReady placeReady
        emphasizedRing={ownCheckIn.locationType === 'private_place' ? 'here' : 'place'}>
        <View style={styles.checkedInMark}>
          <View style={styles.checkedInPinCircle}>
            <Ionicons name="location" size={14} color="#FFFFFF" />
          </View>
          <View style={styles.checkedInBadge}>
            <Ionicons name="checkmark" size={8} color="#FFFFFF" />
          </View>
        </View>
      </ReadinessRings> : <ReadinessRings
        here={hereProgress} place={placeProgress} hereReady={hereEntryReady} placeReady={placeEntryReady}>
        {hereEntryReady ? <View testID="check-in-ready-mark" style={[styles.readyMark, placeEntryReady && styles.placeReadyMark]}>
          <Ionicons name="checkmark" color="#FFFFFF" size={16} />
        </View> : candidate ? <View style={styles.smallAvatar}><VenueAvatar venue={candidate} /></View>
          : <Ionicons name="location-outline" size={18} color={hereEntryReady ? '#175CD3' : '#667085'} />}
      </ReadinessRings>}
    </TouchableOpacity>
  </>;

  return (
    <>
      {control}
      <Modal animationType="slide" onRequestClose={closePicker} transparent visible={pickerVisible}>
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              {privateSetupVisible && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Back to place choices"
                  onPress={() => { setPrivateSetupVisible(false); setPrivatePlaceError(''); }}
                  style={styles.pickerBackButton}
                >
                  <Ionicons name="chevron-back" size={25} color="#101828" />
                </TouchableOpacity>
              )}
              <View style={styles.copy}>
                <Text style={styles.pickerEyebrow}>CHECK IN</Text>
                <Text style={styles.pickerTitle}>{externalSearchVisible ? 'Find a public place' : 'Where are you?'}</Text>
                {externalSearchVisible ? (
                  <>
                    <View style={styles.locationStatusRow}>
                      <Ionicons name="navigate-outline" size={17} color="#2F80ED" />
                      <Text numberOfLines={1} style={styles.locationStatusCopy}>Using your recent location</Text>
                      <View style={styles.locationReadyStatus}>
                        {placeEntryReady
                          ? <Ionicons name="checkmark-circle" size={16} color="#039855" />
                          : <ActivityIndicator size="small" color="#2F80ED" />}
                        <Text style={[styles.locationReadyText, !placeEntryReady && styles.locationCheckingText]}>
                          {placeEntryReady ? 'Ready' : 'Waiting'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={locationInfoVisible ? 'Hide location information' : 'Why GathR uses your location'}
                        accessibilityState={{ expanded: locationInfoVisible }}
                        onPress={() => setLocationInfoVisible((visible) => !visible)}
                        style={styles.locationInfoButton}
                      >
                        <Ionicons name={locationInfoVisible ? 'close-circle-outline' : 'information-circle-outline'} size={20} color="#2F80ED" />
                      </TouchableOpacity>
                    </View>
                    {locationInfoVisible && (
                      <View style={styles.locationInfoCard} accessibilityLiveRegion="polite">
                        <Text style={styles.locationInfoCopy}>
                          GathR uses your recent location to find nearby public places. It isn’t shared with friends; you choose who can see your check-in before continuing.
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={styles.pickerSubtitle}>
                    {privateSetupVisible
                      ? 'Use a private label. Never enter a home address.'
                      : placeEntryReady
                        ? 'Choose a nearby GathR venue, find somewhere else, or check in privately.'
                        : 'Private check-in is ready. Public places unlock when the blue ring is ready.'}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={privateSetupVisible ? 'Cancel private check-in setup' : externalSearchVisible ? 'Close public place search' : 'Close place choices'}
                onPress={closePicker}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color="#344054" />
              </TouchableOpacity>
            </View>

            {!privateSetupVisible && !externalSearchVisible && (
              <View style={styles.privateEntryBar}>
                <TouchableOpacity accessibilityRole="button" onPress={openPrivateSetup} style={styles.privateEntryButton} testID="private-place-entry">
                  <View style={styles.privateEntryIcon}><Ionicons name="home-outline" size={20} color="#6941C6" /></View>
                  <View style={styles.copy}>
                    <Text style={styles.privateEntryTitle}>Private check-in</Text>
                    <Text numberOfLines={1} style={styles.privateEntryCopy}>Home or another private place</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#6941C6" />
                </TouchableOpacity>
              </View>
            )}

            {privateSetupVisible ? (
              <View style={styles.privateSetup}>
                <View style={styles.privateHero}>
                  <View style={styles.privateHeroIcon}><Ionicons name="home-outline" size={24} color="#6941C6" /></View>
                  <View style={styles.copy}>
                    <Text style={styles.privateTitle}>Keep this place private</Text>
                    <Text style={styles.privateSubtitle}>Give friends context without saving or showing your address.</Text>
                  </View>
                </View>
                <Text style={styles.privateFieldLabel}>What should friends call it?</Text>
                <View style={styles.privateChoices}>
                  {[...PRIVATE_PLACE_LABELS, 'Custom'].map((label) => {
                    const selected = privateLabelChoice === label;
                    return (
                      <TouchableOpacity
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        key={label}
                        onPress={() => { setPrivateLabelChoice(label); setPrivatePlaceError(''); }}
                        style={[styles.privateChoice, selected && styles.privateChoiceSelected]}
                      >
                        <Text style={[styles.privateChoiceText, selected && styles.privateChoiceTextSelected]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {privateLabelChoice === 'Custom' && (
                  <TextInput
                    accessibilityLabel="Private place label"
                    autoCapitalize="sentences"
                    maxLength={40}
                    onChangeText={(value) => { setPrivateCustomLabel(value); setPrivatePlaceError(''); }}
                    placeholder="e.g. Game night"
                    style={styles.privateInput}
                    value={privateCustomLabel}
                  />
                )}
                <View style={styles.privatePrivacyCard}>
                  <Ionicons name="shield-checkmark-outline" size={21} color="#0F766E" />
                  <Text style={styles.privatePrivacyCopy}>By default, friends see only a neighbourhood-sized approximate area. On the next screen, your precise location can be shared only with friends you explicitly select.</Text>
                </View>
                {!!privatePlaceError && <Text style={styles.privateError}>{privatePlaceError}</Text>}
                <TouchableOpacity
                  accessibilityRole="button"
                  testID="continue-private-check-in"
                  disabled={creatingPrivatePlace || binding || !hereEntryReady}
                  onPress={() => void createPrivatePlace()}
                  style={[styles.usePrivateButton, (creatingPrivatePlace || binding || !hereEntryReady) && styles.disabled]}
                >
                  {creatingPrivatePlace
                    ? <><ActivityIndicator color="#FFFFFF" /><Text style={styles.usePlaceText}>Confirming location…</Text></>
                    : <><Text style={styles.usePlaceText}>Continue to privacy</Text><Ionicons name="arrow-forward" size={19} color="#FFFFFF" /></>}
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {externalSearchVisible && (
                  <TouchableOpacity accessibilityRole="button" onPress={returnToKnownPlaces} style={styles.externalBackRow}>
                    <Ionicons name="arrow-back" size={17} color="#175CD3" />
                    <Text style={styles.externalBackText}>Nearby GathR venues</Text>
                  </TouchableOpacity>
                )}
                <ScrollView contentContainerStyle={styles.placeList} showsVerticalScrollIndicator={false}>
                  {externalSearchVisible ? (
                    <>
                      {!!partialDiscoveryNotice && <View testID="nearby-public-places-partial-notice" style={styles.partialDiscoveryNotice} accessibilityLiveRegion="polite">
                        <View style={styles.partialDiscoveryNoticeCopy}>
                          <Text style={styles.partialDiscoveryTitle}>Some places could not be loaded</Text>
                          <Text style={styles.partialDiscoveryCopy}>{partialDiscoveryNotice}</Text>
                        </View>
                      </View>}
                      {discovering && (
                        <View style={styles.inlineSearchState} accessibilityLiveRegion="polite">
                          <ActivityIndicator color="#2F80ED" />
                          <Text style={styles.inlineSearchCopy}>{confirmingReadiness ? 'Confirming your location…' : 'Looking for other nearby public places…'}</Text>
                        </View>
                      )}
                      {!!discoveryError && (
                        <View style={styles.searchErrorCard} accessibilityLiveRegion="polite">
                          <View style={styles.stateIcon}><Ionicons name="location-outline" size={21} color="#B54708" /></View>
                          <Text style={styles.searchErrorCopy}>{discoveryError}</Text>
                          {placeEntryReady && (
                            <TouchableOpacity accessibilityRole="button" onPress={() => void searchSomewhereElse()} testID="retry-nearby-public-places" style={styles.retryButton}>
                              <Text style={styles.retryText}>Try again</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                      {nearbyPlaces.map((place, index) => {
                        const selected = place.id === selectedPlaceId;
                        return (
                          <TouchableOpacity
                            accessibilityLabel={`${place.venueName}, ${place.distanceMetres} metres away`}
                            accessibilityRole="radio"
                            accessibilityState={{ selected, disabled: !placeEntryReady }}
                            disabled={!placeEntryReady}
                            key={place.id}
                            onPress={() => { setSelectedPlaceId(place.id); setSelectionError(''); }}
                            style={[styles.placeRow, selected && styles.placeRowSelected, !placeEntryReady && styles.disabledPlaceRow]}
                          >
                            <VenueAvatar venue={place} />
                            <View style={styles.copy}>
                              <View style={styles.placeNameRow}>
                                <Text numberOfLines={1} style={styles.placeName}>{place.venueName}</Text>
                                {index === 0 && <Text style={styles.closestBadge}>CLOSEST</Text>}
                              </View>
                              <Text numberOfLines={1} style={styles.placeMeta}>{place.distanceMetres} m · {place.category}</Text>
                              <Text numberOfLines={1} style={styles.placeAddress}>{place.address}</Text>
                            </View>
                            <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={selected ? '#2F80ED' : '#98A2B3'} />
                          </TouchableOpacity>
                        );
                      })}
                      {!discovering && !discoveryError && !partialDiscoveryNotice && nearbyPlaces.length === 0 && (
                        <View style={styles.emptyPlacesCard}>
                          <Ionicons name="search-outline" size={22} color="#667085" />
                          <Text style={styles.emptyPlacesCopy}>No other public places showed up nearby. Your GathR venues are still available.</Text>
                        </View>
                      )}
                    </>
                  ) : (
                    <>
                      <View style={styles.nearbySectionHeading}>
                        <Text style={styles.nearbySectionTitle}>Nearby on GathR</Text>
                        {knownVenuesLoading && <ActivityIndicator size="small" color="#2F80ED" />}
                      </View>
                      {!!knownVenuesNotice && (
                        <View style={styles.knownVenueNotice} accessibilityLiveRegion="polite">
                          <Ionicons name="information-circle-outline" size={17} color="#667085" />
                          <Text style={styles.knownVenueNoticeCopy}>{knownVenuesNotice}</Text>
                        </View>
                      )}
                      {knownPlaces.map((place, index) => {
                        const selected = place.id === selectedPlaceId;
                        return (
                          <TouchableOpacity
                            accessibilityLabel={`${place.venueName}, ${place.distanceMetres} metres away`}
                            accessibilityRole="radio"
                            accessibilityState={{ selected, disabled: !placeEntryReady }}
                            disabled={!placeEntryReady}
                            key={place.id}
                            onPress={() => { setSelectedPlaceId(place.id); setSelectionError(''); }}
                            style={[styles.placeRow, selected && styles.placeRowSelected, !placeEntryReady && styles.disabledPlaceRow]}
                          >
                            <VenueAvatar venue={place} />
                            <View style={styles.copy}>
                              <View style={styles.placeNameRow}>
                                <Text numberOfLines={1} style={styles.placeName}>{place.venueName}</Text>
                                {index === 0 && <Text style={styles.closestBadge}>CLOSEST</Text>}
                              </View>
                              <Text numberOfLines={1} style={styles.placeMeta}>{place.distanceMetres} m · GathR venue</Text>
                              <Text numberOfLines={1} style={styles.placeAddress}>{place.address}</Text>
                            </View>
                            <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={selected ? '#2F80ED' : '#98A2B3'} />
                          </TouchableOpacity>
                        );
                      })}
                      {!knownPlaces.length && knownVenuesLoading && (
                        <View style={styles.inlineSearchState} accessibilityLiveRegion="polite">
                          <ActivityIndicator color="#2F80ED" />
                          <Text style={styles.inlineSearchCopy}>Checking nearby GathR venues…</Text>
                        </View>
                      )}
                      {!knownPlaces.length && !knownVenuesLoading && (
                        <View style={styles.emptyPlacesCard}>
                          <Ionicons name="business-outline" size={22} color="#667085" />
                          <Text style={styles.emptyPlacesCopy}>No known GathR venues are close by. You can search public places instead.</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !placeEntryReady }}
                        disabled={!placeEntryReady || discovering}
                        onPress={() => void searchSomewhereElse()}
                        style={[styles.somewhereElseButton, (!placeEntryReady || discovering) && styles.disabledPlaceRow]}
                        testID="find-somewhere-else"
                      >
                        <View style={styles.somewhereElseIcon}><Ionicons name="search-outline" size={20} color="#175CD3" /></View>
                        <View style={styles.copy}>
                          <Text style={styles.somewhereElseTitle}>Somewhere else</Text>
                          <Text style={styles.somewhereElseCopy}>Find a public place</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={19} color="#175CD3" />
                      </TouchableOpacity>
                    </>
                  )}
                </ScrollView>
                <View style={styles.pickerFooter}>
                  {!!selectionError && <View testID="check-in-selection-error" style={styles.selectionErrorCard} accessibilityLiveRegion="polite">
                    <Text style={styles.selectionErrorText}>{selectionError}</Text>
                    <View style={styles.selectionErrorActions}>
                      <TouchableOpacity accessibilityRole="button" onPress={refreshCurrentPlaces} testID="refresh-check-in-places">
                        <Text style={styles.retryText}>Refresh places</Text>
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityRole="button" onPress={closePicker}>
                        <Text style={styles.retryText}>Back to map</Text>
                      </TouchableOpacity>
                    </View>
                  </View>}
                  <View style={styles.privacyRow}>
                    <Ionicons name="shield-checkmark-outline" size={18} color="#0F766E" />
                    <Text style={styles.privacyCopy}>{placeEntryReady
                      ? 'Nothing is shared yet. Choose who can see your check-in next.'
                      : 'Private check-in is ready now. Public choices unlock when the blue Place ring completes.'}</Text>
                  </View>
                  {externalSearchVisible && (
                    <TouchableOpacity
                      accessibilityRole="link"
                      onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
                      style={styles.attributionRow}
                    >
                      <Text style={styles.attributionText}>Place data © OpenStreetMap contributors</Text>
                    </TouchableOpacity>
                  )}
                  {placeEntryReady ? (
                    <TouchableOpacity testID="continue-public-check-in" accessibilityRole="button" disabled={!selectedPlace || binding} onPress={() => void choosePlace(selectedPlace)} style={[styles.usePlaceButton, (!selectedPlace || binding) && styles.disabled]}>
                      <Text style={styles.usePlaceText}>{binding ? 'Confirming location…' : selectionError ? 'Try this place again' : 'Continue to privacy'}</Text>
                      <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.placeReadinessHint}>Stay here while the blue Place ring finishes.</Text>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  selectionErrorCard: { backgroundColor: '#FFFAEB', borderRadius: 12, padding: 12, gap: 10, marginBottom: 10 },
  selectionErrorText: { color: '#93370D', fontSize: 14, lineHeight: 20 },
  selectionErrorActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  control: {
    position: 'absolute', right: 10, bottom: 42, width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center', borderRadius: 18,
    backgroundColor: '#FFFFFF', shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.16, shadowRadius: 5,
    // Match recenter's layer so the interest carousel can cover both controls.
    elevation: 5, zIndex: 10,
  },
  readyControl: { backgroundColor: '#F0F7FF' },
  checkedInControl: { backgroundColor: '#FFFFFF' },
  rings: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  smallAvatar: { transform: [{ scale: 0.55 }] },
  readyMark: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6D28D9' },
  placeReadyMark: { backgroundColor: '#175CD3' },
  checkedInMark: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  checkedInPinCircle: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#175CD3' },
  checkedInBadge: { position: 'absolute', top: 0, right: 0, width: 13, height: 13, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#12B76A', borderWidth: 1.5, borderColor: '#FFFFFF' },
  bubble: { position: 'absolute', right: 54, bottom: 42, width: 254, maxWidth: '76%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12, elevation: 6, zIndex: 11, shadowColor: '#101828', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  bubbleHeading: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0' },
  bubbleTitleIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#F4EBFF' },
  bubbleTitle: { flex: 1, minWidth: 0, color: '#344054', fontSize: 14, lineHeight: 18, fontWeight: '800' },
  bubbleClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8, marginTop: -4 },
  readinessRows: { marginTop: 2 },
  readinessRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0' },
  readinessIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  hereReadinessIcon: { backgroundColor: '#F4EBFF' },
  placeReadinessIcon: { backgroundColor: '#EFF8FF' },
  readinessBody: { flex: 1, minWidth: 0 },
  readinessRowHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  readinessLabelGroup: { flex: 1, minWidth: 0 },
  hereReadinessLabel: { color: '#6941C6', fontSize: 13, lineHeight: 16, fontWeight: '800' },
  placeReadinessLabel: { color: '#175CD3', fontSize: 13, lineHeight: 16, fontWeight: '800' },
  readinessDescription: { color: '#667085', fontSize: 10.5, lineHeight: 14 },
  hereProgressText: { color: '#6941C6', fontSize: 10.5, fontWeight: '800' },
  placeProgressText: { color: '#175CD3', fontSize: 10.5, fontWeight: '800' },
  progressTrack: { height: 6, marginTop: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#EAECF0' },
  progressFill: { height: '100%', borderRadius: 3 },
  hereProgressFill: { backgroundColor: '#9E77ED' },
  placeProgressFill: { backgroundColor: '#2F80ED' },
  readinessNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, padding: 8, borderRadius: 10, backgroundColor: '#F8FAFC' },
  readinessNoticeText: { flex: 1, color: '#475467', fontSize: 10.5, lineHeight: 15, fontWeight: '500' },
  settingsLink: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingTop: 4 },
  settingsText: { flex: 1, color: '#175CD3', fontSize: 11.5, fontWeight: '700' },
  activeControl: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B2DDFF' },
  progressControl: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D6BBFB' },
  idleControl: {
    right: 10, bottom: 34, width: 36, height: 36, minHeight: 36, maxWidth: 36,
    justifyContent: 'center', gap: 0, paddingHorizontal: 0, paddingVertical: 0,
    borderRadius: 18, borderWidth: 1, borderColor: '#99D6CF', backgroundColor: '#FFFFFF',
  },
  iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  idleIconCircle: { backgroundColor: '#ECFDF3' },
  venueAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#EFF8FF' },
  activeVenueAvatar: { borderColor: '#B2DDFF' },
  venueAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  externalAvatar: { alignItems: 'center', justifyContent: 'center', borderColor: '#FEDF89', backgroundColor: '#FFFAEB' },
  privateAvatar: { alignItems: 'center', justifyContent: 'center', borderColor: '#D6BBFB', backgroundColor: '#F4EBFF' },
  venueAvatarInitial: { color: '#175CD3', fontSize: 16, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#175CD3', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  activeVenue: { color: '#101828', fontWeight: '800', marginTop: 1 },
  readyEyebrow: { color: '#DCEBFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  readyVenue: { color: '#FFFFFF', fontWeight: '800', marginTop: 1 },
  progressVenue: { color: '#344054', fontWeight: '800' },
  progressText: { color: '#6941C6', fontSize: 12, fontWeight: '600', marginTop: 1 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.45)' },
  pickerCard: { maxHeight: '78%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#F8FAFC', overflow: 'hidden' },
  pickerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 15, paddingBottom: 13 },
  pickerBackButton: { width: 38, height: 38, flexShrink: 0, alignItems: 'center', justifyContent: 'center', marginLeft: -8, borderRadius: 19 },
  pickerEyebrow: { color: '#2F80ED', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  pickerTitle: { marginTop: 2, color: '#101828', fontSize: 25, lineHeight: 30, fontWeight: '900' },
  pickerSubtitle: { marginTop: 2, color: '#667085', fontSize: 13.5, lineHeight: 19 },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#EAECF0' },
  pickerState: { minHeight: 250, alignItems: 'center', justifyContent: 'center', gap: 11, paddingHorizontal: 30, paddingBottom: 30 },
  pickerStateTitle: { color: '#344054', fontSize: 15, lineHeight: 21, fontWeight: '800', textAlign: 'center' },
  pickerStateCopy: { color: '#667085', fontSize: 13, textAlign: 'center' },
  stateIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#FFFAEB' },
  retryButton: { minHeight: 42, marginTop: 4, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 14, backgroundColor: '#EFF8FF' },
  retryText: { color: '#175CD3', fontWeight: '900' },
  partialDiscoveryNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginBottom: 8, padding: 12, borderRadius: 14, backgroundColor: '#FFFAEB', borderWidth: 1, borderColor: '#FEDF89' },
  partialDiscoveryNoticeCopy: { flex: 1, minWidth: 0 },
  partialDiscoveryTitle: { color: '#93370D', fontSize: 12.5, fontWeight: '900' },
  partialDiscoveryCopy: { marginTop: 2, color: '#7A2E0E', fontSize: 11.5, lineHeight: 16 },
  partialDiscoveryRetry: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  placeList: { paddingHorizontal: 14, paddingBottom: 4, gap: 8 },
  placeRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 18, borderWidth: 1.5, borderColor: '#EAECF0', backgroundColor: '#FFFFFF' },
  placeRowSelected: { borderColor: '#2F80ED', backgroundColor: '#EFF8FF' },
  disabledPlaceRow: { opacity: 0.58 },
  placeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  placeName: { flexShrink: 1, color: '#101828', fontSize: 15, fontWeight: '900' },
  closestBadge: { color: '#067647', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.6, backgroundColor: '#ECFDF3', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  placeMeta: { marginTop: 2, color: '#475467', fontSize: 11.5, fontWeight: '700' },
  placeAddress: { marginTop: 1, color: '#98A2B3', fontSize: 10.5 },
  pickerFooter: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D0D5DD', backgroundColor: '#FFFFFF' },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  privacyCopy: { flex: 1, color: '#475467', fontSize: 11.5, lineHeight: 16 },
  attributionRow: { alignSelf: 'center', marginBottom: 11, paddingHorizontal: 8, paddingVertical: 3 },
  attributionText: { color: '#667085', fontSize: 10.5, textDecorationLine: 'underline' },
  usePlaceButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, backgroundColor: '#2F80ED' },
  usePlaceText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  privateEntryBar: { paddingHorizontal: 18, paddingTop: 1, paddingBottom: 8, backgroundColor: '#F8FAFC' },
  privateEntryButton: { minHeight: 59, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1.5, borderColor: '#D6BBFB', backgroundColor: '#F4EBFF' },
  privateEntryIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFFFFF' },
  privateEntryTitle: { color: '#53389E', fontSize: 13.5, fontWeight: '900' },
  privateEntryCopy: { marginTop: 1, color: '#6941C6', fontSize: 11.5, lineHeight: 15 },
  privateSetup: { paddingHorizontal: 18, paddingBottom: 24, gap: 13 },
  privateHero: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: '#F4EBFF' },
  privateHeroIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#FFFFFF' },
  privateTitle: { color: '#42307D', fontSize: 18, fontWeight: '900' },
  privateSubtitle: { marginTop: 2, color: '#6941C6', fontSize: 11.5, lineHeight: 16 },
  privateFieldLabel: { color: '#344054', fontSize: 12, fontWeight: '800' },
  privateChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  privateChoice: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: '#D0D5DD', backgroundColor: '#FFFFFF' },
  privateChoiceSelected: { borderColor: '#7F56D9', backgroundColor: '#F4EBFF' },
  privateChoiceText: { color: '#475467', fontSize: 12, fontWeight: '700' },
  privateChoiceTextSelected: { color: '#53389E' },
  privateInput: { minHeight: 46, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: '#D6BBFB', backgroundColor: '#FFFFFF', color: '#101828' },
  privatePrivacyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 15, backgroundColor: '#ECFDF3' },
  privatePrivacyCopy: { flex: 1, color: '#475467', fontSize: 11.5, lineHeight: 17 },
  privateError: { color: '#B42318', fontSize: 11.5, fontWeight: '700' },
  usePrivateButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, backgroundColor: '#6941C6' },
  externalBackRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 18, marginBottom: 5, paddingVertical: 2 },
  externalBackText: { color: '#175CD3', fontSize: 12.5, fontWeight: '800' },
  locationStatusRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  locationStatusCopy: { flex: 1, minWidth: 0, color: '#475467', fontSize: 12.5, fontWeight: '600' },
  locationReadyStatus: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5 },
  locationReadyText: { color: '#067647', fontSize: 11.5, fontWeight: '800' },
  locationCheckingText: { color: '#175CD3' },
  locationInfoButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  locationInfoCard: { marginTop: 5, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: '#EFF8FF', borderWidth: 1, borderColor: '#B2DDFF' },
  locationInfoCopy: { color: '#344054', fontSize: 11.5, lineHeight: 16 },
  nearbySectionHeading: { minHeight: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  nearbySectionTitle: { color: '#344054', fontSize: 14, fontWeight: '900' },
  knownVenueNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F2F4F7' },
  knownVenueNoticeCopy: { flex: 1, color: '#667085', fontSize: 11, lineHeight: 15 },
  somewhereElseButton: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 3, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1.3, borderColor: '#D0D5DD', backgroundColor: '#FFFFFF' },
  somewhereElseIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#EFF8FF' },
  somewhereElseTitle: { color: '#175CD3', fontSize: 13.5, fontWeight: '900' },
  somewhereElseCopy: { marginTop: 1, color: '#667085', fontSize: 11.5 },
  emptyPlacesCard: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EAECF0' },
  emptyPlacesCopy: { flex: 1, color: '#667085', fontSize: 12.5, lineHeight: 18 },
  inlineSearchState: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16, borderRadius: 16, backgroundColor: '#FFFFFF' },
  inlineSearchCopy: { color: '#475467', fontSize: 12.5, fontWeight: '700' },
  searchErrorCard: { alignItems: 'center', gap: 9, paddingHorizontal: 18, paddingVertical: 16, borderRadius: 16, backgroundColor: '#FFFAEB', borderWidth: 1, borderColor: '#FEDF89' },
  searchErrorCopy: { color: '#7A2E0E', fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  placeReadinessHint: { paddingTop: 4, color: '#667085', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.45 },
});
