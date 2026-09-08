import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileAvatar } from '../components/social/ProfileAvatar';
import { useAuth } from '../contexts/AuthContext';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  sendFriendRequest,
  SocialServiceError,
} from '../services/socialService';
import { useSocialStore } from '../store/socialStore';
import type { SocialProfile, SocialTimestamp } from '../types/social';
import { formatFriendEventDate } from '../utils/friendEvents';
import { socialTimestampToMillis } from '../utils/friendPresence';
import {
  deriveProfileRelationship,
  selectSharedFriendEvents,
} from '../utils/socialProfileVisibility';

const BRAND = '#2F80ED';
const PURPLE = '#6941C6';

function routeValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function displayError(error: unknown) {
  return error instanceof SocialServiceError || error instanceof Error
    ? error.message
    : 'The action could not be completed.';
}

function formatFriendSince(value: SocialTimestamp) {
  const millis = socialTimestampToMillis(value);
  if (millis === null) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
    .format(new Date(millis));
}

export default function SocialProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    uid?: string | string[];
    displayName?: string | string[];
    photoURL?: string | string[];
    socialHandle?: string | string[];
  }>();
  const { user } = useAuth();
  const {
    friends,
    requests,
    blocks,
    activity,
    friendEvents,
    fromCache,
  } = useSocialStore();
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const routeProfile = useMemo<SocialProfile>(() => ({
    uid: routeValue(params.uid),
    displayName: routeValue(params.displayName) || 'GathR member',
    photoURL: routeValue(params.photoURL),
    socialHandle: routeValue(params.socialHandle),
  }), [params.displayName, params.photoURL, params.socialHandle, params.uid]);

  const relationship = deriveProfileRelationship({
    profileUid: routeProfile.uid,
    currentUid: user?.uid || '',
    friends,
    requests,
    blocks,
  });
  const friend = friends.find((item) => item.uid === routeProfile.uid);
  const request = requests.find((item) => item.uid === routeProfile.uid);
  const blocked = blocks.find((item) => item.blockedUid === routeProfile.uid);
  const profile: SocialProfile = friend || request || (blocked
    ? { ...blocked, uid: blocked.blockedUid }
    : routeProfile);
  const currentActivity = relationship === 'friend'
    ? activity.find((item) => item.ownerUid === profile.uid || item.uid === profile.uid)
    : undefined;
  const sharedEvents = useMemo(
    () => relationship === 'friend'
      ? selectSharedFriendEvents(profile.uid, friendEvents)
      : [],
    [friendEvents, profile.uid, relationship]
  );
  const friendSince = relationship === 'friend' ? formatFriendSince(friend?.acceptedAt) : '';

  const run = async (key: string, operation: () => Promise<unknown>) => {
    setBusyAction(key);
    try {
      await operation();
    } catch (error) {
      Alert.alert('Could not complete action', displayError(error));
    } finally {
      setBusyAction(null);
    }
  };

  const shareProfile = () => {
    if (!profile.socialHandle) return;
    const url = `https://www.gathrapp.ca/app/?friend=${encodeURIComponent(profile.socialHandle)}`;
    void Share.share({
      title: `${profile.displayName} on GathR`,
      message: `${profile.displayName} on GathR: @${profile.socialHandle}\n${url}`,
      url,
    });
  };

  if (!routeProfile.uid) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={24} color="#101828" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={styles.unavailable}>
          <Ionicons name="person-circle-outline" size={58} color="#98A2B3" />
          <Text style={styles.unavailableTitle}>Profile unavailable</Text>
          <Text style={styles.centeredCopy}>Return to Friends and select the account again.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isPublicView = relationship !== 'friend' && relationship !== 'self';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={24} color="#101828" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{relationship === 'friend' ? 'Friend profile' : 'Public profile'}</Text>
          <Text style={styles.headerSubtitle}>{relationship === 'friend' ? 'Shared with friends' : 'Basic identity details'}</Text>
        </View>
        {!!profile.socialHandle && (
          <TouchableOpacity accessibilityLabel={`Share ${profile.displayName}'s profile`} onPress={shareProfile} style={styles.iconButton}>
            <Ionicons name="share-outline" size={22} color="#344054" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.avatarRing}>
            <ProfileAvatar profile={profile} size={96} />
          </View>
          <View style={styles.visibilityPill}>
            <Ionicons
              name={relationship === 'friend' ? 'people' : 'globe-outline'}
              size={14}
              color={relationship === 'friend' ? '#53389E' : '#175CD3'}
            />
            <Text style={[styles.visibilityText, relationship === 'friend' && styles.friendVisibilityText]}>
              {relationship === 'friend' ? 'FRIEND' : 'PUBLIC'}
            </Text>
          </View>
          <Text style={styles.displayName}>{profile.displayName}</Text>
          <Text style={styles.handle}>
            {profile.socialHandle ? `@${profile.socialHandle}` : 'GathR member'}
          </Text>
          {friendSince ? <Text style={styles.friendSince}>Friends since {friendSince}</Text> : null}

          <View style={styles.actions}>
            {relationship === 'public' && (
              <TouchableOpacity
                accessibilityLabel={`Send friend request to ${profile.displayName}`}
                disabled={busyAction !== null}
                onPress={() => void run('add', () => sendFriendRequest(profile.uid))}
                style={styles.primaryButton}
              >
                {busyAction === 'add'
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <><Ionicons name="person-add-outline" size={19} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Add friend</Text></>}
              </TouchableOpacity>
            )}
            {relationship === 'outgoing' && (
              <>
                <View style={styles.confirmedButton}>
                  <Ionicons name="time-outline" size={19} color="#475467" />
                  <Text style={styles.confirmedButtonText}>Request sent</Text>
                </View>
                <TouchableOpacity
                  accessibilityLabel={`Cancel friend request to ${profile.displayName}`}
                  disabled={busyAction !== null}
                  onPress={() => void run('cancel', () => cancelFriendRequest(profile.uid))}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
            {relationship === 'incoming' && (
              <>
                <TouchableOpacity
                  accessibilityLabel={`Accept ${profile.displayName}'s friend request`}
                  disabled={busyAction !== null}
                  onPress={() => void run('accept', () => acceptFriendRequest(profile.uid))}
                  style={styles.primaryButton}
                >
                  {busyAction === 'accept'
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <><Ionicons name="checkmark" size={20} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Accept</Text></>}
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel={`Decline ${profile.displayName}'s friend request`}
                  disabled={busyAction !== null}
                  onPress={() => void run('decline', () => declineFriendRequest(profile.uid))}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Not now</Text>
                </TouchableOpacity>
              </>
            )}
            {relationship === 'friend' && (
              <View style={[styles.confirmedButton, styles.friendButton]}>
                <Ionicons name="people" size={19} color="#53389E" />
                <Text style={styles.friendButtonText}>Friends</Text>
              </View>
            )}
            {relationship === 'self' && (
              <TouchableOpacity onPress={() => router.push('/profile')} style={styles.primaryButton}>
                <Ionicons name="pencil" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Edit profile</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {relationship === 'blocked' ? (
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}><Ionicons name="shield-outline" size={22} color="#B42318" /></View>
            <View style={styles.infoCopy}>
              <Text style={styles.infoTitle}>Profile hidden</Text>
              <Text style={styles.infoText}>This account is blocked. Unblock it from the Friends page before viewing its profile.</Text>
            </View>
          </View>
        ) : isPublicView ? (
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}><Ionicons name="lock-closed-outline" size={22} color="#175CD3" /></View>
            <View style={styles.infoCopy}>
              <Text style={styles.infoTitle}>Public information only</Text>
              <Text style={styles.infoText}>Before you connect, GathR shows only this person’s display name, handle, and profile photo so you can confirm it’s the right account.</Text>
            </View>
          </View>
        ) : relationship === 'friend' ? (
          <>
            <View style={[styles.infoCard, styles.friendInfoCard]}>
              <View style={[styles.infoIcon, styles.friendInfoIcon]}><Ionicons name="shield-checkmark-outline" size={22} color="#53389E" /></View>
              <View style={styles.infoCopy}>
                <Text style={styles.infoTitle}>Friends-only view</Text>
                <Text style={styles.infoText}>Optional check-ins and shared private plans appear here only while you’re friends.</Text>
              </View>
            </View>

            {fromCache && (
              <Text style={styles.offlineNote}>Private details will reappear after GathR reconnects and confirms access.</Text>
            )}

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionIcon}><Ionicons name="location-outline" size={20} color={BRAND} /></View>
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionTitle}>Current check-in</Text>
                  <Text style={styles.sectionSubtitle}>Visible only when they choose to share it with you</Text>
                </View>
              </View>
              {currentActivity ? (
                <View style={styles.activityRow}>
                  <View style={styles.liveDot} />
                  <View style={styles.activityCopy}>
                    <Text style={styles.activityVenue}>{currentActivity.venueName}</Text>
                    {!!currentActivity.message && <Text style={styles.activityMessage}>{currentActivity.message}</Text>}
                  </View>
                </View>
              ) : (
                <Text style={styles.emptyDetail}>No check-in shared right now.</Text>
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeading}>
                <View style={[styles.sectionIcon, styles.purpleIcon]}><Ionicons name="calendar-outline" size={20} color={PURPLE} /></View>
                <View style={styles.sectionCopy}>
                  <Text style={styles.sectionTitle}>Shared plans</Text>
                  <Text style={styles.sectionSubtitle}>Upcoming private events you can both see</Text>
                </View>
                {sharedEvents.length > 0 && <View style={styles.eventCount}><Text style={styles.eventCountText}>{sharedEvents.length}</Text></View>}
              </View>
              {sharedEvents.slice(0, 3).map((event) => (
                <TouchableOpacity
                  accessibilityLabel={`Open ${event.title}`}
                  key={event.eventId}
                  onPress={() => router.push({ pathname: '/friend-event/[id]', params: { id: event.eventId } })}
                  style={styles.eventRow}
                >
                  <View style={styles.eventCopy}>
                    <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
                    <Text numberOfLines={1} style={styles.eventMeta}>{formatFriendEventDate(event.startAt)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color="#98A2B3" />
                </TouchableOpacity>
              ))}
              {sharedEvents.length === 0 && <Text style={styles.emptyDetail}>No upcoming plans shared between you.</Text>}
              {sharedEvents.length > 3 && (
                <TouchableOpacity onPress={() => router.push('/my-events')} style={styles.textButton}>
                  <Text style={styles.textButtonLabel}>See all shared plans</Text>
                  <Ionicons name="arrow-forward" size={17} color={PURPLE} />
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F8FB' },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0' },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  headerTitle: { color: '#101828', fontSize: 21, fontWeight: '900' },
  headerSubtitle: { marginTop: 1, color: '#667085', fontSize: 12 },
  content: { flexGrow: 1, gap: 12, padding: 12, paddingBottom: 28 },
  heroCard: { alignItems: 'center', paddingHorizontal: 18, paddingVertical: 24, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E4E7EC' },
  avatarRing: { padding: 4, borderRadius: 54, backgroundColor: '#FFFFFF', shadowColor: '#101828', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  visibilityPill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: '#EFF8FF' },
  visibilityText: { color: '#175CD3', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  friendVisibilityText: { color: '#53389E' },
  displayName: { marginTop: 9, color: '#101828', fontSize: 25, fontWeight: '900', textAlign: 'center' },
  handle: { marginTop: 3, color: '#667085', fontSize: 15 },
  friendSince: { marginTop: 7, color: '#667085', fontSize: 12 },
  actions: { width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 18 },
  primaryButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 20, borderRadius: 12, backgroundColor: BRAND },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800' },
  secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#F2F4F7' },
  secondaryButtonText: { color: '#344054', fontWeight: '800' },
  confirmedButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#F2F4F7' },
  confirmedButtonText: { color: '#475467', fontWeight: '800' },
  friendButton: { backgroundColor: '#F4EBFF' },
  friendButtonText: { color: '#53389E', fontWeight: '800' },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#B2DDFF', backgroundColor: '#EFF8FF' },
  friendInfoCard: { borderColor: '#D6BBFB', backgroundColor: '#F9F5FF' },
  infoIcon: { width: 38, height: 38, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#DCEBFF' },
  friendInfoIcon: { backgroundColor: '#E9D7FE' },
  infoCopy: { flex: 1, gap: 3 },
  infoTitle: { color: '#101828', fontSize: 14, fontWeight: '900' },
  infoText: { color: '#475467', fontSize: 12, lineHeight: 18 },
  offlineNote: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, color: '#7A5D00', backgroundColor: '#FFF4CC', fontSize: 11, textAlign: 'center' },
  sectionCard: { padding: 15, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E4E7EC' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#EFF8FF' },
  purpleIcon: { backgroundColor: '#F4EBFF' },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { color: '#101828', fontSize: 15, fontWeight: '900' },
  sectionSubtitle: { marginTop: 2, color: '#667085', fontSize: 11, lineHeight: 15 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0' },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#12B76A' },
  activityCopy: { flex: 1 },
  activityVenue: { color: '#101828', fontSize: 14, fontWeight: '800' },
  activityMessage: { marginTop: 2, color: '#667085', fontSize: 12 },
  emptyDetail: { marginTop: 14, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0', color: '#667085', fontSize: 12 },
  eventCount: { minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#E9D7FE' },
  eventCountText: { color: '#53389E', fontSize: 11, fontWeight: '900' },
  eventRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0' },
  eventCopy: { flex: 1, minWidth: 0 },
  eventTitle: { color: '#101828', fontSize: 13, fontWeight: '800' },
  eventMeta: { marginTop: 3, color: '#667085', fontSize: 11 },
  textButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 9, borderRadius: 10, backgroundColor: '#F9F5FF' },
  textButtonLabel: { color: PURPLE, fontSize: 12, fontWeight: '800' },
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 28 },
  unavailableTitle: { color: '#101828', fontSize: 19, fontWeight: '900' },
  centeredCopy: { color: '#667085', lineHeight: 19, textAlign: 'center' },
});
