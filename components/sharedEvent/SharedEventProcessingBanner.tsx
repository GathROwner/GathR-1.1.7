import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { watchSharedEventIngest } from '../../lib/sharedEventApi';
import {
  listPendingSharedEventIngests,
  removePendingSharedEventIngest,
} from '../../lib/sharedEventProcessingTracker';

const GATHR_LOGO = require('../../assets/icon.png');

type BannerState = {
  id: string;
  title: string;
  detail: string;
  tone: 'success' | 'warning' | 'error';
  ingestId?: string;
  persistent?: boolean;
};

export default function SharedEventProcessingBanner() {
  const router = useRouter();
  const { user } = useAuth();
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const subscriptionsRef = useRef(new Map<string, () => void>());
  const mountedRef = useRef(true);

  const showBanner = useCallback((nextBanner: BannerState) => {
    if (!mountedRef.current) return;
    setBanner(nextBanner);
    setCollapsed(false);
    if (nextBanner.persistent) return;
    setTimeout(() => {
      if (mountedRef.current) {
        setBanner((current) => current?.id === nextBanner.id ? null : current);
      }
    }, 6500);
  }, []);

  const clearSubscription = useCallback((ingestId: string) => {
    const unsubscribe = subscriptionsRef.current.get(ingestId);
    unsubscribe?.();
    subscriptionsRef.current.delete(ingestId);
  }, []);

  const refreshPending = useCallback(async () => {
    if (!user) return;
    const pending = await listPendingSharedEventIngests();
    for (const entry of pending) {
      if (subscriptionsRef.current.has(entry.ingestId)) continue;
      const unsubscribe = watchSharedEventIngest(
        entry.ingestId,
        async (result) => {
          if (result.processingStatus === 'failed') {
            clearSubscription(entry.ingestId);
            await removePendingSharedEventIngest(entry.ingestId);
            showBanner({
              id: `${entry.ingestId}-failed`,
              title: 'Share needs a retry',
              detail: result.processingError || 'GathR could not finish scanning that share.',
              tone: 'error',
            });
            return;
          }

          if (result.processingStatus !== 'completed') return;
          const unresolvedVenue = result.events?.find((event) => (
            event.venueResolutionStatus === 'selection_required'
          ));
          if (unresolvedVenue) {
            showBanner({
              id: `${entry.ingestId}-venue-needed`,
              title: 'Venue needed',
              detail: `Tap to choose the location for ${unresolvedVenue.locationName || 'your shared event'}.`,
              tone: 'warning',
              ingestId: entry.ingestId,
              persistent: true,
            });
            return;
          }
          clearSubscription(entry.ingestId);
          await removePendingSharedEventIngest(entry.ingestId);
          const count = Math.max(result.extractedEventCount || 0, result.events?.length || 0);
          const crowd = result.crowdPromotion;
          const crowdDetail = crowd?.candidateEventCount
            ? `${crowd.candidateEventCount} ${crowd.candidateEventCount === 1 ? 'event has' : 'events have'} enough independent confirmations for GathR's safety checks.`
            : crowd?.collectingEventCount
              ? `Community confirmation: ${Math.min(crowd.maxContributorCount, crowd.threshold)} of ${crowd.threshold}.`
              : '';
          showBanner({
            id: `${entry.ingestId}-completed`,
            title: 'Share scan complete',
            detail: crowdDetail || (count > 1
              ? `GathR found ${count} possible events from your share.`
              : 'GathR finished scanning your share.'),
            tone: 'success',
            ingestId: entry.ingestId,
          });
        },
        async () => {
          clearSubscription(entry.ingestId);
          await removePendingSharedEventIngest(entry.ingestId);
        }
      );
      subscriptionsRef.current.set(entry.ingestId, unsubscribe);
    }
  }, [clearSubscription, showBanner, user]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshPending();
    const interval = setInterval(() => {
      void refreshPending();
    }, 8000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      subscriptionsRef.current.forEach((unsubscribe) => unsubscribe());
      subscriptionsRef.current.clear();
    };
  }, [refreshPending]);

  if (!banner) return null;

  const color = banner.tone === 'error'
    ? '#B42318'
    : banner.tone === 'warning' ? '#B76E00' : '#12805C';
  return (
    <Pressable
      style={[styles.overlay, collapsed && styles.overlayCollapsed]}
      onPress={() => {
        if (banner.ingestId) {
          router.push({ pathname: '/shared-event', params: { ingestId: banner.ingestId } });
        } else {
          setBanner(null);
        }
      }}
    >
      <View style={[styles.card, collapsed && styles.cardCollapsed, { borderColor: `${color}44` }]}>
        <Image source={GATHR_LOGO} style={styles.logo} resizeMode="contain" />
        <View style={styles.textBlock}>
          <Text style={styles.title}>{banner.title}</Text>
          {!collapsed ? <Text style={styles.detail} numberOfLines={2}>{banner.detail}</Text> : null}
        </View>
        <Ionicons
          name={banner.ingestId
            ? 'chevron-forward'
            : banner.tone === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
          size={22}
          color={color}
        />
        <Pressable
          style={styles.closeButton}
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            if (banner.persistent) setCollapsed(true);
            else setBanner(null);
          }}
        >
          <Ionicons name="close" size={18} color="#667085" />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 28,
    left: 14,
    right: 14,
    zIndex: 10000,
    elevation: 10000,
  },
  card: {
    minHeight: 66,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
  },
  overlayCollapsed: {
    left: 80,
  },
  cardCollapsed: {
    minHeight: 54,
    paddingVertical: 7,
  },
  logo: {
    width: 38,
    height: 38,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#1F2937',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
  },
  detail: {
    color: '#667085',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    fontWeight: '600',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F4F7',
  },
});
