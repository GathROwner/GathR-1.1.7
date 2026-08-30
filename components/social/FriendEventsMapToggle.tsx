import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useMapStore } from '../../store/mapStore';
import { useSocialStore } from '../../store/socialStore';
import { useUserPrefsStore } from '../../store/userPrefsStore';
import type { FriendActivityProjection } from '../../types/social';
import { SOCIAL_RELEASE_TWO_ENABLED } from '../../types/social';
import {
  buildFriendDestinations,
  firstName,
  formatFriendDestinationTime,
  formatFriendsHere,
  type FriendDestination,
} from '../../utils/friendDestinations';
import { getLightboxImageUrl } from '../../utils/lightboxImageUrl';
import FallbackImage from '../common/FallbackImage';

const CARD_WIDTH = 282;
const CARD_HEIGHT = 142;

const FriendAvatar = ({ friend, index }: { friend: FriendActivityProjection; index: number }) => {
  const initial = firstName(friend.displayName).slice(0, 1).toUpperCase();
  return (
    <View style={[styles.avatarShell, { marginLeft: index === 0 ? 0 : -8, zIndex: 5 - index }]}>
      {friend.photoURL ? (
        <Image source={{ uri: friend.photoURL }} style={styles.avatarImage} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
      )}
    </View>
  );
};

const kindLabel = (destination: FriendDestination): string => {
  if (destination.kind === 'private_invitation') return 'PRIVATE · INVITED';
  if (destination.kind === 'private_hosted') return 'YOUR PRIVATE EVENT';
  if (destination.kind === 'public_event') return 'PUBLIC EVENT';
  return 'VENUE CHECK-IN';
};

const DestinationCard = memo(({
  destination,
  onPress,
}: {
  destination: FriendDestination;
  onPress: () => void;
}) => {
  const item = destination.event;
  const isPrivate = destination.kind === 'private_invitation' || destination.kind === 'private_hosted';
  return (
    <TouchableOpacity
      accessibilityLabel={`${formatFriendsHere(destination.friends)} at ${destination.venueName}. ${item ? item.title : 'Venue check-in'}`}
      accessibilityRole="button"
      activeOpacity={0.88}
      onPress={onPress}
      style={[styles.card, isPrivate && styles.privateCard]}
    >
      <View style={styles.hero}>
        <FallbackImage
          imageUrl={item?.imageUrl || item?.SharedPostThumbnail || item?.profileUrl || ''}
          category={item?.category || 'Gatherings'}
          type={item?.type || 'event'}
          style={styles.heroImage}
          fallbackType="post"
          item={item}
          resizeMode="cover"
        />
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>{destination.friendCount} HERE</Text>
        </View>
      </View>

      <View style={styles.cardCopy}>
        <Text style={[styles.kind, isPrivate && styles.privateKind]} numberOfLines={1}>
          {kindLabel(destination)}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {item?.title || destination.venueName}
        </Text>
        {item && (
          <Text style={styles.venue} numberOfLines={1}>{destination.venueName}</Text>
        )}
        <View style={styles.timeRow}>
          <MaterialIcons name="schedule" size={13} color="#6941C6" />
          <Text style={styles.time}>{formatFriendDestinationTime(item)}</Text>
        </View>
        <View style={styles.friendsRow}>
          <View style={styles.avatarStack}>
            {destination.friends.slice(0, 3).map((friend, index) => (
              <FriendAvatar key={friend.ownerUid} friend={friend} index={index} />
            ))}
          </View>
          <Text style={styles.friendsText} numberOfLines={1}>
            {formatFriendsHere(destination.friends)}
          </Text>
          <MaterialIcons name="chevron-right" size={18} color="#7F56D9" />
        </View>
      </View>
    </TouchableOpacity>
  );
});
DestinationCard.displayName = 'DestinationCard';

export default function FriendEventsMapToggle({ hidden = false }: { hidden?: boolean }) {
  const isFocused = useIsFocused();
  const activity = useSocialStore((state) => state.activity);
  const onScreenEvents = useMapStore((state) => state.onScreenEvents);
  const clusters = useMapStore((state) => state.clusters);
  const filterCriteria = useMapStore((state) => state.filterCriteria);
  const activeFilterPanel = useMapStore((state) => state.activeFilterPanel);
  const showFriendEvents = useMapStore((state) => state.showFriendEvents);
  const setShowFriendEvents = useMapStore((state) => state.setShowFriendEvents);
  const savedEvents = useUserPrefsStore((state) => state.savedEvents);
  const [open, setOpen] = useState(false);

  const destinations = useMemo(() => buildFriendDestinations({
    activities: activity,
    onScreenEvents,
    clusters,
    filterCriteria,
    savedEventIds: new Set(savedEvents),
  }), [activity, clusters, filterCriteria, onScreenEvents, savedEvents]);

  useEffect(() => {
    // The former control toggled private event markers. The Friends control is
    // now a live-presence browser; authorized invitations remain on the map.
    if (SOCIAL_RELEASE_TWO_ENABLED && !showFriendEvents) setShowFriendEvents(true);
  }, [setShowFriendEvents, showFriendEvents]);

  useEffect(() => {
    if (destinations.length === 0 || hidden || !isFocused || activeFilterPanel) setOpen(false);
  }, [activeFilterPanel, destinations.length, hidden, isFocused]);

  if (
    !SOCIAL_RELEASE_TWO_ENABLED
    || hidden
    || !isFocused
    || activeFilterPanel
    || destinations.length === 0
  ) return null;

  const openDestination = (destination: FriendDestination) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setOpen(false);
    if (destination.event) {
      useMapStore.getState().setSelectedImageData({
        imageUrl: getLightboxImageUrl(destination.event),
        event: destination.event,
        venue: destination.venue,
        cluster: destination.cluster,
        source: 'friend_presence',
      });
      return;
    }

    if (destination.cluster) {
      const otherVenues = destination.cluster.venues.filter(
        (venue) => venue.locationKey !== destination.venue.locationKey
      );
      useMapStore.getState().selectCallout(
        [destination.venue, ...otherVenues],
        destination.cluster
      );
    }
  };

  return (
    <>
      {!open && (
        <TouchableOpacity
          accessibilityLabel={`Open ${destinations.length} live friend ${destinations.length === 1 ? 'destination' : 'destinations'}`}
          accessibilityRole="button"
          activeOpacity={0.88}
          onPress={() => {
            void Haptics.selectionAsync().catch(() => undefined);
            setOpen(true);
          }}
          style={styles.pill}
        >
          <Ionicons name="people" size={18} color="#FFFFFF" />
          <Text style={styles.pillLabel}>Friends</Text>
          <View style={styles.placeBadge}>
            <View style={styles.placeLiveDot} />
            <Text style={styles.placeBadgeText}>
              {destinations.length} {destinations.length === 1 ? 'place' : 'places'}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {open && (
        <View style={styles.carouselShell}>
          <View style={styles.carouselHeader}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerLiveDot} />
              <View>
                <Text style={styles.headerTitle}>Friends here now</Text>
                <Text style={styles.headerSubtitle}>
                  {destinations.length} live {destinations.length === 1 ? 'destination' : 'destinations'} on this map
                </Text>
              </View>
            </View>
            <TouchableOpacity
              accessibilityLabel="Close friends carousel"
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={styles.closeButton}
            >
              <MaterialIcons name="keyboard-arrow-down" size={22} color="#53389E" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={destinations}
            horizontal
            keyExtractor={(destination) => destination.id}
            renderItem={({ item }) => (
              <DestinationCard destination={item} onPress={() => openDestination(item)} />
            )}
            contentContainerStyle={styles.carouselContent}
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + 12}
            decelerationRate="fast"
            initialNumToRender={3}
            windowSize={3}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    right: 12,
    bottom: 168,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#7F56D9',
    backgroundColor: '#6941C6',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 24,
  },
  pillLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  placeBadge: {
    minHeight: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  placeLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#6CE9A6' },
  placeBadgeText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '900' },
  carouselShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 72,
    zIndex: 25,
  },
  carouselHeader: {
    minHeight: 48,
    marginHorizontal: 8,
    marginBottom: 7,
    paddingLeft: 12,
    paddingRight: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#D6BBFB',
    backgroundColor: 'rgba(255,255,255,0.97)',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
    elevation: 5,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerLiveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#12B76A' },
  headerTitle: { color: '#101828', fontSize: 14, fontWeight: '900' },
  headerSubtitle: { marginTop: 1, color: '#667085', fontSize: 10.5, fontWeight: '600' },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F4EBFF',
  },
  carouselContent: { paddingHorizontal: 8, gap: 12 },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#B7E4D6',
    backgroundColor: '#FFFFFF',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  privateCard: { borderColor: '#B692F6' },
  hero: { width: 98, height: CARD_HEIGHT, position: 'relative', backgroundColor: '#F2F4F7' },
  heroImage: { width: '100%', height: '100%' },
  liveBadge: {
    position: 'absolute',
    left: 7,
    top: 7,
    minHeight: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(6,78,59,0.92)',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#6CE9A6' },
  liveBadgeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.3 },
  cardCopy: { flex: 1, minWidth: 0, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 8 },
  kind: { color: '#067647', fontSize: 9, fontWeight: '900', letterSpacing: 0.45 },
  privateKind: { color: '#6941C6' },
  title: { marginTop: 3, color: '#101828', fontSize: 14, lineHeight: 17, fontWeight: '900' },
  venue: { marginTop: 1, color: '#667085', fontSize: 10.5, fontWeight: '600' },
  timeRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  time: { color: '#53389E', fontSize: 10.5, fontWeight: '800' },
  friendsRow: {
    marginTop: 'auto',
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EAECF0',
    paddingTop: 6,
  },
  avatarStack: { minWidth: 28, flexDirection: 'row', alignItems: 'center' },
  avatarShell: {
    width: 25,
    height: 25,
    overflow: 'hidden',
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: '#E9D7FE',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9D7FE' },
  avatarInitial: { color: '#6941C6', fontSize: 10, fontWeight: '900' },
  friendsText: { flex: 1, marginLeft: 6, color: '#344054', fontSize: 10.5, fontWeight: '800' },
});
