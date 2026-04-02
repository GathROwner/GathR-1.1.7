import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import useNativeAds from '../../hooks/useNativeAds';
import CompactSdkAdCard from './CompactSdkAdCard';

let compactCalloutWarmupDone = false;

export default function CompactCalloutAdWarmup() {
  const [done, setDone] = useState(compactCalloutWarmupDone);
  const eventAds = useNativeAds(done ? 0 : 1, 'events', 0);
  const specialAds = useNativeAds(done ? 0 : 1, 'specials', 0);

  const eventEntry = eventAds[0] ?? { ad: null, loading: false };
  const specialEntry = specialAds[0] ?? { ad: null, loading: false };

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

  if (done) {
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
