import React, { useEffect, useState } from 'react';
import { InteractionManager, Platform, StyleSheet, View } from 'react-native';
import useNativeAds from '../../hooks/useNativeAds';
import CompactSdkAdCard from './CompactSdkAdCard';

let compactCalloutWarmupDone = false;
const ANDROID_CALLOUT_AD_WARMUP_DELAY_MS = 45000;

export default function CompactCalloutAdWarmup() {
  const [done, setDone] = useState(compactCalloutWarmupDone);
  const [warmupEnabled, setWarmupEnabled] = useState(Platform.OS !== 'android');
  const shouldWarmup = warmupEnabled && !done;
  const eventAds = useNativeAds(shouldWarmup ? 1 : 0, 'events', 0);
  const specialAds = useNativeAds(shouldWarmup ? 1 : 0, 'specials', 0);

  const eventEntry = eventAds[0] ?? { ad: null, loading: false };
  const specialEntry = specialAds[0] ?? { ad: null, loading: false };

  useEffect(() => {
    if (warmupEnabled || done || Platform.OS !== 'android') {
      return;
    }

    // Keep native ad/WebView warmup out of the Android map/hotspot startup path.
    let interactionTask: { cancel?: () => void } | null = null;
    const timer = setTimeout(() => {
      interactionTask = InteractionManager.runAfterInteractions(() => {
        setWarmupEnabled(true);
      });
    }, ANDROID_CALLOUT_AD_WARMUP_DELAY_MS);

    return () => {
      clearTimeout(timer);
      interactionTask?.cancel?.();
    };
  }, [done, warmupEnabled]);

  useEffect(() => {
    if (done) {
      return;
    }

    const eventReady = Boolean(eventEntry.ad) && !eventEntry.loading;
    const specialReady = Boolean(specialEntry.ad) && !specialEntry.loading;

    if (!eventReady || !specialReady) {
      return;
    }

    const timeoutId = setTimeout(() => {
      compactCalloutWarmupDone = true;
      setDone(true);
    }, 1);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [done, eventEntry.ad, eventEntry.loading, specialEntry.ad, specialEntry.loading]);

  if (!warmupEnabled || done) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.host}>
      <View style={styles.cardWrap}>
        <CompactSdkAdCard
          nativeAd={eventEntry.ad}
          loading={eventEntry.loading}
          allowMedia={true}
        />
      </View>
      <View style={styles.cardWrap}>
        <CompactSdkAdCard
          nativeAd={specialEntry.ad}
          loading={specialEntry.loading}
          allowMedia={true}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: -10000,
    top: -10000,
    opacity: 0.01,
  },
  cardWrap: {
    width: 320,
    height: 260,
    marginBottom: 16,
  },
});
