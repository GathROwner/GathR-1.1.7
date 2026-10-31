import Ionicons from '@expo/vector-icons/Ionicons';
import { useOtaSafetyBlock } from '../../hooks/useOtaSafetyBlock';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Svg, { Circle } from 'react-native-svg';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../contexts/AuthContext';
import {
  createPrivateCheckInPlaceCandidate,
  SocialServiceError,
} from '../../services/socialService';
import { useMapStore } from '../../store';
import { useSocialStore } from '../../store/socialStore';
import type {
  NearbyCheckInPlaceCandidate,
} from '../../types/social';
import { SOCIAL_FEATURE_ENABLED, SOCIAL_RELEASE_TWO_ENABLED } from '../../types/social';
import {
  captureCheckInAttempt, clearCheckInAttempt, preparedCandidatesForArrival, preparedReadinessLevels,
  qualifiedArrivalForState, useCheckInReadinessStore,
} from '../../store/checkInReadinessStore';
import { requestCheckInPreparationRetry } from '../../services/checkInPreparation';
import { claimReadinessPrompt } from '../../services/checkInReadinessPreferences';
import { CHECK_IN_READINESS, mayPromptReadiness } from '../../utils/checkInReadiness';
import { presentedCheckInReadiness, UNVERIFIED_RING_PROGRESS_MAX } from '../../utils/checkInReadinessPresentation';
import { getBottomSystemInset } from '../../utils/systemInsets';



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
    // Rounded caps must leave a visible gap until server readiness and preparation succeed.
    const displayedProgress = ready ? 1 : Math.min(UNVERIFIED_RING_PROGRESS_MAX, Math.max(0, progress));
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
  state: ReturnType<typeof useCheckInReadinessStore.getState>
) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    setNowMs(Date.now());
    if (!state.appActive || !state.acceptedProgress || state.progressPaused || state.serviceError) return;
    const timer = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(timer);
  }, [state.appActive, state.acceptedProgress, state.progressPaused, state.serviceError]);
  return presentedCheckInReadiness(state, nowMs);
}

function messageForError(error: unknown) {
  return error instanceof SocialServiceError || error instanceof Error
    ? error.message
    : 'Nearby places could not be loaded right now.';
}

export default function ContextualCheckInControl({ enabled, rightOffset = 10, bottomOffset = 0 }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const windowSize = useWindowDimensions();
  const androidBottomInset = Platform.OS === 'android'
    ? getBottomSystemInset(Platform.OS, insets.bottom, windowSize)
    : 0;
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
  const [pickerVisible, setPickerVisible] = useState(false);
  const [externalSearchVisible, setExternalSearchVisible] = useState(false);
  const [knownNearbyPlaces, setKnownNearbyPlaces] = useState<VenueCandidate[]>([]);
  const [cachedNearbyPlaces, setNearbyPlaces] = useState<VenueCandidate[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [privateSetupVisible, setPrivateSetupVisible] = useState(false);
  const [privateLabelChoice, setPrivateLabelChoice] = useState<string>('Home');
  const [privateCustomLabel, setPrivateCustomLabel] = useState('');
  const [creatingPrivatePlace, setCreatingPrivatePlace] = useState(false);
  const [privatePlaceError, setPrivatePlaceError] = useState('');
  const [locationInfoVisible, setLocationInfoVisible] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  useOtaSafetyBlock(pickerVisible || externalSearchVisible || privateSetupVisible || creatingPrivatePlace
    || binding || locationInfoVisible);
  // Leases expire independently of a GPS update or network response.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
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

  const presentedReadiness = usePresentedReadiness(readiness);
  const levels = preparedReadinessLevels(readiness, nowMs);
  const arrival = qualifiedArrivalForState(readiness, nowMs);
  const hereEntryReady = levels.here;
  // Canonical venues remain usable if OpenStreetMap preparation fails. The outer
  // ring itself is complete only when both public lists have prepared successfully.
  const placeEntryReady = levels.publicVenues;
  const externalEntryReady = levels.external;
  const prep = readiness.preparation;
  const preparationMatches = prep.sessionId === arrival?.sessionId && prep.expiresAtMs > nowMs;
  const decoratePreparedCandidate = (place: NearbyCheckInPlaceCandidate): VenueCandidate => ({
    id: place.id, type: place.type, venueId: place.venueId,
    placeCandidateId: place.type === 'external_place' ? place.id : undefined,
    venueName: place.name, address: place.address, category: place.category,
    latitude: place.latitude, longitude: place.longitude, distanceMetres: place.distanceMetres,
    imageUrl: venues.find((venue) => venue.venueId === place.venueId)?.imageUrl || '',
  });
  // Ready and its candidate lists become visible in the same render. The cached
  // copy only retains the user's rows while an expired attempt prepares again.
  const knownPlaces = preparationMatches && prep.canonical.status === 'ready'
    ? preparedCandidatesForArrival(readiness, 'canonical', nowMs).map(decoratePreparedCandidate) : knownNearbyPlaces;
  const nearbyPlaces = preparationMatches && prep.external.status === 'ready'
    ? preparedCandidatesForArrival(readiness, 'external', nowMs).map(decoratePreparedCandidate) : cachedNearbyPlaces;
  const availableCanonicalCopy = placeEntryReady && knownPlaces.length > 0
    ? ' Your nearby GathR venues are still available.' : '';
  const knownVenuesLoading = preparationMatches && prep.canonical.status === 'loading';
  const knownVenuesNotice = preparationMatches && prep.canonical.status === 'error'
    ? prep.canonical.error || 'Nearby GathR venues could not be prepared. Try again.' : '';
  const discovering = preparationMatches && prep.external.status === 'loading';
  const confirmingReadiness = false;
  const discoveryError = !arrival
    ? 'Your prepared arrival expired or you left the area. Your choices are saved while check-in prepares again.'
    : preparationMatches && prep.external.status === 'error'
      ? `${prep.external.error || 'Other public places could not be prepared.'}${availableCanonicalCopy}` : '';
  const partialDiscoveryNotice = '';
  visibleRef.current = enabled && isFocused && readiness.appActive && !pickerVisible && !checkInRouteOpeningRef.current;
  const candidate = knownPlaces.length === 1 && knownPlaces[0].distanceMetres <= 25 && placeEntryReady ? knownPlaces[0] : null;
  const showBubble = useCallback((message: string, automatic = false) => {
    autoBubbleRef.current = automatic;
    setBubble(message);
  }, []);
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
    setPrivateSetupVisible(false);
    setLocationInfoVisible(false);
    setSelectionError('');
  }, [enabled, isFocused, readiness.restorePickerOnReturn, user]);
  useEffect(() => {
    const now = Date.now();
    if (!ownCheckIn && readiness.uid === user?.uid && readiness.preferencesLoaded
      && mayPromptReadiness(readiness.evidence, now, readiness.lastPromptAtMs,
        enabled && isFocused && readiness.appActive && !pickerVisible && !checkInRouteOpeningRef.current, levels.place)) {
      void claimReadinessPrompt(now).then((claimed) => {
        const current = useCheckInReadinessStore.getState();
        if (claimed && mountedRef.current && visibleRef.current && current.uid === user?.uid && current.appActive
          && preparedReadinessLevels(current, Date.now()).place) {
          showBubble(candidate ? `You can check in at ${candidate.venueName}` : 'You can check in here.', true);
        }
      });
    }
  }, [candidate, enabled, isFocused, levels.place, ownCheckIn, pickerVisible, readiness, showBubble, user?.uid]);
  // Hydrate from work completed during the countdown. Never erase an explicit
  // choice merely because a raw GPS receipt expires or the app is interrupted.
  useEffect(() => {
    const currentArrival = qualifiedArrivalForState(readiness, Date.now());
    if (!currentArrival || prep.sessionId !== currentArrival.sessionId || prep.expiresAtMs <= Date.now()) return;
    const decorate = (place: NearbyCheckInPlaceCandidate): VenueCandidate => ({
      id: place.id, type: place.type, venueId: place.venueId,
      placeCandidateId: place.type === 'external_place' ? place.id : undefined,
      venueName: place.name, address: place.address, category: place.category,
      latitude: place.latitude, longitude: place.longitude, distanceMetres: place.distanceMetres,
      imageUrl: venues.find((venue) => venue.venueId === place.venueId)?.imageUrl || '',
    });
    if (prep.canonical.status === 'ready') setKnownNearbyPlaces(preparedCandidatesForArrival(readiness, 'canonical').map(decorate));
    if (prep.external.status === 'ready') setNearbyPlaces(preparedCandidatesForArrival(readiness, 'external').map(decorate));
  }, [prep, readiness, venues]);

  if (!enabled || !SOCIAL_FEATURE_ENABLED || !SOCIAL_RELEASE_TWO_ENABLED || !user) return null;

  const openCheckInPicker = () => {
    const capture = captureCheckInAttempt(user.uid, false);
    if (!capture) {
      showBubble('Your check-in is preparing. The ring completes when your location has been verified.');
      return;
    }
    flowGenerationRef.current += 1;
    setBubble('');
    setPickerVisible(true);
    setExternalSearchVisible(false);
    setPrivateSetupVisible(false);
    setSelectionError('');
    // Preserve a previous explicit choice; otherwise select the closest prepared row.
    setSelectedPlaceId((current) => knownPlaces.some((place) => place.id === current)
      ? current : closestNearbyPlaceId(knownPlaces));
  };

  const searchSomewhereElse = () => {
    setExternalSearchVisible(true);
    setSelectionError('');
    setSelectedPlaceId((current) => nearbyPlaces.some((place) => place.id === current)
      ? current : closestNearbyPlaceId(nearbyPlaces));
  };

  const choosePlace = async (place: VenueCandidate | null) => {
    if (!place || bindingRef.current || checkInRouteOpeningRef.current) return;
    const requirePlace = place.type !== 'private_place';
    const capture = captureCheckInAttempt(user.uid, requirePlace);
    const report = (message: string) => place.type === 'private_place' ? setPrivatePlaceError(message) : setSelectionError(message);
    const prepared = preparedReadinessLevels(useCheckInReadinessStore.getState());
    if (!capture || (place.type === 'external_place' && !prepared.external)
      || (place.type === 'gathr_venue' && !prepared.publicVenues)) {
      report('Your prepared arrival expired or you left the area. Your choices are saved while check-in prepares again.');
      return;
    }
    bindingRef.current = true;
    setBinding(true);
    try {
      checkInRouteOpeningRef.current = true;
      visibleRef.current = false;
      setPickerVisible(false);
      setPrivateSetupVisible(false);
      setExternalSearchVisible(false);
      setLocationInfoVisible(false);
      setBubble('');
      autoBubbleRef.current = false;
      const route = buildNearbyCheckInRoute(place, capture.sessionId, knownPlaces);
      router.push({ ...route, params: { ...route.params, readinessVersion: '1',
        ...(place.type === 'gathr_venue' ? { placeType: 'gathr_venue', placeName: place.venueName, placeAddress: place.address } : {}),
      } });
      void Haptics.selectionAsync().catch(() => undefined);
    } catch (error) {
      checkInRouteOpeningRef.current = false;
      setPickerVisible(true);
      report(messageForError(error));
    } finally {
      bindingRef.current = false;
      setBinding(false);
    }
  };

  const selectedPlace = (externalSearchVisible ? nearbyPlaces : knownPlaces)
    .find((place) => place.id === selectedPlaceId) || null;
  const returnToKnownPlaces = () => {
    setExternalSearchVisible(false);
    setLocationInfoVisible(false);
    setSelectedPlaceId(closestNearbyPlaceId(knownPlaces));
  };
  const refreshCurrentPlaces = () => {
    requestCheckInPreparationRetry(externalSearchVisible ? 'external' : 'canonical');
    setSelectionError('');
  };
  const openPrivateSetup = () => {
    setPrivatePlaceError('');
    setPrivateSetupVisible(true);
  };

  const createPrivatePlace = async () => {
    if (privateCreationRef.current || bindingRef.current) return;
    const capture = captureCheckInAttempt(user.uid, false);
    if (!capture) {
      setPrivatePlaceError('Your prepared arrival expired or you left the area. Your label is saved while check-in prepares again.');
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
      const result = await createPrivateCheckInPlaceCandidate({
        label,
        readinessSessionId: capture.sessionId,
        latitude: capture.latitude,
        longitude: capture.longitude,
        accuracyMeters: capture.accuracyMeters,
        capturedAtMs: capture.capturedAtMs,
      });
      const after = qualifiedArrivalForState(useCheckInReadinessStore.getState());
      if (!after || after.sessionId !== capture.sessionId) {
        throw new Error('Your prepared arrival is no longer available. Your label is saved while check-in prepares again.');
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
  const closePicker = () => { flowGenerationRef.current += 1; clearCheckInAttempt(); setPickerVisible(false); };

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
          ? 'Your arrival has been verified. Tap the checkmark to choose.'
        : readiness.serviceError
          ? 'Check-in verification is unavailable right now. You can keep browsing.'
          : !readiness.acceptedProgress ? 'Verifying your location before the rings begin. You can keep browsing.' : defaultReadinessCopy;
  const hereProgress = hereEntryReady ? 1 : Math.min(UNVERIFIED_RING_PROGRESS_MAX, presentedReadiness.hereMs / CHECK_IN_READINESS.hereMs);
  const placeProgress = levels.place ? 1 : Math.min(UNVERIFIED_RING_PROGRESS_MAX, presentedReadiness.placeMs / CHECK_IN_READINESS.placeMs);
  const explanation = autoBubbleRef.current && levels.place ? bubble : hereEntryReady
    ? levels.place ? 'Your location and nearby places are ready. Tap the checkmark to choose.'
      : placeEntryReady && knownPlaces.length > 0 ? 'GathR venues and private check-in are ready. Other public places are still preparing.'
        : 'Private check-in is ready. Nearby public places are preparing while the blue ring fills.'
    : earlyCopy;
  const preparationFailure = prep.canonical.status === 'error' ? prep.canonical.error
    : prep.external.status === 'error' ? prep.external.error : '';
  const readinessNotice = preparationFailure || (explanation === defaultReadinessCopy ? '' : explanation);
  const waitingStatus = (required: number) => readiness.serviceError || (required === CHECK_IN_READINESS.placeMs && preparationFailure)
    ? 'Unavailable' : !readiness.acceptedProgress || readiness.progressPaused ? 'Verifying' : '';
  const ringStatus = (ready: boolean, elapsed: number, required: number) => ready ? 'Ready'
    : waitingStatus(required) || (elapsed >= required ? 'Preparing' : `${Math.floor(elapsed / 1000)}/${required / 1000}s`);
  const progressCopy = (ready: boolean, elapsed: number, required: number) => ready ? 'Ready'
    : waitingStatus(required) || (elapsed >= required ? 'Preparing' : `${Math.floor(elapsed / 1000)} / ${required / 1000} sec`);
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
                {progressCopy(levels.place, presentedReadiness.placeMs, CHECK_IN_READINESS.placeMs)}
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
        : `${hereEntryReady ? 'Check-in ready' : 'Check-in readiness'}. Here ${ringStatus(hereEntryReady, presentedReadiness.hereMs, CHECK_IN_READINESS.hereMs)}. Place ${ringStatus(levels.place, presentedReadiness.placeMs, CHECK_IN_READINESS.placeMs)}.`}
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
        here={hereProgress} place={placeProgress} hereReady={hereEntryReady} placeReady={levels.place}>
        {hereEntryReady ? <View testID="check-in-ready-mark" style={[styles.readyMark, levels.place && styles.placeReadyMark]}>
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
          <View accessibilityViewIsModal style={[styles.pickerCard, { paddingBottom: androidBottomInset }]}>
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
                      <Text style={styles.locationStatusCopy}>Your arrival</Text>
                      <View style={styles.locationReadyStatus}>
                        {externalEntryReady
                          ? <Ionicons name="checkmark-circle" size={16} color="#039855" />
                          : discoveryError ? <Ionicons name="alert-circle-outline" size={16} color="#B54708" />
                            : <ActivityIndicator testID="public-place-status-spinner" size="small" color="#2F80ED" />}
                        <Text testID="public-place-location-status" style={[styles.locationReadyText, !externalEntryReady && styles.locationCheckingText]}>
                          {externalEntryReady ? 'Ready' : discoveryError ? 'Unavailable' : 'Preparing'}
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
                          GathR prepared these places while your ring filled. Your qualified arrival is held briefly for this check-in; you still choose who can see it before confirming.
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
                        : hereEntryReady ? 'Private check-in is ready. Nearby public places are preparing.'
                          : 'Your choices are saved while check-in prepares again.'}
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
                <TouchableOpacity accessibilityRole="button" onPress={openPrivateSetup} disabled={!hereEntryReady} style={styles.privateEntryButton} testID="private-place-entry">
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
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.privateSetupScroll} contentContainerStyle={styles.privateSetup}>
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
              </ScrollView>
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
                          {arrival && (
                            <TouchableOpacity accessibilityRole="button" onPress={() => requestCheckInPreparationRetry('external')} testID="retry-nearby-public-places" style={styles.retryButton}>
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
                            accessibilityState={{ selected, disabled: !externalEntryReady }}
                            disabled={!externalEntryReady}
                            key={place.id}
                            onPress={() => { setSelectedPlaceId(place.id); setSelectionError(''); }}
                            style={[styles.placeRow, selected && styles.placeRowSelected, !externalEntryReady && styles.disabledPlaceRow]}
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
                          <Text style={styles.emptyPlacesCopy}>No other public places showed up nearby.{availableCanonicalCopy}</Text>
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
                          <TouchableOpacity accessibilityRole="button" testID="retry-nearby-gathr-venues" onPress={() => requestCheckInPreparationRetry('canonical')}>
                            <Text style={styles.retryText}>Try again</Text>
                          </TouchableOpacity>
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
                      {!knownPlaces.length && preparationMatches && prep.canonical.status === 'ready' && (
                        <View style={styles.emptyPlacesCard}>
                          <Ionicons name="business-outline" size={22} color="#667085" />
                          <Text style={styles.emptyPlacesCopy}>No known GathR venues are close by.</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !externalEntryReady && !discoveryError }}
                        disabled={!externalEntryReady && !discoveryError}
                        onPress={() => void searchSomewhereElse()}
                        style={[styles.somewhereElseButton, (!externalEntryReady && !discoveryError) && styles.disabledPlaceRow]}
                        testID="find-somewhere-else"
                      >
                        <View style={styles.somewhereElseIcon}><Ionicons name="search-outline" size={20} color="#175CD3" /></View>
                        <View style={styles.copy}>
                          <Text style={styles.somewhereElseTitle}>Somewhere else</Text>
                          <Text style={styles.somewhereElseCopy}>{externalEntryReady ? 'Nearby places are ready' : discoveryError ? 'Could not prepare places — try again' : 'Preparing nearby places'}</Text>
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
                      : hereEntryReady ? preparationFailure ? 'Private check-in is ready. Public place lookup is unavailable.' : 'Private check-in is ready. Public places are preparing.'
                        : 'Your choices are saved. Check-in verification needs to prepare again.'}</Text>
                  </View>
                  {externalSearchVisible && (
                    <TouchableOpacity
                      accessibilityRole="link"
                      onPress={() => void Linking.openURL('https://gathr-migrated.web.app/open-data/osm/pei/index.html')}
                      style={styles.attributionRow}
                    >
                      <Text style={styles.attributionText}>© OpenStreetMap contributors · PEI data &amp; licence</Text>
                    </TouchableOpacity>
                  )}
                  {(externalSearchVisible ? externalEntryReady : placeEntryReady) ? (
                    <TouchableOpacity testID="continue-public-check-in" accessibilityRole="button" disabled={!selectedPlace || binding} onPress={() => void choosePlace(selectedPlace)} style={[styles.usePlaceButton, (!selectedPlace || binding) && styles.disabled]}>
                      <Text style={styles.usePlaceText}>{binding ? 'Confirming location…' : selectionError ? 'Try this place again' : 'Continue to privacy'}</Text>
                      <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                    </TouchableOpacity>
                  ) : (
                    !discoveryError && <Text style={styles.placeReadinessHint}>{arrival ? preparationFailure || 'Preparing nearby public places.' : 'Your choices are saved while check-in prepares again.'}</Text>
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
  privateSetupScroll: { flexGrow: 0, flexShrink: 1 },
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
