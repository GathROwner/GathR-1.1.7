import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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
  recordCheckInEligibilitySample,
  SocialServiceError,
} from '../../services/socialService';
import { useMapStore } from '../../store';
import { useSocialStore } from '../../store/socialStore';
import type {
  CheckInEligibilityResult,
  NearbyCheckInPlaceCandidate,
} from '../../types/social';
import { SOCIAL_FEATURE_ENABLED, SOCIAL_RELEASE_TWO_ENABLED } from '../../types/social';

const MAX_ACCURACY_METRES = 75;
const BASE_RADIUS_METRES = 50;
const SAMPLE_INTERVAL_MS = 10_000;

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

function createSessionId() {
  return `dwell-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

function targetKey(candidate: Pick<VenueCandidate, 'venueId' | 'placeCandidateId'>) {
  return candidate.venueId
    ? `venue:${candidate.venueId}`
    : `external:${candidate.placeCandidateId || ''}`;
}

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
  const [candidate, setCandidate] = useState<VenueCandidate | null>(null);
  const [eligibility, setEligibility] = useState<CheckInEligibilityResult | null>(null);
  const [sampling, setSampling] = useState(false);
  const [sampleError, setSampleError] = useState(false);
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
  const [sampleRevision, setSampleRevision] = useState(0);
  const sessionRef = useRef<{
    targetKey: string;
    sessionId: string;
    venueId?: string;
    placeCandidateId?: string;
  } | null>(null);
  const outsideSinceRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (!enabled || !SOCIAL_FEATURE_ENABLED || !SOCIAL_RELEASE_TWO_ENABLED || !user || ownCheckIn) {
      setCandidate(null);
      setEligibility(null);
      sessionRef.current = null;
      outsideSinceRef.current = null;
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let requestInFlight = false;

    const schedule = () => {
      if (active) timer = setTimeout(() => void sample(), SAMPLE_INTERVAL_MS);
    };
    const sample = async () => {
      if (!active || requestInFlight || AppState.currentState !== 'active') {
        schedule();
        return;
      }
      requestInFlight = true;
      setSampling(true);
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          setCandidate(null);
          setEligibility(null);
          return;
        }
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (!active) return;
        const nearbyCandidates = findCandidates(venues, location);
        const nearbyCandidate = nearbyCandidates[0] || null;
        const tracked = sessionRef.current;
        const trackedCandidate = tracked?.placeCandidateId
          ? candidate
          : tracked?.venueId
            ? venues.find((venue) => venue.venueId === tracked.venueId) || null
            : null;
        const nextCandidate = trackedCandidate || nearbyCandidate;
        if (!nextCandidate) {
          setCandidate(null);
          setEligibility(null);
          sessionRef.current = null;
          outsideSinceRef.current = null;
          setSampleError(false);
          return;
        }
        const nextTargetKey = targetKey(nextCandidate);
        if (sessionRef.current?.targetKey !== nextTargetKey) {
          sessionRef.current = {
            targetKey: nextTargetKey,
            sessionId: createSessionId(),
            venueId: nextCandidate.venueId,
            placeCandidateId: nextCandidate.placeCandidateId,
          };
          setEligibility(null);
        }
        setCandidate(nextCandidate);
        const result = await recordCheckInEligibilitySample({
          sessionId: sessionRef.current.sessionId,
          ...(nextCandidate.venueId
            ? {
                venueId: nextCandidate.venueId,
                candidateVenueIds: nearbyCandidates
                  .map((venue) => venue.venueId)
                  .filter((venueId): venueId is string => Boolean(venueId)),
              }
            : { placeCandidateId: nextCandidate.placeCandidateId }),
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracyMeters: location.coords.accuracy ?? MAX_ACCURACY_METRES + 1,
          speedMetersPerSecond: location.coords.speed,
        });
        if (!active) return;
        setEligibility(result);
        setSampleError(false);
        if (result.reason === 'outside') outsideSinceRef.current ||= Date.now();
        else outsideSinceRef.current = null;
        if (result.reason === 'outside' && outsideSinceRef.current && Date.now() - outsideSinceRef.current >= 30_000) {
          setCandidate(null);
          setEligibility(null);
          sessionRef.current = null;
          outsideSinceRef.current = null;
        }
      } catch {
        if (active) setSampleError(true);
      } finally {
        requestInFlight = false;
        if (active) {
          setSampling(false);
          schedule();
        }
      }
    };

    void sample();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [candidate, enabled, ownCheckIn, sampleRevision, user, venues]);

  if (!enabled || !SOCIAL_FEATURE_ENABLED || !SOCIAL_RELEASE_TWO_ENABLED || !user) return null;

  const loadNearbyPlaces = async () => {
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
      const accuracyMeters = Number(location.coords.accuracy);
      if (!Number.isFinite(accuracyMeters) || accuracyMeters > 100) {
        setDiscoveryError('Your location is not precise enough yet. Step outdoors or wait a moment, then retry.');
        return;
      }
      const result = await discoverNearbyCheckInPlaces({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracyMeters,
        capturedAtMs: location.timestamp || Date.now(),
      });
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
  const startDwell = (place: VenueCandidate | null = selectedPlace) => {
    if (!place) return;
    const nextKey = targetKey(place);
    if (sessionRef.current?.targetKey !== nextKey) {
      sessionRef.current = {
        targetKey: nextKey,
        sessionId: createSessionId(),
        venueId: place.venueId,
        placeCandidateId: place.placeCandidateId,
      };
      setEligibility(null);
    }
    setCandidate(place);
    setPickerVisible(false);
    setPrivateSetupVisible(false);
    setSampleRevision((value) => value + 1);
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const openPrivateSetup = () => {
    setPrivatePlaceError('');
    setPrivateSetupVisible(true);
  };

  const createPrivatePlace = async () => {
    const label = privateLabelChoice === 'Custom'
      ? privateCustomLabel.trim()
      : privateLabelChoice;
    if (label.length < 2) {
      setPrivatePlaceError('Add a short private-place label. Do not enter an address.');
      return;
    }
    setCreatingPrivatePlace(true);
    setPrivatePlaceError('');
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setPrivatePlaceError('Allow precise location to verify that you remain at this private place.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const accuracyMeters = Number(location.coords.accuracy);
      if (!Number.isFinite(accuracyMeters) || accuracyMeters > 100) {
        setPrivatePlaceError('Your location is not precise enough yet. Wait a moment, then retry.');
        return;
      }
      const result = await createPrivateCheckInPlaceCandidate({
        label,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracyMeters,
        capturedAtMs: location.timestamp || Date.now(),
      });
      const place = result.candidate;
      startDwell({
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
      setCreatingPrivatePlace(false);
    }
  };

  let control: React.ReactNode;
  if (ownCheckIn) {
    const activeVenue = ownCheckIn.venueId
      ? venues.find((venue) => venue.venueId === ownCheckIn.venueId) ?? null
      : ({
          id: ownCheckIn.venueLocationKey,
          type: ownCheckIn.locationType === 'private_place' ? 'private_place' : 'external_place',
          placeCandidateId: '',
          venueName: ownCheckIn.venueNameSnapshot,
          address: ownCheckIn.placeAddress || '',
          category: ownCheckIn.placeCategory || 'Place',
          latitude: ownCheckIn.latitude || 0,
          longitude: ownCheckIn.longitude || 0,
          distanceMetres: 0,
          imageUrl: '',
        } satisfies VenueCandidate);
    control = (
      <TouchableOpacity
        accessibilityLabel={`Manage active check-in at ${ownCheckIn.venueNameSnapshot}`}
        accessibilityRole="button"
        activeOpacity={0.88}
        onPress={() => router.push('/check-in')}
        style={[styles.control, styles.activeControl]}
      >
        <VenueAvatar active venue={activeVenue} />
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.eyebrow}>CHECKED IN</Text>
          <Text numberOfLines={1} style={styles.activeVenue}>{ownCheckIn.venueNameSnapshot}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#175CD3" />
      </TouchableOpacity>
    );
  } else if (!candidate || !eligibility) {
    control = (
      <TouchableOpacity
        accessibilityLabel="Choose a nearby place to check in"
        accessibilityRole="button"
        activeOpacity={0.88}
        onPress={() => void loadNearbyPlaces()}
        style={[styles.control, styles.idleControl]}
        testID="contextual-check-in-idle"
      >
        <View style={[styles.iconCircle, styles.idleIconCircle]}>
          <Ionicons name="location-outline" size={21} color="#0F766E" />
        </View>
      </TouchableOpacity>
    );
  } else if (eligibility.eligible && sessionRef.current) {
    const sessionId = sessionRef.current.sessionId;
    const eligibleVenueIds = [...new Set([candidate.venueId, ...(eligibility.eligibleVenueIds || [])])]
      .filter((venueId): venueId is string => Boolean(venueId));
    const eligibleCandidates = candidate.type !== 'gathr_venue'
      ? [candidate]
      : eligibleVenueIds
          .map((venueId) => venues.find((venue) => venue.venueId === venueId))
          .filter((venue): venue is VenueCandidate => Boolean(venue));
    control = (
      <TouchableOpacity
        accessibilityLabel={`Check in at ${candidate.venueName}`}
        accessibilityRole="button"
        activeOpacity={0.88}
        onLongPress={() => void loadNearbyPlaces()}
        onPress={() => router.push(buildNearbyCheckInRoute(candidate, sessionId, eligibleCandidates))}
        style={[styles.control, styles.readyControl]}
        testID="contextual-check-in-ready"
      >
        <VenueAvatar venue={candidate} />
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.readyEyebrow}>YOU'RE HERE</Text>
          <Text numberOfLines={1} style={styles.readyVenue}>Check in · {candidate.venueName}</Text>
        </View>
        <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
      </TouchableOpacity>
    );
  } else {
    const secondsRemaining = Math.max(1, Math.ceil(eligibility.remainingMs / 1_000));
    const status = eligibility.reason === 'moving_too_fast'
      ? 'Waiting until you stop'
      : eligibility.reason === 'low_accuracy'
        ? 'Finding your exact location'
        : eligibility.reason === 'outside'
          ? 'Move a little closer'
          : `Stay nearby · ${secondsRemaining}s`;
    control = (
      <TouchableOpacity
        accessibilityLabel={`${candidate.venueName}. ${status}. Choose another nearby place`}
        accessibilityRole="button"
        activeOpacity={0.88}
        onPress={() => void loadNearbyPlaces()}
        style={[styles.control, styles.progressControl]}
      >
        <VenueAvatar venue={candidate} />
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.progressVenue}>{candidate.venueName}</Text>
          <Text numberOfLines={1} style={styles.progressText}>{sampleError ? 'Detection will retry' : sampling ? 'Confirming your location' : status}</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color="#6941C6" />
      </TouchableOpacity>
    );
  }

  return (
    <>
      {control}
      <Modal animationType="slide" onRequestClose={() => setPickerVisible(false)} transparent visible={pickerVisible}>
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
              <TouchableOpacity accessibilityLabel="Close nearby places" onPress={() => setPickerVisible(false)} style={styles.closeButton}>
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
                  disabled={creatingPrivatePlace}
                  onPress={() => void createPrivatePlace()}
                  style={[styles.usePrivateButton, creatingPrivatePlace && styles.disabled]}
                >
                  {creatingPrivatePlace
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <><Text style={styles.usePlaceText}>Verify this private place</Text><Ionicons name="arrow-forward" size={19} color="#FFFFFF" /></>}
                </TouchableOpacity>
              </View>
            ) : discovering ? (
              <View style={styles.pickerState}>
                <ActivityIndicator color="#2F80ED" />
                <Text style={styles.pickerStateTitle}>Finding nearby places…</Text>
                <Text style={styles.pickerStateCopy}>Only this one location check is used.</Text>
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
                    <Text style={styles.privacyCopy}>You’ll confirm who can see it after GathR verifies you stayed nearby.</Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
                    style={styles.attributionRow}
                  >
                    <Text style={styles.attributionText}>Place data © OpenStreetMap contributors</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" disabled={!selectedPlace} onPress={() => startDwell()} style={[styles.usePlaceButton, !selectedPlace && styles.disabled]}>
                    <Text style={styles.usePlaceText}>Use this place</Text>
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
    position: 'absolute', right: 12, bottom: 128, minHeight: 54, maxWidth: 280,
    flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11,
    paddingVertical: 8, borderRadius: 18, shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10,
    elevation: 6, zIndex: 32,
  },
  readyControl: { backgroundColor: '#2F80ED' },
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
