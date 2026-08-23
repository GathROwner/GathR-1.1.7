import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { watchSharedEventIngest } from '../../lib/sharedEventApi';
import {
  listPendingSharedEventIngests,
  removePendingSharedEventIngest,
} from '../../lib/sharedEventProcessingTracker';
import { shouldShowSharedEventInAppBanner } from '../../lib/sharedEventCompletionFeedback';
import { refreshMapAfterSharedEventSave } from '../../lib/sharedEventMapRefresh';
import {
  retrySharedEventUpload,
  subscribeSharedEventUploadJobs,
} from '../../lib/sharedEventUploadQueue';

const GATHR_LOGO = require('../../assets/icon.png');

type BannerState = {
  id: string;
  title: string;
  detail: string;
  tone: 'success' | 'warning' | 'error';
  ingestId?: string;
  uploadJobId?: string;
  persistent?: boolean;
};

export default function SharedEventProcessingBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const subscriptionsRef = useRef(new Map<string, () => void>());
  const mountedRef = useRef(true);
  const pathnameRef = useRef(pathname);
  const deliveredFeedbackRef = useRef(new Set<string>());
  const refreshedIngestsRef = useRef(new Set<string>());

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

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

  const deliverCompletionFeedback = useCallback(async (nextBanner: BannerState) => {
    if (deliveredFeedbackRef.current.has(nextBanner.id)) return;
    deliveredFeedbackRef.current.add(nextBanner.id);

    // The result screen already updates itself. Everywhere else gets the
    // tappable in-app banner when GathR is in the foreground.
    if (shouldShowSharedEventInAppBanner(pathnameRef.current)) {
      showBanner(nextBanner);
    }
  }, [showBanner]);

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
            await deliverCompletionFeedback({
              id: `${entry.ingestId}-failed`,
              title: 'Share needs a retry',
              detail: result.processingError || 'GathR could not finish scanning that share.',
              tone: 'error',
              ingestId: entry.ingestId,
            });
            return;
          }

          if (result.processingStatus !== 'completed') return;
          if (!refreshedIngestsRef.current.has(entry.ingestId)) {
            refreshedIngestsRef.current.add(entry.ingestId);
            await refreshMapAfterSharedEventSave().catch((error) => {
              console.warn('[SharedEvent] Failed to refresh completed private events:', error);
            });
          }
          const unresolvedVenue = result.events?.find((event) => (
            event.venueResolutionStatus === 'selection_required'
          ));
          if (unresolvedVenue) {
            await deliverCompletionFeedback({
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
          await deliverCompletionFeedback({
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
  }, [clearSubscription, deliverCompletionFeedback, user]);

  useEffect(() => subscribeSharedEventUploadJobs((jobs) => {
    if (!user || pathnameRef.current === '/shared-event') return;
    const active = [...jobs]
      .reverse()
      .find((job) => job.ownerUid === user.uid && job.status !== 'accepted');
    if (!active) {
      setBanner((current) => current?.uploadJobId ? null : current);
      return;
    }
    if (active.status === 'retry_waiting') {
      showBanner({
        id: `${active.id}-retry`,
        title: 'Photo upload paused',
        detail: active.error || 'Tap to retry when you are connected.',
        tone: 'error',
        uploadJobId: active.id,
        persistent: true,
      });
      return;
    }
    showBanner({
      id: `${active.id}-${active.status}`,
      title: active.status === 'submitting' ? 'Photo uploaded' : 'Uploading your event photo',
      detail: active.status === 'submitting'
        ? 'GathR is starting the event scan.'
        : 'You can keep using GathR while this continues safely.',
      tone: 'success',
      uploadJobId: active.id,
      persistent: true,
    });
  }), [showBanner, user]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshPending();
    const interval = setInterval(() => {
      void refreshPending();
    }, 8000);
    const subscriptions = subscriptionsRef.current;

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      subscriptions.forEach((unsubscribe) => unsubscribe());
      subscriptions.clear();
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
        } else if (banner.uploadJobId) {
          void retrySharedEventUpload(banner.uploadJobId);
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
