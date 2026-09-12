import { Ionicons } from '@expo/vector-icons';
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
  bindCheckInReadiness,
  createSocialOperationId,
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
import { advanceReadiness, CHECK_IN_READINESS, mayPromptReadiness, projectedReadinessMs } from '../../utils/checkInReadiness';
import { readinessLevels, validBoundReadiness } from '../../utils/checkInReadinessContract';

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
  eligibilitySessionId: string,
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
        eligibilitySessionId,
      },
    };
  }
  return {
    pathname: '/check-in' as const,
    params: {
      venueId: venue.venueId,
      eligibilitySessionId,
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

export function ReadinessRings({ here, place, children }: { here: number; place: number; children: React.ReactNode }) {
  const ring = (radius: number, progress: number, color: string) => {
    const circumference = 2 * Math.PI * radius;
    return <React.Fragment key={radius}>
      <Circle cx={24} cy={24} r={radius} stroke={color} strokeOpacity={0.16} strokeWidth={3.5} fill="none" />
      {progress > 0 && <Circle cx={24} cy={24} r={radius} stroke={color} strokeWidth={3.5} fill="none"
        strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, progress)))} rotation={-90} origin="24, 24" />}
    </React.Fragment>;
  };
  return <View style={styles.rings} pointerEvents="none">
    <Svg width={48} height={48} style={StyleSheet.absoluteFill}>
      {ring(21.5, place, '#2F80ED')}{ring(16, here, '#8B5CF6')}
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

export default function ContextualCheckInControl({ enabled }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const allEvents = useMapStore((state) => state.allEvents);
  const ownCheckIn = useSocialStore((state) => state.ownCheckIn);
  const readiness = useCheckInReadinessStore();
  const [bubble, setBubble] = useState('');
  const [binding, setBinding] = useState(false);
  const bindingRef = useRef(false);
  const bindOperationRef = useRef<{ key: string; operationId: string } | null>(null);
  const privateCreationRef = useRef(false);
  const flowGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoBubbleRef = useRef(false);
  const visibleRef = useRef(false);




  const [pickerVisible, setPickerVisible] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState('');
  const [nearbyPlaces, setNearbyPlaces] = useState<VenueCandidate[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState('');
  const [privateSetupVisible, setPrivateSetupVisible] = useState(false);
  const [privateLabelChoice, setPrivateLabelChoice] = useState<string>('Home');
  const [privateCustomLabel, setPrivateCustomLabel] = useState('');
  const [creatingPrivatePlace, setCreatingPrivatePlace] = useState(false);
  const [privatePlaceError, setPrivatePlaceError] = useState('');
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
  // The rings may finish visually while the app is interrupted, but readiness is
  // never actionable until a fresh return fix has validated the original anchor.
  const levels = readiness.interruptedAtMs === null ? recordedLevels : { here: false, place: false };
  visibleRef.current = enabled && readiness.appActive && !pickerVisible;
  const nearby = readiness.evidence.previous
    ? findCandidates(venues, { coords: {
      ...readiness.evidence.previous, accuracy: readiness.evidence.previous.accuracyMeters,
    } } as unknown as Location.LocationObject) : [];
  // GPS cannot identify one business among overlapping venues. Keep the generic icon when ambiguous.
  const candidate = nearby.length === 1 && nearby[0].distanceMetres <= 25 && levels.place ? nearby[0] : null;
  const showBubble = useCallback((message: string, automatic = false) => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    autoBubbleRef.current = automatic;
    setBubble(message);
    bubbleTimer.current = setTimeout(() => setBubble(''), 8_000);
  }, []);
  useEffect(() => {
    if (!readiness.appActive || (autoBubbleRef.current && (!levels.place || !enabled || pickerVisible))) setBubble('');
  }, [enabled, levels.place, pickerVisible, readiness.appActive]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; if (bubbleTimer.current) clearTimeout(bubbleTimer.current); };
  }, []);
  useEffect(() => {
    const now = Date.now();
    if (!ownCheckIn && readiness.uid === user?.uid && readiness.preferencesLoaded
      && mayPromptReadiness(readiness.evidence, now, readiness.lastPromptAtMs,
        enabled && readiness.appActive && !pickerVisible, levels.place)) {
      void claimReadinessPrompt(now).then((claimed) => {
        const current = useCheckInReadinessStore.getState();
        if (claimed && mountedRef.current && visibleRef.current && current.uid === user?.uid && current.appActive
          && current.interruptedAtMs === null
          && readinessLevels(current.evidence, current.receipt, current.sessionId, Date.now()).place) {
          showBubble(candidate ? `You can check in at ${candidate.venueName}` : 'You can check in here.', true);
        }
      });
    }
  }, [candidate, enabled, levels.place, ownCheckIn, pickerVisible, readiness, showBubble, user?.uid]);

  if (!enabled || !SOCIAL_FEATURE_ENABLED || !SOCIAL_RELEASE_TWO_ENABLED || !user) return null;

  const choosePlace = async (place: VenueCandidate | null) => {
    if (!place || bindingRef.current) return;
    const initial = useCheckInReadinessStore.getState();
    const initialLevels = readinessLevels(initial.evidence, initial.receipt, initial.sessionId, Date.now());
    const report = (message: string) => place.type === 'private_place' ? setPrivatePlaceError(message) : setDiscoveryError(message);
    if (initial.uid !== user.uid || !initial.appActive || initial.interruptedAtMs !== null
      || (place.type === 'private_place' ? !initialLevels.here : !initialLevels.place)) {
      report('Readiness changed. Return to the map; the rings will update as your location settles.');
      return;
    }
    bindingRef.current = true;
    const flowGeneration = flowGenerationRef.current;
    const operationKey = `${initial.sessionId}:${place.type}:${place.venueId || place.placeCandidateId}`;
    if (bindOperationRef.current?.key !== operationKey) bindOperationRef.current = { key: operationKey, operationId: createSocialOperationId() };
    const operationId = bindOperationRef.current.operationId;
    setBinding(true);
    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const sample = { latitude: location.coords.latitude, longitude: location.coords.longitude,
        accuracyMeters: location.coords.accuracy, speedMetersPerSecond: location.coords.speed, capturedAtMs: location.timestamp };
      const current = useCheckInReadinessStore.getState();
      const fresh = advanceReadiness(current.evidence, sample, Date.now());
      if (!mountedRef.current || flowGenerationRef.current !== flowGeneration) return;
      const freshLevels = readinessLevels(fresh, current.receipt, current.sessionId, Date.now());
      if (current.uid !== user.uid || !current.appActive || current.interruptedAtMs !== null
        || current.sessionId !== initial.sessionId
        || fresh.revision !== current.evidence.revision || (place.type === 'private_place' ? !freshLevels.here : !freshLevels.place)) {
        if (current.uid === user.uid) useCheckInReadinessStore.setState({ evidence: fresh, receipt: null, sessionId: '' });
        throw new Error('Readiness changed. Return to the map to check your location.');
      }
      const grant = await bindCheckInReadiness({ protocolVersion: 1, readinessSessionId: current.sessionId,
        operationId,
        ...(place.type === 'gathr_venue' ? { venueId: place.venueId } : { placeCandidateId: place.placeCandidateId }), ...sample });
      const after = useCheckInReadinessStore.getState();
      if (!mountedRef.current || flowGenerationRef.current !== flowGeneration || after.uid !== user.uid
        || !after.appActive || after.interruptedAtMs !== null || after.sessionId !== initial.sessionId) return;
      if (!validBoundReadiness(grant, place, current.sessionId, Date.now()) || (grant.exactPrivateAllowed && !freshLevels.place)) {
        throw new Error('Check-in verification is unavailable. Please try again from the map.');
      }
      useCheckInReadinessStore.setState({ grant });
      setPickerVisible(false);
      setPrivateSetupVisible(false);
      const route = buildNearbyCheckInRoute(place, grant.eligibilitySessionId, [place]);
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

  const loadNearbyPlaces = async () => {
    flowGenerationRef.current += 1;
    const flowGeneration = flowGenerationRef.current;
    setBubble('');
    setPickerVisible(true);
    setPrivateSetupVisible(false);
    setDiscovering(true);
    setDiscoveryError('');
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setDiscoveryError('Allow precise location to see public places immediately around you.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const accuracyMeters = location.coords.accuracy;
      if (accuracyMeters === null || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > CHECK_IN_READINESS.hereAccuracyMetres) {
        setDiscoveryError('Your location is not precise enough yet. Step outdoors or wait a moment, then retry.');
        return;
      }
      const result = await discoverNearbyCheckInPlaces({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracyMeters,
        capturedAtMs: location.timestamp,
      });
      if (!mountedRef.current || flowGenerationRef.current !== flowGeneration) return;
      const decorated = result.candidates.map((place: NearbyCheckInPlaceCandidate): VenueCandidate => {
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
      }).sort((first, second) => first.distanceMetres - second.distanceMetres);
      setNearbyPlaces(decorated);
      setSelectedPlaceId(closestNearbyPlaceId(decorated));
      if (decorated.length === 0) {
        setDiscoveryError('No eligible public places were found close enough to your current location.');
      }
    } catch (error) {
      setDiscoveryError(messageForError(error));
    } finally {
      setDiscovering(false);
    }
  };

  const selectedPlace = nearbyPlaces.find((place) => place.id === selectedPlaceId) || null;
  const openPrivateSetup = () => {
    setPrivatePlaceError('');
    setPrivateSetupVisible(true);
  };

  const createPrivatePlace = async () => {
    if (privateCreationRef.current || bindingRef.current) return;
    const current = useCheckInReadinessStore.getState();
    if (current.uid !== user.uid || !current.appActive || current.interruptedAtMs !== null
      || !readinessLevels(current.evidence, current.receipt, current.sessionId, Date.now()).here) {
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
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setPrivatePlaceError('Allow precise location to verify that you remain at this private place.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const accuracyMeters = location.coords.accuracy;
      if (accuracyMeters === null || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > CHECK_IN_READINESS.hereAccuracyMetres) {
        setPrivatePlaceError('Your location is not precise enough yet. Wait a moment, then retry.');
        return;
      }
      const result = await createPrivateCheckInPlaceCandidate({
        label,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracyMeters,
        capturedAtMs: location.timestamp,
      });
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

  const earlyCopy = readiness.mode === 'basic' || !readiness.foregroundGranted
    ? 'Browse without location. Enable While Using GathR to prepare a nearby check-in.'
    : readiness.evidence.reason === 'driving'
      ? 'Check-in readiness is paused after driving. It will resume once you have settled.'
      : readiness.evidence.reason === 'moving'
        ? 'The rings reset when you move. They build once your location settles.'
        : readiness.evidence.reason === 'low_accuracy' || readiness.evidence.reason === 'stale'
          ? 'Waiting for fresh, accurate location fixes. You can keep browsing while the rings prepare.'
        : readiness.serviceError
          ? 'Check-in verification is unavailable right now. You can keep browsing.'
          : 'Here prepares an approximate private check-in. Place prepares a public place or optional exact pin. Nothing is shared.';
  const hereProgress = presentedReadiness.hereMs / CHECK_IN_READINESS.hereMs;
  const placeProgress = presentedReadiness.placeMs / CHECK_IN_READINESS.placeMs;
  const control = <>
    {!!bubble && <View style={styles.bubble} testID="check-in-readiness-explanation" accessibilityLiveRegion="polite">
      <View style={styles.bubbleHeading}>
        <Text style={styles.bubbleCopy}>{bubble}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss check-in hint"
          onPress={() => setBubble('')} style={styles.bubbleClose}><Ionicons name="close" size={19} color="#475467" /></TouchableOpacity>
      </View>
      <View style={styles.legend}>
        <Text style={styles.hereLegend}>Here · {Math.floor(presentedReadiness.hereMs / 1000)}/30s</Text>
        <Text style={styles.placeLegend}>Place · {Math.floor(presentedReadiness.placeMs / 1000)}/90s</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" onPress={() => { setBubble(''); router.push('/check-in-settings'); }} style={styles.settingsLink}>
        <Text style={styles.settingsText}>Location &amp; arrival reminders</Text>
      </TouchableOpacity>
    </View>}
    <TouchableOpacity accessibilityRole="button" activeOpacity={0.85}
      accessibilityLabel={ownCheckIn ? `Manage active check-in at ${ownCheckIn.venueNameSnapshot}`
        : `${levels.here ? 'Check-in ready' : 'Check-in readiness'}. Here ${Math.floor(hereProgress * 100)} percent. Place ${Math.floor(placeProgress * 100)} percent.`}
      onPress={() => {
        if (ownCheckIn) router.push('/check-in');
        else if (levels.here && readiness.uid === user.uid) void loadNearbyPlaces();
        else showBubble(earlyCopy);
      }}
      style={[styles.control, (levels.here || !!ownCheckIn) && styles.readyControl]}
      testID={ownCheckIn ? 'contextual-check-in-active' : levels.here ? 'contextual-check-in-ready' : 'contextual-check-in-idle'}>
      {ownCheckIn ? <Ionicons name="checkmark-circle" size={26} color="#175CD3" /> : <ReadinessRings here={hereProgress} place={placeProgress}>
        {candidate ? <View style={styles.smallAvatar}><VenueAvatar venue={candidate} /></View>
          : <Ionicons name="location-outline" size={21} color={levels.here ? '#175CD3' : '#667085'} />}
      </ReadinessRings>}
      {!ownCheckIn && levels.here && <View style={styles.readyBadge}><Ionicons name="checkmark" color="#FFFFFF" size={10} /></View>}
    </TouchableOpacity>
  </>;

  return (
    <>
      {control}
      <Modal animationType="slide" onRequestClose={closePicker} transparent visible={pickerVisible}>
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.pickerCard}>
            <View style={styles.dragHandle} />
            <View style={styles.pickerHeader}>
              <View style={styles.copy}>
                <Text style={styles.pickerEyebrow}>CHECK IN</Text>
                <Text style={styles.pickerTitle}>Where are you?</Text>
                <Text style={styles.pickerSubtitle}>
                  {privateSetupVisible
                    ? 'Use a private label. Never enter a home address.'
                    : 'Choose a public place close to your phone.'}
                </Text>
              </View>
              <TouchableOpacity accessibilityLabel="Close nearby places" onPress={closePicker} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#344054" />
              </TouchableOpacity>
            </View>

            {privateSetupVisible ? (
              <View style={styles.privateSetup}>
                <TouchableOpacity accessibilityRole="button" onPress={() => setPrivateSetupVisible(false)} style={styles.privateBackRow}>
                  <Ionicons name="arrow-back" size={18} color="#175CD3" />
                  <Text style={styles.privateBackText}>Nearby public places</Text>
                </TouchableOpacity>
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
                  <Text style={styles.privatePrivacyCopy}>By default, friends see only a neighbourhood-sized approximate area. On the next screen, an exact pin can be shared only with friends you explicitly select.</Text>
                </View>
                {!!privatePlaceError && <Text style={styles.privateError}>{privatePlaceError}</Text>}
                <TouchableOpacity
                  accessibilityRole="button"
                  testID="continue-private-check-in"
                  disabled={creatingPrivatePlace || binding || !levels.here}
                  onPress={() => void createPrivatePlace()}
                  style={[styles.usePrivateButton, (creatingPrivatePlace || binding || !levels.here) && styles.disabled]}
                >
                  {creatingPrivatePlace
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <><Text style={styles.usePlaceText}>Continue to privacy</Text><Ionicons name="arrow-forward" size={19} color="#FFFFFF" /></>}
                </TouchableOpacity>
              </View>
            ) : discovering ? (
              <View style={styles.pickerState}>
                <ActivityIndicator color="#2F80ED" />
                <Text style={styles.pickerStateTitle}>Finding nearby places…</Text>
                <Text style={styles.pickerStateCopy}>Your location finds nearby options. Nothing is shared with friends.</Text>
              </View>
            ) : discoveryError ? (
              <View style={styles.pickerState}>
                <View style={styles.stateIcon}><Ionicons name="location-outline" size={24} color="#B54708" /></View>
                <Text style={styles.pickerStateTitle}>{discoveryError}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => void loadNearbyPlaces()} style={styles.retryButton}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <ScrollView contentContainerStyle={styles.placeList} showsVerticalScrollIndicator={false}>
                  {nearbyPlaces.map((place, index) => {
                    const selected = place.id === selectedPlaceId;
                    return (
                      <TouchableOpacity
                        accessibilityLabel={`${place.venueName}, ${place.distanceMetres} metres away`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        key={place.id}
                        onPress={() => setSelectedPlaceId(place.id)}
                        style={[styles.placeRow, selected && styles.placeRowSelected]}
                      >
                        <VenueAvatar venue={place} />
                        <View style={styles.copy}>
                          <View style={styles.placeNameRow}>
                            <Text numberOfLines={1} style={styles.placeName}>{place.venueName}</Text>
                            {index === 0 && <Text style={styles.closestBadge}>CLOSEST</Text>}
                          </View>
                          <Text numberOfLines={1} style={styles.placeMeta}>
                            {place.distanceMetres} m · {place.type === 'gathr_venue' ? 'GathR venue' : place.category}
                          </Text>
                          <Text numberOfLines={1} style={styles.placeAddress}>{place.address}</Text>
                        </View>
                        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={selected ? '#2F80ED' : '#98A2B3'} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <View style={styles.pickerFooter}>
                  <View style={styles.privacyRow}>
                    <Ionicons name="shield-checkmark-outline" size={18} color="#0F766E" />
                    <Text style={styles.privacyCopy}>{levels.place ? 'Choose who can see your check-in next. Nothing is shared yet.' : 'Public places need the blue Place ring. An approximate private check-in is ready now.'}</Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
                    style={styles.attributionRow}
                  >
                    <Text style={styles.attributionText}>Place data © OpenStreetMap contributors</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID="continue-public-check-in" accessibilityRole="button" disabled={!selectedPlace || binding || !levels.place} onPress={() => void choosePlace(selectedPlace)} style={[styles.usePlaceButton, (!selectedPlace || binding || !levels.place) && styles.disabled]}>
                    <Text style={styles.usePlaceText}>{binding ? 'Preparing privacy options…' : 'Continue to privacy'}</Text>
                    <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </>
            )}
            {!privateSetupVisible && (
              <View style={styles.privateEntryBar}>
                <TouchableOpacity accessibilityRole="button" onPress={openPrivateSetup} style={styles.privateEntryButton} testID="private-place-entry">
                  <View style={styles.privateEntryIcon}><Ionicons name="home-outline" size={20} color="#6941C6" /></View>
                  <View style={styles.copy}>
                    <Text style={styles.privateEntryTitle}>Check in at a private place</Text>
                    <Text style={styles.privateEntryCopy}>Home or somewhere that should not become a public venue</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#6941C6" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  control: {
    position: 'absolute', right: 4, bottom: 20, width: 48, height: 48,
    alignItems: 'center', justifyContent: 'center', borderRadius: 24,
    backgroundColor: '#FFFFFF', shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.16, shadowRadius: 5,
    elevation: 6, zIndex: 32,
  },
  readyControl: { backgroundColor: '#F0F7FF' },
  rings: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  smallAvatar: { transform: [{ scale: 0.62 }] },
  readyBadge: { position: 'absolute', bottom: -1, right: -1, borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#175CD3', borderWidth: 2, borderColor: '#FFFFFF' },
  bubble: { position: 'absolute', right: 60, bottom: 20, width: 254, maxWidth: '76%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, elevation: 7, zIndex: 33, shadowColor: '#101828', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  bubbleHeading: { flexDirection: 'row', alignItems: 'flex-start' },
  bubbleCopy: { flex: 1, color: '#344054', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  bubbleClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8, marginTop: -8 },
  legend: { flexDirection: 'row', gap: 12, marginTop: 8 },
  hereLegend: { color: '#6941C6', fontSize: 12, fontWeight: '700' },
  placeLegend: { color: '#175CD3', fontSize: 12, fontWeight: '700' },
  settingsLink: { minHeight: 44, justifyContent: 'center' },
  settingsText: { color: '#175CD3', fontSize: 12, fontWeight: '700' },
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
  dragHandle: { alignSelf: 'center', width: 42, height: 5, marginTop: 10, borderRadius: 3, backgroundColor: '#D0D5DD' },
  pickerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 15, paddingBottom: 13 },
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
  placeList: { paddingHorizontal: 14, paddingBottom: 4, gap: 8 },
  placeRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 18, borderWidth: 1.5, borderColor: '#EAECF0', backgroundColor: '#FFFFFF' },
  placeRowSelected: { borderColor: '#2F80ED', backgroundColor: '#EFF8FF' },
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
  privateEntryBar: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D0D5DD', backgroundColor: '#F8FAFC' },
  privateEntryButton: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 18, borderWidth: 1.5, borderColor: '#D6BBFB', backgroundColor: '#F4EBFF' },
  privateEntryIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#FFFFFF' },
  privateEntryTitle: { color: '#53389E', fontSize: 14, fontWeight: '900' },
  privateEntryCopy: { marginTop: 2, color: '#6941C6', fontSize: 10.5, lineHeight: 14 },
  privateSetup: { paddingHorizontal: 18, paddingBottom: 24, gap: 13 },
  privateBackRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  privateBackText: { color: '#175CD3', fontSize: 12.5, fontWeight: '800' },
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
  disabled: { opacity: 0.45 },
});
