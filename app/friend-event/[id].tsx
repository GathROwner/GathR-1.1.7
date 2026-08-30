import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../contexts/AuthContext';
import {
  cancelFriendEvent,
  deleteFriendEvent,
  inviteToFriendEvent,
  removeFromFriendEvent,
  reportUser,
  respondToFriendEvent,
} from '../../services/socialService';
import { useSocialStore } from '../../store/socialStore';
import type { FriendEventRsvp } from '../../types/social';
import { addToCalendar } from '../../utils/calendarUtils';
import {
  findFriendEventLocation,
  formatFriendEventDate,
  hasExactFriendEventCoordinates,
  socialTimeToMillis,
} from '../../utils/friendEvents';

const PURPLE = '#6941C6';

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The event could not be updated.';
}

export default function FriendEventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const eventId = String(params.id || '');
  const event = useSocialStore((state) => state.friendEvents.find((item) => item.eventId === eventId));
  const location = useSocialStore((state) => findFriendEventLocation(eventId, state.friendEventLocations));
  const friends = useSocialStore((state) => state.friends);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [guestListVisible, setGuestListVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [cancelVisible, setCancelVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const canInvite = event?.viewerRole === 'host' || event?.guestInviteMode === 'guests_can_invite';
  const invitedUids = new Set((event?.guests || []).map((guest) => guest.uid));
  const inviteCandidates = friends.filter((friend) => !invitedUids.has(friend.uid));

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await action();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error) {
      Alert.alert('Could not update event', message(error));
    } finally {
      setBusy(null);
    }
  };

  const respond = (response: Exclude<FriendEventRsvp, 'host' | 'invited'>) =>
    void run(`rsvp-${response}`, () => respondToFriendEvent(eventId, response));

  const directions = async () => {
    const latitude = location?.latitude ?? event?.latitude;
    const longitude = location?.longitude ?? event?.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      Alert.alert('Directions unavailable', 'The exact address has not been shared yet.');
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    await Linking.openURL(url);
  };

  const addCalendar = async () => {
    if (!event) return;
    const start = socialTimeToMillis(event.startAt);
    const end = socialTimeToMillis(event.endAt);
    if (start === null || end === null) return;
    await addToCalendar({
      title: event.title,
      startDate: new Date(start),
      endDate: new Date(end),
      location: location?.address || (event.addressRevealed ? event.locationLabel : ''),
      notes: event.description,
    });
  };

  const cancelEvent = () => {
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      Alert.alert('Add a short explanation', 'Tell guests why the event is being canceled.');
      return;
    }
    void run('cancel', async () => {
      await cancelFriendEvent(eventId, reason);
      setCancelVisible(false);
    });
  };

  const confirmDelete = () => Alert.alert(
    'Delete this event?',
    'This permanently removes the event and every private-address projection.',
    [
      { text: 'Keep event', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void run('delete', async () => {
          await deleteFriendEvent(eventId);
          router.replace('/my-events');
        }),
      },
    ]
  );

  const confirmRemoveGuest = (uid: string, displayName: string) => Alert.alert(
    `Remove ${displayName}?`,
    'Their event and any exact private-address access will be revoked immediately.',
    [
      { text: 'Keep guest', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void run(`remove-${uid}`, () => removeFromFriendEvent(eventId, uid)) },
    ]
  );

  const reportHost = () => {
    if (!event) return;
    Alert.alert(
    'Report this event or host',
    'Choose the closest reason. Reports never notify the host.',
    [
      { text: 'Spam or misleading', onPress: () => void run('report', async () => { await reportUser(event.hostUid, 'spam'); Alert.alert('Report received', 'Thank you. GathR will review it.'); }) },
      { text: 'Privacy concern', onPress: () => void run('report', async () => { await reportUser(event.hostUid, 'privacy'); Alert.alert('Report received', 'Thank you. GathR will review it.'); }) },
      { text: 'Harassment', onPress: () => void run('report', async () => { await reportUser(event.hostUid, 'harassment'); Alert.alert('Report received', 'Thank you. GathR will review it.'); }) },
      { text: 'Cancel', style: 'cancel' },
    ]
    );
  };

  if (!user) return null;
  if (!event) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}><TouchableOpacity onPress={() => router.back()} style={styles.iconButton}><Ionicons name="arrow-back" size={23} color="#101828" /></TouchableOpacity><Text style={styles.headerTitle}>Friend Event</Text></View>
        <View style={styles.unavailable}><Ionicons name="lock-closed-outline" size={40} color={PURPLE} /><Text style={styles.unavailableTitle}>Event unavailable</Text><Text style={styles.muted}>It may have been deleted, or your invitation may have changed.</Text></View>
      </SafeAreaView>
    );
  }

  const addressLabel = event.locationType === 'online'
    ? 'Online event'
    : location?.address
      || (event.locationAddress ? `${event.locationLabel} · ${event.locationAddress}` : '')
      || (event.addressRevealed ? event.locationLabel : 'Address shared later');
  const canceled = event.status === 'canceled';
  const directionsAvailable = hasExactFriendEventCoordinates(event, location);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back"><Ionicons name="arrow-back" size={23} color="#101828" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Friend Event</Text>
        {event.viewerRole === 'host' ? (
          <TouchableOpacity onPress={() => router.push({ pathname: '/create-event', params: { eventId } })} style={styles.headerAction}><Text style={styles.headerActionText}>Edit</Text></TouchableOpacity>
        ) : <TouchableOpacity onPress={reportHost} style={styles.iconButton} accessibilityLabel="More event options"><Ionicons name="ellipsis-horizontal" size={22} color="#475467" /></TouchableOpacity>}
      </View>

      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroOrbLarge} /><View style={styles.heroOrbSmall} />
          <View style={styles.categoryPill}><Text style={styles.categoryText}>{event.category}</Text></View>
          <Text numberOfLines={2} style={styles.title}>{event.title}</Text>
          <Text style={styles.hostLine}>{event.viewerRole === 'host' ? 'Hosted by you' : `Hosted by ${event.host.displayName}`}</Text>
          {canceled && <View style={styles.canceledPill}><Text style={styles.canceledPillText}>CANCELED</Text></View>}
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}><View style={styles.infoIcon}><Ionicons name="calendar-outline" size={19} color={PURPLE} /></View><View style={styles.flex}><Text style={styles.infoTitle}>{formatFriendEventDate(event.startAt)}</Text><Text style={styles.muted}>Ends {formatFriendEventDate(event.endAt)}</Text></View></View>
          <View style={styles.divider} />
          <View style={styles.infoRow}><View style={styles.infoIcon}><Ionicons name={event.locationType === 'online' ? 'videocam-outline' : 'location-outline'} size={19} color={PURPLE} /></View><View style={styles.flex}><Text numberOfLines={2} style={styles.infoTitle}>{addressLabel}</Text><Text style={styles.muted}>{event.visibility === 'all_friends' ? 'All friends' : 'Invited friends only'} · {event.viewerCount} invited</Text></View></View>
        </View>

        {!!event.description && <Text numberOfLines={4} style={styles.description}>{event.description}</Text>}
        {canceled && !!event.cancellationReason && (
          <View style={styles.cancellationReason}><Ionicons name="information-circle" size={18} color="#B42318" /><Text numberOfLines={3} style={styles.cancellationReasonText}>{event.cancellationReason}</Text></View>
        )}

        {(event.updateHistory || []).length > 1 && (
          <TouchableOpacity onPress={() => setHistoryVisible(true)} style={styles.historyPreview}>
            <Ionicons name="time-outline" size={17} color={PURPLE} />
            <Text numberOfLines={1} style={styles.historyPreviewText}>{event.updateHistory.at(-1)?.summary}</Text>
            <Ionicons name="chevron-forward" size={16} color="#98A2B3" />
          </TouchableOpacity>
        )}

        {!canceled && event.viewerRole === 'guest' && (
          <View style={styles.rsvpCard}>
            <Text style={styles.sectionTitle}>Are you going?</Text>
            <View style={styles.rsvpRow}>
              {([['going', 'Going', 'checkmark-circle'], ['maybe', 'Maybe', 'help-circle'], ['cant_go', "Can't go", 'close-circle']] as const).map(([value, label, icon]) => (
                <TouchableOpacity disabled={busy !== null} key={value} onPress={() => respond(value)} style={[styles.rsvpButton, event.ownRsvp === value && styles.rsvpButtonActive]}>
                  {busy === `rsvp-${value}` ? <ActivityIndicator color={PURPLE} size="small" /> : <Ionicons name={icon} size={19} color={event.ownRsvp === value ? PURPLE : '#667085'} />}
                  <Text style={[styles.rsvpText, event.ownRsvp === value && styles.rsvpTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {event.viewerRole === 'host' && (
          <TouchableOpacity onPress={() => setGuestListVisible(true)} activeOpacity={0.78} style={styles.hostStats} accessibilityLabel="View and manage guest list">
            <View style={styles.stat}><Text style={styles.statNumber}>{event.responseCounts.going}</Text><Text style={styles.statLabel}>Going</Text></View>
            <View style={styles.stat}><Text style={styles.statNumber}>{event.responseCounts.maybe}</Text><Text style={styles.statLabel}>Maybe</Text></View>
            <View style={styles.stat}><Text style={styles.statNumber}>{event.responseCounts.cant_go}</Text><Text style={styles.statLabel}>Can't go</Text></View>
            <Ionicons name="chevron-forward" size={18} color="#98A2B3" style={styles.statsChevron} />
          </TouchableOpacity>
        )}

        {event.viewerRole === 'guest' && event.guestListVisible && (event.guests || []).length > 0 && (
          <TouchableOpacity onPress={() => setGuestListVisible(true)} style={styles.guestListPreview}>
            <View style={styles.guestAvatarStack}><Ionicons name="people" size={18} color="#6941C6" /></View>
            <Text style={styles.guestListPreviewText}>{event.guests.length} invited · View guest list</Text>
            <Ionicons name="chevron-forward" size={17} color="#98A2B3" />
          </TouchableOpacity>
        )}

        <View style={styles.actions}>
          {!canceled && canInvite && <TouchableOpacity onPress={() => setInviteVisible(true)} style={styles.actionButton}><Ionicons name="person-add-outline" size={19} color={PURPLE} /><Text style={styles.actionText}>Invite</Text></TouchableOpacity>}
          {event.locationType === 'online' && event.onlineUrl ? (
            <TouchableOpacity onPress={() => void Linking.openURL(event.onlineUrl)} style={styles.actionButton}><Ionicons name="videocam-outline" size={19} color={PURPLE} /><Text style={styles.actionText}>Join</Text></TouchableOpacity>
          ) : !directionsAvailable ? (
            <View style={[styles.actionButton, styles.lockedAction]} accessibilityLabel="Directions unlock when the address is shared">
              <Ionicons name="lock-closed-outline" size={19} color="#98A2B3" />
              <Text style={styles.lockedActionText}>Address later</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={() => void directions()} style={styles.actionButton}><Ionicons name="navigate-outline" size={19} color={PURPLE} /><Text style={styles.actionText}>Directions</Text></TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => void addCalendar()} style={styles.actionButton}><Ionicons name="calendar-outline" size={19} color={PURPLE} /><Text style={styles.actionText}>Calendar</Text></TouchableOpacity>
          {!!event.externalUrl && <TouchableOpacity onPress={() => void Linking.openURL(event.externalUrl)} style={styles.actionButton}><Ionicons name="link-outline" size={19} color={PURPLE} /><Text style={styles.actionText}>Link</Text></TouchableOpacity>}
        </View>

        {event.viewerRole === 'host' && (
          <View style={styles.hostActions}>
            {!canceled && <TouchableOpacity disabled={busy !== null} onPress={() => setCancelVisible(true)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel event</Text></TouchableOpacity>}
            <TouchableOpacity disabled={busy !== null} onPress={confirmDelete} style={styles.deleteButton}>{busy === 'delete' ? <ActivityIndicator color="#B42318" /> : <Text style={styles.deleteText}>Delete</Text>}</TouchableOpacity>
          </View>
        )}
      </View>

      <Modal visible={inviteVisible} transparent animationType="slide" onRequestClose={() => setInviteVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Invite a friend</Text><Text style={styles.muted}>{event.locationType === 'custom_address' ? 'They will receive the address according to the host reveal setting.' : 'Choose from your GathR friends.'}</Text></View><TouchableOpacity onPress={() => setInviteVisible(false)} style={styles.iconButton}><Ionicons name="close" size={22} color="#344054" /></TouchableOpacity></View>
            <ScrollView contentContainerStyle={styles.friendList} showsVerticalScrollIndicator={false}>
              {inviteCandidates.map((friend) => (
                <TouchableOpacity disabled={busy !== null} key={friend.uid} onPress={() => void run(`invite-${friend.uid}`, async () => { await inviteToFriendEvent(eventId, friend.uid); setInviteVisible(false); })} style={styles.friendRow}>
                  <View style={styles.friendAvatar}><Text style={styles.friendInitial}>{friend.displayName.trim().charAt(0).toUpperCase()}</Text></View>
                  <View style={styles.flex}><Text style={styles.friendName}>{friend.displayName}</Text><Text style={styles.muted}>@{friend.socialHandle}</Text></View>
                  {busy === `invite-${friend.uid}` ? <ActivityIndicator color={PURPLE} /> : <Ionicons name="add-circle-outline" size={24} color={PURPLE} />}
                </TouchableOpacity>
              ))}
              {inviteCandidates.length === 0 && <View style={styles.modalEmpty}><Ionicons name="people-outline" size={30} color="#98A2B3" /><Text style={styles.muted}>All of your eligible friends are already invited.</Text></View>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={guestListVisible} transparent animationType="slide" onRequestClose={() => setGuestListVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Guest list</Text><Text style={styles.muted}>{event.guestListVisible ? 'Visible to invited guests' : 'Visible only to the host'}</Text></View><TouchableOpacity onPress={() => setGuestListVisible(false)} style={styles.iconButton}><Ionicons name="close" size={22} color="#344054" /></TouchableOpacity></View>
            <ScrollView contentContainerStyle={styles.friendList} showsVerticalScrollIndicator={false}>
              {(event.guests || []).map((guest) => {
                const inviter = guest.invitedByUid === event.hostUid
                  ? event.host.displayName
                  : (event.guests || []).find((candidate) => candidate.uid === guest.invitedByUid)?.displayName || 'a guest';
                return (
                  <View key={guest.uid} style={styles.friendRow}>
                    <View style={styles.friendAvatar}><Text style={styles.friendInitial}>{guest.displayName.trim().charAt(0).toUpperCase()}</Text></View>
                    <View style={styles.flex}><Text style={styles.friendName}>{guest.displayName}</Text><Text style={styles.muted}>{guest.response === 'invited' ? 'No response' : guest.response.replace('_', ' ')} · Invited by {inviter}</Text></View>
                    {event.viewerRole === 'host' && <TouchableOpacity disabled={busy !== null} onPress={() => confirmRemoveGuest(guest.uid, guest.displayName)} style={styles.removeGuestButton}>{busy === `remove-${guest.uid}` ? <ActivityIndicator color="#B42318" size="small" /> : <Ionicons name="person-remove-outline" size={19} color="#B42318" />}</TouchableOpacity>}
                  </View>
                );
              })}
              {(event.guests || []).length === 0 && <View style={styles.modalEmpty}><Text style={styles.muted}>No guests are invited yet.</Text></View>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={cancelVisible} transparent animationType="fade" onRequestClose={() => setCancelVisible(false)}>
        <View style={styles.centeredBackdrop}>
          <View style={styles.cancelDialog}>
            <View style={styles.cancelDialogIcon}><Ionicons name="calendar-clear-outline" size={25} color="#B42318" /></View>
            <Text style={styles.modalTitle}>Cancel this event?</Text>
            <Text style={styles.muted}>Guests will keep a canceled event card and see this explanation. Any private home address is revoked immediately.</Text>
            <TextInput value={cancelReason} onChangeText={setCancelReason} maxLength={300} multiline placeholder="Why is it canceled?" style={styles.cancelReasonInput} accessibilityLabel="Cancellation explanation" />
            <View style={styles.cancelDialogActions}>
              <TouchableOpacity onPress={() => setCancelVisible(false)} style={styles.keepButton}><Text style={styles.keepButtonText}>Keep event</Text></TouchableOpacity>
              <TouchableOpacity disabled={busy !== null || cancelReason.trim().length < 3} onPress={cancelEvent} style={[styles.confirmCancelButton, (busy !== null || cancelReason.trim().length < 3) && styles.disabled]}>{busy === 'cancel' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmCancelText}>Cancel event</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={historyVisible} transparent animationType="slide" onRequestClose={() => setHistoryVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Event updates</Text><Text style={styles.muted}>Material changes from the host</Text></View><TouchableOpacity onPress={() => setHistoryVisible(false)} style={styles.iconButton}><Ionicons name="close" size={22} color="#344054" /></TouchableOpacity></View>
            <ScrollView contentContainerStyle={styles.friendList} showsVerticalScrollIndicator={false}>
              {[...(event.updateHistory || [])].reverse().map((entry) => (
                <View key={entry.revision} style={styles.historyRow}>
                  <View style={styles.historyDot} />
                  <View style={styles.flex}><Text style={styles.friendName}>{entry.summary}</Text><Text style={styles.muted}>{entry.at ? formatFriendEventDate(entry.at) : ''}</Text></View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#F6F8FB' },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, backgroundColor: '#FFFFFF' },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#101828', fontSize: 18, fontWeight: '900' },
  headerAction: { minWidth: 50, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  headerActionText: { color: PURPLE, fontWeight: '900' },
  content: { flex: 1, minHeight: 0, gap: 9, padding: 10 },
  hero: { minHeight: 130, overflow: 'hidden', justifyContent: 'flex-end', padding: 16, borderRadius: 20, backgroundColor: PURPLE },
  heroOrbLarge: { position: 'absolute', width: 150, height: 150, borderRadius: 75, top: -76, right: -25, backgroundColor: 'rgba(255,255,255,0.13)' },
  heroOrbSmall: { position: 'absolute', width: 80, height: 80, borderRadius: 40, top: 30, right: 54, backgroundColor: 'rgba(255,255,255,0.08)' },
  categoryPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: 5 },
  categoryText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  title: { color: '#FFFFFF', fontSize: 23, lineHeight: 27, fontWeight: '900' },
  hostLine: { color: '#E9D7FE', fontSize: 11, marginTop: 3 },
  canceledPill: { position: 'absolute', right: 12, bottom: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99, backgroundColor: '#FEE4E2' },
  canceledPillText: { color: '#B42318', fontSize: 9, fontWeight: '900' },
  infoCard: { paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#FFFFFF', shadowColor: '#101828', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  infoRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 9 },
  infoIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4EBFF' },
  infoTitle: { color: '#344054', fontSize: 13, fontWeight: '800' },
  muted: { color: '#667085', fontSize: 11, lineHeight: 15 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 43, backgroundColor: '#E4E7EC' },
  description: { color: '#475467', fontSize: 12, lineHeight: 17, paddingHorizontal: 6 },
  cancellationReason: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 13, backgroundColor: '#FEF3F2' },
  cancellationReasonText: { flex: 1, color: '#B42318', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  historyPreview: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#F9F5FF' },
  historyPreviewText: { flex: 1, color: '#53389E', fontSize: 11, fontWeight: '700' },
  rsvpCard: { gap: 7, padding: 11, borderRadius: 16, backgroundColor: '#FFFFFF' },
  sectionTitle: { color: '#344054', fontSize: 13, fontWeight: '900' },
  rsvpRow: { flexDirection: 'row', gap: 6 },
  rsvpButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 11, backgroundColor: '#F2F4F7' },
  rsvpButtonActive: { backgroundColor: '#F4EBFF', borderWidth: 1, borderColor: '#B692F6' },
  rsvpText: { color: '#667085', fontSize: 11, fontWeight: '800' },
  rsvpTextActive: { color: '#53389E' },
  hostStats: { minHeight: 58, flexDirection: 'row', borderRadius: 16, backgroundColor: '#FFFFFF' },
  statsChevron: { alignSelf: 'center', marginRight: 8 },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statNumber: { color: '#344054', fontSize: 18, fontWeight: '900' },
  statLabel: { color: '#667085', fontSize: 10 },
  guestListPreview: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderRadius: 13, backgroundColor: '#FFFFFF' },
  guestAvatarStack: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4EBFF' },
  guestListPreviewText: { flex: 1, color: '#53389E', fontSize: 11, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 7 },
  actionButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 13, backgroundColor: '#F4EBFF' },
  actionText: { color: '#53389E', fontSize: 11, fontWeight: '900' },
  lockedAction: { backgroundColor: '#F2F4F7' },
  lockedActionText: { color: '#667085', fontSize: 11, fontWeight: '800' },
  hostActions: { flexDirection: 'row', gap: 7, marginTop: 'auto' },
  cancelButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFF4ED' },
  cancelText: { color: '#B54708', fontWeight: '800' },
  deleteButton: { minWidth: 90, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FEE4E2' },
  deleteText: { color: '#B42318', fontWeight: '800' },
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
  unavailableTitle: { color: '#101828', fontSize: 19, fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.48)' },
  centeredBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(16,24,40,0.58)' },
  cancelDialog: { width: '100%', maxWidth: 420, gap: 11, padding: 18, borderRadius: 22, backgroundColor: '#FFFFFF' },
  cancelDialogIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#FEE4E2' },
  cancelReasonInput: { minHeight: 82, padding: 11, borderWidth: 1, borderColor: '#FDA29B', borderRadius: 12, color: '#101828', textAlignVertical: 'top', backgroundColor: '#FFFBFA' },
  cancelDialogActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  keepButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F2F4F7' },
  keepButtonText: { color: '#475467', fontWeight: '800' },
  confirmCancelButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#B42318' },
  confirmCancelText: { color: '#FFFFFF', fontWeight: '900' },
  disabled: { opacity: 0.45 },
  modalSheet: { maxHeight: '80%', minHeight: 320, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 30 : 18, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF' },
  modalHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  modalTitle: { color: '#101828', fontSize: 20, fontWeight: '900' },
  friendList: { paddingBottom: 10 },
  friendRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0' },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4EBFF' },
  friendInitial: { color: PURPLE, fontWeight: '900' },
  friendName: { color: '#344054', fontWeight: '800' },
  removeGuestButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FEF3F2' },
  historyRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0' },
  historyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: PURPLE },
  modalEmpty: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 20 },
});
