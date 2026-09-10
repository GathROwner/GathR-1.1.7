import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../../contexts/AuthContext';
import { recordCheckInEligibilitySample } from '../../services/socialService';
import { useMapStore } from '../../store';
import { useSocialStore } from '../../store/socialStore';
import type { CheckInEligibilityResult } from '../../types/social';
import { SOCIAL_FEATURE_ENABLED, SOCIAL_RELEASE_TWO_ENABLED } from '../../types/social';

const MAX_ACCURACY_METRES = 75;
const BASE_RADIUS_METRES = 50;
const SAMPLE_INTERVAL_MS = 10_000;

export interface VenueCandidate {
  venueId: string;
  venueName: string;
  address: string;
  latitude: number;
  longitude: number;
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
  return {
    pathname: '/check-in' as const,
    params: {
      venueId: venue.venueId,
      eligibilitySessionId,
      eligibleVenueIds: eligibleCandidates.map((item) => item.venueId).join(','),
    },
  };
}

function findCandidates(
  venues: VenueCandidate[],
  location: Location.LocationObject
): VenueCandidate[] {
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
    .map(({ venue }) => venue);
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
  const sessionRef = useRef<{ venueId: string; sessionId: string } | null>(null);
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
        venueId,
        venueName: event.venue || event.title || 'GathR venue',
        address: event.address || '',
        latitude: event.latitude,
        longitude: event.longitude,
        imageUrl: remoteImageUrl(event.profileUrl),
      });
    }
    return [...byId.values()];
  }, [allEvents]);

  useEffect(() => {
    if (!enabled || !SOCIAL_FEATURE_ENABLED || !SOCIAL_RELEASE_TWO_ENABLED || !user || ownCheckIn || venues.length === 0) {
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
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (!active) return;
        const nearbyCandidates = findCandidates(venues, location);
        const nearbyCandidate = nearbyCandidates[0] || null;
        const trackedCandidate = sessionRef.current
          ? venues.find((venue) => venue.venueId === sessionRef.current?.venueId) || null
          : null;
        const nextCandidate = nearbyCandidate || trackedCandidate;
        if (!nextCandidate) {
          setCandidate(null);
          setEligibility(null);
          sessionRef.current = null;
          outsideSinceRef.current = null;
          setSampleError(false);
          return;
        }
        if (!nearbyCandidate) outsideSinceRef.current ||= Date.now();
        else outsideSinceRef.current = null;
        if (sessionRef.current?.venueId !== nextCandidate.venueId) {
          sessionRef.current = {
            venueId: nextCandidate.venueId,
            sessionId: createSessionId(),
          };
          setEligibility(null);
        }
        setCandidate(nextCandidate);
        const result = await recordCheckInEligibilitySample({
          sessionId: sessionRef.current.sessionId,
          venueId: nextCandidate.venueId,
          candidateVenueIds: nearbyCandidates.map((venue) => venue.venueId),
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracyMeters: location.coords.accuracy ?? MAX_ACCURACY_METRES + 1,
          speedMetersPerSecond: location.coords.speed,
        });
        if (!active) return;
        setEligibility(result);
        setSampleError(false);
        if (
          result.reason === 'outside'
          && outsideSinceRef.current
          && Date.now() - outsideSinceRef.current >= 30_000
        ) {
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
  }, [enabled, ownCheckIn, user, venues]);

  if (!enabled || !SOCIAL_FEATURE_ENABLED || !SOCIAL_RELEASE_TWO_ENABLED || !user) return null;

  if (ownCheckIn) {
    const activeVenue = venues.find((venue) => venue.venueId === ownCheckIn.venueId) ?? null;
    return (
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
  }

  if (!candidate || !eligibility) {
    return (
      <TouchableOpacity
        accessibilityLabel="Check in at a nearby GathR venue"
        accessibilityRole="button"
        activeOpacity={0.88}
        onPress={() => Alert.alert(
          'Check in when you arrive',
          'GathR unlocks check-in after your phone remains near a recognized venue for about 90 seconds. Keep precise location enabled. Your location is never shared continuously.'
        )}
        style={[styles.control, styles.idleControl]}
        testID="contextual-check-in-idle"
      >
        <View style={[styles.iconCircle, styles.idleIconCircle]}>
          <Ionicons name="location-outline" size={21} color="#0F766E" />
        </View>
      </TouchableOpacity>
    );
  }

  if (eligibility.eligible && sessionRef.current) {
    const sessionId = sessionRef.current.sessionId;
    const eligibleVenueIds = [...new Set([candidate.venueId, ...(eligibility.eligibleVenueIds || [])])];
    const eligibleCandidates = eligibleVenueIds
      .map((venueId) => venues.find((venue) => venue.venueId === venueId))
      .filter((venue): venue is VenueCandidate => Boolean(venue));
    const openCheckIn = (venue: VenueCandidate) => router.push(
      buildNearbyCheckInRoute(venue, sessionId, eligibleCandidates)
    );
    return (
      <TouchableOpacity
        accessibilityLabel={`Check in at ${candidate.venueName}${eligibleCandidates.length > 1 ? `, ${eligibleCandidates.length} nearby venues available` : ''}`}
        accessibilityRole="button"
        activeOpacity={0.88}
        onPress={() => openCheckIn(eligibleCandidates[0] || candidate)}
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
  }

  const secondsRemaining = Math.max(1, Math.ceil(eligibility.remainingMs / 1_000));
  const status = eligibility.reason === 'moving_too_fast'
    ? 'Waiting until you stop'
    : eligibility.reason === 'low_accuracy'
      ? 'Finding your exact location'
      : eligibility.reason === 'outside'
        ? 'Move a little closer'
        : `Stay nearby · ${secondsRemaining}s`;

  return (
    <View accessibilityLiveRegion="polite" style={[styles.control, styles.progressControl]}>
      <VenueAvatar venue={candidate} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.progressVenue}>{candidate.venueName}</Text>
        <Text numberOfLines={1} style={styles.progressText}>{sampleError ? 'Check-in detection will retry' : sampling ? 'Confirming your location' : status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  control: {
    position: 'absolute',
    right: 12,
    // Keep the contextual banner clear of the 36pt recenter control
    // (bottom: 80) with a 12pt visual gap.
    bottom: 128,
    minHeight: 54,
    maxWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 18,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  readyControl: { backgroundColor: '#2F80ED' },
  activeControl: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B2DDFF' },
  progressControl: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D6BBFB' },
  idleControl: {
    right: 10,
    bottom: 34,
    width: 36,
    height: 36,
    minHeight: 36,
    maxWidth: 36,
    justifyContent: 'center',
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#99D6CF',
    backgroundColor: '#FFFFFF',
  },
  iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  idleIconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#ECFDF3' },
  venueAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#EFF8FF' },
  activeVenueAvatar: { borderColor: '#B2DDFF' },
  venueAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  venueAvatarInitial: { color: '#175CD3', fontSize: 16, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#175CD3', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  activeVenue: { color: '#101828', fontWeight: '800', marginTop: 1 },
  readyEyebrow: { color: '#DCEBFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  readyVenue: { color: '#FFFFFF', fontWeight: '800', marginTop: 1 },
  progressVenue: { color: '#344054', fontWeight: '800' },
  progressText: { color: '#6941C6', fontSize: 12, fontWeight: '600', marginTop: 1 },
});
