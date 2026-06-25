import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  tone: 'success' | 'error';
};

export default function SharedEventProcessingBanner() {
  const { user } = useAuth();
  const [banner, setBanner] = useState<BannerState | null>(null);
  const subscriptionsRef = useRef(new Map<string, () => void>());
  const mountedRef = useRef(true);

  const showBanner = useCallback((nextBanner: BannerState) => {
    if (!mountedRef.current) return;
    setBanner(nextBanner);
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
          clearSubscription(entry.ingestId);
          await removePendingSharedEventIngest(entry.ingestId);
          const count = Math.max(result.extractedEventCount || 0, result.events?.length || 0);
          showBanner({
            id: `${entry.ingestId}-completed`,
            title: 'Share scan complete',
            detail: count > 1
              ? `GathR found ${count} possible events from your share.`
              : 'GathR finished scanning your share.',
            tone: 'success',
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

  const color = banner.tone === 'error' ? '#B42318' : '#12805C';
  return (
    <Pressable
      style={styles.overlay}
      onPress={() => setBanner(null)}
    >
      <View style={[styles.card, { borderColor: `${color}44` }]}>
        <Image source={GATHR_LOGO} style={styles.logo} resizeMode="contain" />
        <View style={styles.textBlock}>
          <Text style={styles.title}>{banner.title}</Text>
          <Text style={styles.detail} numberOfLines={2}>{banner.detail}</Text>
        </View>
        <Ionicons
          name={banner.tone === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
          size={22}
          color={color}
        />
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
});
