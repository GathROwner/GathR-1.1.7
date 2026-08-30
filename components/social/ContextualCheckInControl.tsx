import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../../contexts/AuthContext';
import { recordCheckInEligibilitySample } from '../../services/socialService';
import { useMapStore } from '../../store';
import { useSocialStore } from '../../store/socialStore';
import type { CheckInEligibilityResult } from '../../types/social';
import { SOCIAL_FEATURE_ENABLED, SOCIAL_RELEASE_TWO_ENABLED } from '../../types/social';

const MAX_ACCURACY_METRES = 75;
const BASE_RADIUS_METRES = 50;
const SAMPLE_INTERVAL_MS = 10_000;

interface VenueCandidate {
  venueId: string;
  venueName: string;
  address: string;
  latitude: number;
  longitude: number;
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

function findCandidate(
  venues: VenueCandidate[],
  location: Location.LocationObject
): VenueCandidate | null {
  const accuracy = Number(location.coords.accuracy);
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_ACCURACY_METRES) return null;
  let nearest: { venue: VenueCandidate; distance: number } | null = null;
  for (const venue of venues) {
    const distance = distanceMetres(
      location.coords.latitude,
      location.coords.longitude,
      venue.latitude,
      venue.longitude
    );
    if (distance > BASE_RADIUS_METRES + accuracy) continue;
    if (!nearest || distance < nearest.distance) nearest = { venue, distance };
  }
  return nearest?.venue ?? null;
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
        || byId.has(venueId)
        || event.locationScope === 'area'
        || event.locationScope === 'route'
        || !Number.isFinite(event.latitude)
        || !Number.isFinite(event.longitude)
      ) continue;
      byId.set(venueId, {
        venueId,
        venueName: event.venue || event.title || 'GathR venue',
        address: event.address || '',
        latitude: event.latitude,
        longitude: event.longitude,
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
        const nearbyCandidate = findCandidate(venues, location);
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
    return (
      <TouchableOpacity
        accessibilityLabel={`Manage active check-in at ${ownCheckIn.venueNameSnapshot}`}
        accessibilityRole="button"
        activeOpacity={0.88}
        onPress={() => router.push('/check-in')}
        style={[styles.control, styles.activeControl]}
      >
        <View style={[styles.iconCircle, styles.activeIconCircle]}>
          <Ionicons name="location" size={18} color="#175CD3" />
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.eyebrow}>CHECKED IN</Text>
          <Text numberOfLines={1} style={styles.activeVenue}>{ownCheckIn.venueNameSnapshot}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#175CD3" />
      </TouchableOpacity>
    );
  }

  if (!candidate || !eligibility) return null;

  if (eligibility.eligible && sessionRef.current) {
    const sessionId = sessionRef.current.sessionId;
    return (
      <TouchableOpacity
        accessibilityLabel={`Check in here at ${candidate.venueName}`}
        accessibilityRole="button"
        activeOpacity={0.88}
        onPress={() => router.push({
          pathname: '/check-in',
          params: { venueId: candidate.venueId, eligibilitySessionId: sessionId },
        })}
        style={[styles.control, styles.readyControl]}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="location" size={18} color="#FFFFFF" />
        </View>
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
      <View style={[styles.iconCircle, styles.progressIconCircle]}>
        {sampling ? <ActivityIndicator color="#6941C6" size="small" /> : <Ionicons name="leaf" size={17} color="#6941C6" />}
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.progressVenue}>{candidate.venueName}</Text>
        <Text numberOfLines={1} style={styles.progressText}>{sampleError ? 'Check-in detection will retry' : status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  control: {
    position: 'absolute',
    right: 12,
    bottom: 104,
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
  iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  activeIconCircle: { backgroundColor: '#EFF8FF' },
  progressIconCircle: { backgroundColor: '#F4EBFF' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#175CD3', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  activeVenue: { color: '#101828', fontWeight: '800', marginTop: 1 },
  readyEyebrow: { color: '#DCEBFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  readyVenue: { color: '#FFFFFF', fontWeight: '800', marginTop: 1 },
  progressVenue: { color: '#344054', fontWeight: '800' },
  progressText: { color: '#6941C6', fontSize: 12, fontWeight: '600', marginTop: 1 },
});
