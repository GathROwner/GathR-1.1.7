import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SocialDiagnosticsPanel } from '../components/social/SocialDiagnosticsPanel';
import { firestore } from '../config/firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  claimSocialHandle,
  declineFriendRequest,
  normalizeSocialHandle,
  removeFriend,
  reportUser,
  searchUserByHandle,
  sendFriendRequest,
  SocialServiceError,
  unblockUser,
} from '../services/socialService';
import { useSocialStore } from '../store/socialStore';
import type { FriendProjection, FriendRequestProjection, SocialProfile } from '../types/social';
import { SOCIAL_FEATURE_ENABLED } from '../types/social';

const BRAND = '#2F80ED';
type RelationshipSection = 'requests' | 'friends' | 'blocked';

function displayError(error: unknown) {
  return error instanceof SocialServiceError || error instanceof Error
    ? error.message
    : 'The action could not be completed.';
}

function Avatar({ profile }: { profile: Pick<SocialProfile, 'displayName' | 'photoURL'> }) {
  const initial = profile.displayName.trim().charAt(0).toUpperCase() || '?';
  return profile.photoURL ? (
    <Image source={{ uri: profile.photoURL }} style={styles.avatarImage} />
  ) : (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitial}>{initial}</Text>
    </View>
  );
}

function PersonRow({
  person,
  children,
}: {
  person: Pick<SocialProfile, 'uid' | 'displayName' | 'photoURL' | 'socialHandle'>;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.personRow}>
      <Avatar profile={person} />
      <View
        accessible
        style={styles.personText}
        accessibilityLabel={`${person.displayName}${person.socialHandle ? `, @${person.socialHandle}` : ''}`}
      >
        <Text numberOfLines={2} style={styles.personName}>{person.displayName}</Text>
        <Text maxFontSizeMultiplier={1.1} numberOfLines={2} style={styles.handleText}>
          {person.socialHandle ? `@${person.socialHandle}` : 'GathR member'}
        </Text>
      </View>
      <View style={styles.rowActions}>{children}</View>
    </View>
  );
}

export default function FriendsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ handle?: string }>();
  const { user } = useAuth();
  const currentUid = user?.uid || '';
  const { friends, requests, blocks, loading, fromCache, error } = useSocialStore();
  const [handle, setHandle] = useState('');
  const [claimedHandle, setClaimedHandle] = useState('');
  const [search, setSearch] = useState('');
  const [searchResult, setSearchResult] = useState<SocialProfile | null>(null);
  const [searchComplete, setSearchComplete] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [handleModalVisible, setHandleModalVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<RelationshipSection>('friends');
  const handledLinkRef = useRef('');

  const incoming = useMemo(
    () => requests.filter((request) => request.direction === 'incoming'),
    [requests]
  );
  const outgoing = useMemo(
    () => requests.filter((request) => request.direction === 'outgoing'),
    [requests]
  );
  const normalizedHandle = normalizeSocialHandle(handle);
  const normalizedSearch = normalizeSocialHandle(search);
  const canSaveHandle = /^[a-z0-9_]{3,24}$/.test(normalizedHandle)
    && normalizedHandle !== claimedHandle;
  const canSearch = /^[a-z0-9_]{3,24}$/.test(normalizedSearch);
  const searchRelationship = useMemo(() => {
    if (!searchResult) return null;
    if (searchResult.uid === currentUid) return 'self';
    if (friends.some((friend) => friend.uid === searchResult.uid)) return 'friend';
    if (incoming.some((request) => request.uid === searchResult.uid)) return 'incoming';
    if (outgoing.some((request) => request.uid === searchResult.uid)) return 'outgoing';
    return 'available';
  }, [currentUid, friends, incoming, outgoing, searchResult]);

  useEffect(() => {
    if (!user) return;
    void getDoc(doc(firestore, 'users', user.uid)).then((snapshot) => {
      const current = String(snapshot.data()?.socialHandle || '');
      setClaimedHandle(current);
      setHandle(current);
    }).catch(() => undefined);
  }, [user]);

  const run = async (key: string, operation: () => Promise<unknown>, success?: string) => {
    setBusyKey(key);
    try {
      await operation();
      if (success) Alert.alert('Done', success);
      return true;
    } catch (actionError) {
      Alert.alert('Could not complete action', displayError(actionError));
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const submitHandle = async () => {
    const completed = await run('handle', async () => {
    const profile = await claimSocialHandle(handle);
    setClaimedHandle(profile.socialHandle);
    setHandle(profile.socialHandle);
    }, 'Your GathR handle is ready.');
    if (completed) setHandleModalVisible(false);
  };

  const findPerson = () => run('search', async () => {
    setSearchComplete(false);
    const found = await searchUserByHandle(search);
    setSearchResult(found);
    setSearchComplete(true);
  });

  useEffect(() => {
    const linkedHandle = normalizeSocialHandle(params.handle || '');
    if (!/^[a-z0-9_]{3,24}$/.test(linkedHandle) || handledLinkRef.current === linkedHandle) return;
    handledLinkRef.current = linkedHandle;
    setSearch(linkedHandle);
    setActiveSection('requests');
    void run('search', async () => {
      const found = await searchUserByHandle(linkedHandle);
      setSearchResult(found);
      setSearchComplete(true);
    });
  }, [params.handle]);

  const profileLink = claimedHandle
    ? `https://www.gathrapp.ca/app/?friend=${encodeURIComponent(claimedHandle)}`
    : '';

  const shareProfile = () => {
    if (!profileLink) return;
    void Share.share({
      title: 'Add me on GathR',
      message: `Add me on GathR: @${claimedHandle}\n${profileLink}`,
      url: profileLink,
    });
  };

  const sendRequest = (person: SocialProfile) => run(
    `add-${person.uid}`,
    () => sendFriendRequest(person.uid),
    `Friend request sent to ${person.displayName}.`
  );

  const confirmRemove = (friend: FriendProjection) => Alert.alert(
    `Remove ${friend.displayName}?`,
    'You will immediately stop seeing each other’s check-ins.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void run(`remove-${friend.uid}`, () => removeFriend(friend.uid)) },
    ]
  );

  const confirmBlock = (person: Pick<SocialProfile, 'uid' | 'displayName'>) => Alert.alert(
    `Block ${person.displayName}?`,
    'This removes any friendship or request and hides check-ins in both directions.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => void run(`block-${person.uid}`, () => blockUser(person.uid)) },
    ]
  );

  const chooseReportReason = (person: Pick<SocialProfile, 'uid' | 'displayName'>) => Alert.alert(
    `Report ${person.displayName}`,
    'Choose the closest reason. Reports do not automatically block the account.',
    [
      { text: 'Spam', onPress: () => void run(`report-${person.uid}`, () => reportUser(person.uid, 'spam'), 'Report submitted.') },
      { text: 'Harassment', onPress: () => void run(`report-${person.uid}`, () => reportUser(person.uid, 'harassment'), 'Report submitted.') },
      { text: 'Privacy', onPress: () => void run(`report-${person.uid}`, () => reportUser(person.uid, 'privacy'), 'Report submitted.') },
      { text: 'Cancel', style: 'cancel' },
    ]
  );

  if (!SOCIAL_FEATURE_ENABLED) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" backgroundColor="#F6F8FB" />
        <View style={styles.centered}>
          <Text style={styles.title}>Friends</Text>
          <Text style={styles.muted}>This build does not have the social preview enabled.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" backgroundColor="#F6F8FB" />
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={48} color={BRAND} />
          <Text style={styles.title}>Sign in to add friends</Text>
          <Text style={styles.muted}>Guest sessions never start friend or check-in listeners.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/')}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Friends</Text>
            <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={styles.subtitle}>Connect first. Check-ins stay optional.</Text>
          </View>
        </View>

        <View style={styles.content}>
          {fromCache && <Text maxFontSizeMultiplier={1.15} numberOfLines={2} style={styles.offlineBanner}>Showing saved social data while offline.</Text>}
          {!!error && <Text maxFontSizeMultiplier={1.15} numberOfLines={2} style={styles.errorBanner}>{error}</Text>}
          <SocialDiagnosticsPanel />

          <View style={styles.handleCard}>
            <View style={styles.handleSummary}>
              <Text maxFontSizeMultiplier={1.15} style={styles.eyebrow}>YOUR HANDLE</Text>
              <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={styles.claimedHandle}>
                {claimedHandle ? `@${claimedHandle}` : 'Claim a searchable handle'}
              </Text>
            </View>
            <View style={styles.handleActions}>
              {claimedHandle && (
                <TouchableOpacity accessibilityLabel="Show friend QR code" accessibilityRole="button" onPress={() => setShareModalVisible(true)} style={styles.compactButton}>
                  <Ionicons name="qr-code-outline" size={18} color="#6941C6" />
                  <Text maxFontSizeMultiplier={1.1} style={styles.shareActionText}>Share</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                accessibilityLabel={claimedHandle ? 'Edit GathR handle' : 'Claim GathR handle'}
                accessibilityRole="button"
                onPress={() => setHandleModalVisible(true)}
                style={styles.compactButton}
              >
                <Ionicons name={claimedHandle ? 'pencil' : 'add'} size={17} color="#175CD3" />
                <Text maxFontSizeMultiplier={1.1} style={styles.actionText}>{claimedHandle ? 'Edit' : 'Claim'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.searchCard}>
            <View style={styles.inputRow}>
              <Ionicons name="search" size={19} color="#667085" />
              <TextInput
                value={search}
                onChangeText={(value) => { setSearch(value); setSearchComplete(false); setSearchResult(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Find exact @handle"
                accessibilityLabel="Search exact GathR handle"
                onSubmitEditing={() => { if (canSearch) void findPerson(); }}
                style={[styles.input, styles.searchInput]}
              />
              <TouchableOpacity
                accessibilityLabel="Search for GathR handle"
                accessibilityRole="button"
                disabled={busyKey !== null || !canSearch}
                onPress={() => void findPerson()}
                style={[styles.smallPrimaryButton, (busyKey !== null || !canSearch) && styles.disabled]}
              >
                {busyKey === 'search' ? <ActivityIndicator color="#FFF" /> : <Text maxFontSizeMultiplier={1.1} style={styles.smallPrimaryText}>Find</Text>}
              </TouchableOpacity>
            </View>
            {searchResult && (
              <PersonRow person={searchResult}>
                {searchRelationship === 'available' && (
                  <TouchableOpacity
                    accessibilityLabel={`Send friend request to ${searchResult.displayName}`}
                    accessibilityRole="button"
                    onPress={() => void sendRequest(searchResult)}
                    style={styles.actionButton}
                  >
                    <Text style={styles.actionText}>Add</Text>
                  </TouchableOpacity>
                )}
                {searchRelationship !== 'available' && (
                  <Text maxFontSizeMultiplier={1.1} style={styles.relationshipLabel}>
                    {searchRelationship === 'self' && 'This is you'}
                    {searchRelationship === 'friend' && 'Friends'}
                    {searchRelationship === 'incoming' && 'Respond in Requests'}
                    {searchRelationship === 'outgoing' && 'Request sent'}
                  </Text>
                )}
              </PersonRow>
            )}
            {searchComplete && !searchResult && <Text maxFontSizeMultiplier={1.15} numberOfLines={2} style={styles.emptyText}>No account has that exact handle.</Text>}
          </View>

          <View style={styles.relationshipCard}>
            <View accessible={false} style={styles.tabRow}>
              {([
                ['requests', 'Requests', incoming.length],
                ['friends', 'Friends', friends.length],
                ['blocked', 'Blocked', blocks.length],
              ] as const).map(([section, label, count]) => (
                <TouchableOpacity
                  key={section}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activeSection === section }}
                  accessibilityLabel={`${label}, ${count}`}
                  onPress={() => setActiveSection(section)}
                  style={[styles.tab, activeSection === section && styles.tabSelected]}
                >
                  <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={[styles.tabText, activeSection === section && styles.tabTextSelected]}>{label}</Text>
                  <View style={[styles.countBadge, activeSection === section && styles.countBadgeSelected]}>
                    <Text maxFontSizeMultiplier={1} style={[styles.countText, activeSection === section && styles.countTextSelected]}>{count}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {loading ? (
              <View style={styles.listEmpty}><ActivityIndicator size="large" color={BRAND} /></View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.relationshipList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.relationshipScroller}
              >
                {activeSection === 'requests' && (
                  <>
                    {incoming.length > 0 && <Text style={styles.groupLabel}>RECEIVED</Text>}
                    {incoming.map((request: FriendRequestProjection) => (
                      <PersonRow key={request.uid} person={request}>
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Accept ${request.displayName}`} onPress={() => void run(`accept-${request.uid}`, () => acceptFriendRequest(request.uid))} style={styles.acceptButton}>
                          <Text maxFontSizeMultiplier={1.1} style={styles.acceptText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Decline ${request.displayName}`} onPress={() => void run(`decline-${request.uid}`, () => declineFriendRequest(request.uid))} style={styles.iconActionButton}>
                          <Ionicons name="close" size={18} color="#B42318" />
                        </TouchableOpacity>
                      </PersonRow>
                    ))}
                    {outgoing.length > 0 && <Text style={styles.groupLabel}>SENT</Text>}
                    {outgoing.map((request) => (
                      <PersonRow key={request.uid} person={request}>
                        <TouchableOpacity accessibilityLabel={`Cancel request to ${request.displayName}`} onPress={() => void run(`cancel-${request.uid}`, () => cancelFriendRequest(request.uid))} style={styles.actionButton}>
                          <Text maxFontSizeMultiplier={1.1} style={styles.actionText}>Cancel</Text>
                        </TouchableOpacity>
                      </PersonRow>
                    ))}
                    {incoming.length === 0 && outgoing.length === 0 && (
                      <View style={styles.listEmpty}>
                        <Ionicons name="mail-open-outline" size={32} color="#98A2B3" />
                        <Text style={styles.emptyText}>No pending requests.</Text>
                      </View>
                    )}
                  </>
                )}

                {activeSection === 'friends' && (
                  <>
                    {friends.map((friend) => (
                      <PersonRow key={friend.uid} person={friend}>
                        <TouchableOpacity accessibilityLabel={`More actions for ${friend.displayName}`} onPress={() => Alert.alert(friend.displayName, undefined, [
                          { text: 'Remove friend', style: 'destructive', onPress: () => confirmRemove(friend) },
                          { text: 'Block', style: 'destructive', onPress: () => confirmBlock(friend) },
                          { text: 'Report', onPress: () => chooseReportReason(friend) },
                          { text: 'Cancel', style: 'cancel' },
                        ])} style={styles.actionButton}>
                          <Ionicons name="ellipsis-horizontal" size={20} color="#344054" />
                        </TouchableOpacity>
                      </PersonRow>
                    ))}
                    {friends.length === 0 && (
                      <View style={styles.listEmpty}>
                        <Ionicons name="people-outline" size={34} color="#98A2B3" />
                        <Text style={styles.emptyText}>Accepted friends will appear here.</Text>
                      </View>
                    )}
                  </>
                )}

                {activeSection === 'blocked' && (
                  <>
                    {blocks.map((block) => (
                      <PersonRow key={block.blockedUid} person={{ ...block, uid: block.blockedUid }}>
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Unblock ${block.displayName}`} onPress={() => void run(`unblock-${block.blockedUid}`, () => unblockUser(block.blockedUid))} style={styles.actionButton}>
                          <Text maxFontSizeMultiplier={1.1} style={styles.actionText}>Unblock</Text>
                        </TouchableOpacity>
                      </PersonRow>
                    ))}
                    {blocks.length === 0 && (
                      <View style={styles.listEmpty}>
                        <Ionicons name="shield-checkmark-outline" size={34} color="#98A2B3" />
                        <Text style={styles.emptyText}>No blocked accounts.</Text>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal animationType="fade" onRequestClose={() => setHandleModalVisible(false)} transparent visible={handleModalVisible}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <View style={styles.modalHeading}>
              <View style={styles.flex}>
                <Text style={styles.sectionTitle}>{claimedHandle ? 'Edit your handle' : 'Claim your handle'}</Text>
                <Text maxFontSizeMultiplier={1.15} style={styles.muted}>Friends must enter it exactly. Your email stays private.</Text>
              </View>
              <TouchableOpacity accessibilityLabel="Close handle editor" onPress={() => { setHandle(claimedHandle); setHandleModalVisible(false); }} style={styles.iconButton}>
                <Ionicons name="close" size={23} color="#344054" />
              </TouchableOpacity>
            </View>
            <View style={styles.handleInputRow}>
              <Text style={styles.atSign}>@</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={25}
                onChangeText={setHandle}
                onSubmitEditing={() => { if (canSaveHandle) void submitHandle(); }}
                placeholder="craig_pei"
                accessibilityLabel="GathR handle"
                style={styles.modalInput}
                value={handle}
              />
            </View>
            <Text maxFontSizeMultiplier={1.15} style={styles.helperText}>3–24 letters, numbers, or underscores.</Text>
            <TouchableOpacity
              accessibilityLabel={claimedHandle ? 'Save GathR handle' : 'Claim GathR handle'}
              accessibilityRole="button"
              disabled={busyKey !== null || !canSaveHandle}
              onPress={() => void submitHandle()}
              style={[styles.primaryButton, (busyKey !== null || !canSaveHandle) && styles.disabled]}
            >
              {busyKey === 'handle' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>{claimedHandle ? 'Save handle' : 'Claim handle'}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setShareModalVisible(false)} transparent visible={shareModalVisible}>
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={[styles.modalCard, styles.qrCard]}>
            <TouchableOpacity accessibilityLabel="Close QR code" onPress={() => setShareModalVisible(false)} style={styles.qrClose}>
              <Ionicons name="close" size={23} color="#344054" />
            </TouchableOpacity>
            <View style={styles.qrMark}><Ionicons name="people" size={23} color="#FFFFFF" /></View>
            <Text style={styles.qrTitle}>Add me on GathR</Text>
            <Text style={styles.qrHandle}>@{claimedHandle}</Text>
            {!!profileLink && <View style={styles.qrCode}><QRCode value={profileLink} size={188} color="#101828" backgroundColor="#FFFFFF" /></View>}
            <Text style={styles.qrHelp}>Scan this code or share the secure profile link.</Text>
            <TouchableOpacity onPress={shareProfile} style={styles.primaryButton}>
              <Ionicons name="share-outline" size={19} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Share link</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F8FB' },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D0D5DD' },
  headerText: { flex: 1, minWidth: 0 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  title: { fontSize: 24, fontWeight: '800', color: '#101828' },
  subtitle: { marginTop: 1, color: '#667085', lineHeight: 18 },
  content: { flex: 1, padding: 12, gap: 10, minHeight: 0 },
  handleCard: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E4E7EC' },
  handleSummary: { flex: 1, minWidth: 0 },
  handleActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { color: '#667085', fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  claimedHandle: { color: '#101828', fontSize: 17, fontWeight: '700', marginTop: 1 },
  compactButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#EFF8FF' },
  searchCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 10, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E4E7EC' },
  relationshipCard: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: '#FFF', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E4E7EC' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#101828' },
  muted: { color: '#667085', lineHeight: 19, textAlign: 'left' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  atSign: { fontSize: 20, color: '#475467' },
  input: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 10, paddingHorizontal: 12, color: '#101828', backgroundColor: '#FFF' },
  searchInput: { borderWidth: 0, paddingHorizontal: 0, minHeight: 42 },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: BRAND, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 11 },
  primaryButtonText: { color: '#FFF', fontWeight: '700' },
  smallPrimaryButton: { minWidth: 54, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: BRAND },
  smallPrimaryText: { color: '#FFF', fontWeight: '700' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0' },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarImage: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { backgroundColor: '#DCEBFF', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 17, fontWeight: '800', color: '#175CD3' },
  personText: { flex: 1, minWidth: 0 },
  personName: { fontWeight: '700', color: '#101828' },
  handleText: { color: '#667085', marginTop: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionButton: { minWidth: 42, minHeight: 42, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#F2F4F7' },
  iconActionButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#FEF3F2' },
  acceptButton: { minHeight: 42, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#EFF8FF' },
  acceptText: { color: '#175CD3', fontWeight: '700' },
  actionText: { color: '#175CD3', fontWeight: '700' },
  relationshipLabel: { color: '#475467', fontWeight: '700', textAlign: 'right' },
  tabRow: { flexDirection: 'row', gap: 5, padding: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECF0', backgroundColor: '#F9FAFB' },
  tab: { flex: 1, minWidth: 0, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 5, borderRadius: 10 },
  tabSelected: { backgroundColor: '#EAF3FF' },
  tabText: { flexShrink: 1, color: '#667085', fontWeight: '700' },
  tabTextSelected: { color: '#175CD3' },
  countBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#EAECF0' },
  countBadgeSelected: { backgroundColor: '#B2DDFF' },
  countText: { color: '#475467', fontSize: 11, fontWeight: '800' },
  countTextSelected: { color: '#175CD3' },
  relationshipScroller: { flex: 1, minHeight: 0 },
  relationshipList: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 10 },
  groupLabel: { color: '#667085', fontSize: 12, fontWeight: '800', letterSpacing: 0.7, marginTop: 10, marginBottom: 2 },
  listEmpty: { flex: 1, minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18 },
  emptyText: { color: '#667085', fontStyle: 'italic', paddingVertical: 4, textAlign: 'center' },
  offlineBanner: { backgroundColor: '#FFF4CC', color: '#7A5D00', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  errorBanner: { backgroundColor: '#FEE4E2', color: '#B42318', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(16, 24, 40, 0.48)' },
  modalCard: { gap: 14, padding: 18, borderRadius: 18, backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 8 },
  modalHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  handleInputRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: '#98A2B3', borderRadius: 11, paddingHorizontal: 12 },
  modalInput: { flex: 1, minHeight: 50, color: '#101828', fontSize: 17 },
  shareActionText: { color: '#6941C6', fontWeight: '800' },
  qrCard: { alignItems: 'center', paddingTop: 24 },
  qrClose: { position: 'absolute', right: 10, top: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  qrMark: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6941C6' },
  qrTitle: { color: '#101828', fontSize: 22, fontWeight: '900' },
  qrHandle: { color: '#6941C6', fontSize: 16, fontWeight: '800', marginTop: -8 },
  qrCode: { padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#EAECF0', backgroundColor: '#FFFFFF' },
  qrHelp: { color: '#667085', textAlign: 'center', lineHeight: 19 },
  helperText: { color: '#667085', fontSize: 13, lineHeight: 18 },
  disabled: { opacity: 0.45 },
});
