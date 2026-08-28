import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
    <View style={styles.personRow} accessibilityLabel={`${person.displayName}, @${person.socialHandle}`}>
      <Avatar profile={person} />
      <View style={styles.personText}>
        <Text style={styles.personName}>{person.displayName}</Text>
        <Text style={styles.handleText}>@{person.socialHandle || 'handle pending'}</Text>
      </View>
      <View style={styles.rowActions}>{children}</View>
    </View>
  );
}

export default function FriendsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { friends, requests, blocks, loading, fromCache, error } = useSocialStore();
  const [handle, setHandle] = useState('');
  const [claimedHandle, setClaimedHandle] = useState('');
  const [search, setSearch] = useState('');
  const [searchResult, setSearchResult] = useState<SocialProfile | null>(null);
  const [searchComplete, setSearchComplete] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const incoming = useMemo(
    () => requests.filter((request) => request.direction === 'incoming'),
    [requests]
  );
  const outgoing = useMemo(
    () => requests.filter((request) => request.direction === 'outgoing'),
    [requests]
  );

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
    } catch (actionError) {
      Alert.alert('Could not complete action', displayError(actionError));
    } finally {
      setBusyKey(null);
    }
  };

  const submitHandle = () => run('handle', async () => {
    const profile = await claimSocialHandle(handle);
    setClaimedHandle(profile.socialHandle);
    setHandle(profile.socialHandle);
  }, 'Your GathR handle is ready.');

  const findPerson = () => run('search', async () => {
    setSearchComplete(false);
    const found = await searchUserByHandle(search);
    setSearchResult(found);
    setSearchComplete(true);
  });

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
            <Text style={styles.subtitle}>Presence is shared only after both people accept.</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {fromCache && <Text style={styles.offlineBanner}>Showing saved social data while offline.</Text>}
          {!!error && <Text style={styles.errorBanner}>{error}</Text>}
          <SocialDiagnosticsPanel />

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Your GathR handle</Text>
            <Text style={styles.muted}>People search for this exact handle. Your email is never shown.</Text>
            <View style={styles.inputRow}>
              <Text style={styles.atSign}>@</Text>
              <TextInput
                value={handle}
                onChangeText={setHandle}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={25}
                placeholder="craig_pei"
                accessibilityLabel="GathR handle"
                style={styles.input}
              />
              <TouchableOpacity
                accessibilityLabel={claimedHandle ? 'Update GathR handle' : 'Claim GathR handle'}
                disabled={busyKey !== null}
                onPress={() => void submitHandle()}
                style={styles.smallPrimaryButton}
              >
                {busyKey === 'handle' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.smallPrimaryText}>{claimedHandle ? 'Update' : 'Claim'}</Text>}
              </TouchableOpacity>
            </View>
            {!!claimedHandle && <Text style={styles.successText}>Active: @{claimedHandle}</Text>}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Find someone</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={search}
                onChangeText={(value) => { setSearch(value); setSearchComplete(false); }}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Exact handle"
                accessibilityLabel="Search exact GathR handle"
                onSubmitEditing={() => void findPerson()}
                style={[styles.input, styles.searchInput]}
              />
              <TouchableOpacity disabled={busyKey !== null} onPress={() => void findPerson()} style={styles.smallPrimaryButton}>
                {busyKey === 'search' ? <ActivityIndicator color="#FFF" /> : <Ionicons name="search" size={19} color="#FFF" />}
              </TouchableOpacity>
            </View>
            {searchResult && (
              <PersonRow person={searchResult}>
                <TouchableOpacity
                  accessibilityLabel={`Send friend request to ${searchResult.displayName}`}
                  onPress={() => void run(`add-${searchResult.uid}`, () => sendFriendRequest(searchResult.uid))}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionText}>Add</Text>
                </TouchableOpacity>
              </PersonRow>
            )}
            {searchComplete && !searchResult && <Text style={styles.emptyText}>No available account has that exact handle.</Text>}
          </View>

          {loading && <ActivityIndicator size="large" color={BRAND} />}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Requests ({incoming.length})</Text>
            {incoming.length === 0 && <Text style={styles.emptyText}>No incoming requests.</Text>}
            {incoming.map((request: FriendRequestProjection) => (
              <PersonRow key={request.uid} person={request}>
                <TouchableOpacity accessibilityLabel={`Accept ${request.displayName}`} onPress={() => void run(`accept-${request.uid}`, () => acceptFriendRequest(request.uid))} style={styles.actionButton}>
                  <Ionicons name="checkmark" size={18} color={BRAND} />
                </TouchableOpacity>
                <TouchableOpacity accessibilityLabel={`Decline ${request.displayName}`} onPress={() => void run(`decline-${request.uid}`, () => declineFriendRequest(request.uid))} style={styles.actionButton}>
                  <Ionicons name="close" size={18} color="#B42318" />
                </TouchableOpacity>
              </PersonRow>
            ))}
            {outgoing.map((request) => (
              <PersonRow key={request.uid} person={request}>
                <TouchableOpacity accessibilityLabel={`Cancel request to ${request.displayName}`} onPress={() => void run(`cancel-${request.uid}`, () => cancelFriendRequest(request.uid))} style={styles.actionButton}>
                  <Text style={styles.actionText}>Cancel</Text>
                </TouchableOpacity>
              </PersonRow>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Friends ({friends.length})</Text>
            {friends.length === 0 && <Text style={styles.emptyText}>Accepted friends will appear here.</Text>}
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
          </View>

          {blocks.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Blocked accounts</Text>
              {blocks.map((block) => (
                <View key={block.blockedUid} style={styles.personRow}>
                  <Text style={[styles.personText, styles.blockedText]} numberOfLines={1}>Account {block.blockedUid.slice(0, 8)}</Text>
                  <TouchableOpacity onPress={() => void run(`unblock-${block.blockedUid}`, () => unblockUser(block.blockedUid))} style={styles.actionButton}>
                    <Text style={styles.actionText}>Unblock</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F8FB' },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D0D5DD' },
  headerText: { flex: 1 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  title: { fontSize: 25, fontWeight: '800', color: '#101828' },
  subtitle: { marginTop: 2, color: '#667085', lineHeight: 19 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E4E7EC' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#101828' },
  muted: { color: '#667085', lineHeight: 20, textAlign: 'left' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  atSign: { fontSize: 20, color: '#475467' },
  input: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 10, paddingHorizontal: 12, color: '#101828', backgroundColor: '#FFF' },
  searchInput: { marginLeft: 0 },
  primaryButton: { backgroundColor: BRAND, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 11 },
  primaryButtonText: { color: '#FFF', fontWeight: '700' },
  smallPrimaryButton: { minWidth: 54, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: BRAND },
  smallPrimaryText: { color: '#FFF', fontWeight: '700' },
  successText: { color: '#067647', fontWeight: '600' },
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
  actionText: { color: '#175CD3', fontWeight: '700' },
  emptyText: { color: '#667085', fontStyle: 'italic', paddingVertical: 5 },
  offlineBanner: { backgroundColor: '#FFF4CC', color: '#7A5D00', padding: 10, borderRadius: 10 },
  errorBanner: { backgroundColor: '#FEE4E2', color: '#B42318', padding: 10, borderRadius: 10 },
  blockedText: { color: '#475467' },
});
