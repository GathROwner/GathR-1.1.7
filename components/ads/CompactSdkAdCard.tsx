import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import FullSizeSdkAdCard from './FullSizeSdkAdCard';

type CompactSdkAdCardProps = {
  nativeAd: any;
  loading: boolean;
  allowMedia?: boolean;
};

/** Callout-specific native mount gate around the shared, accepted ad presentation. */
export default function CompactSdkAdCard({ nativeAd, loading, allowMedia = true }: CompactSdkAdCardProps) {
  // Readiness belongs to this exact SDK object, never to the previous ad in a slot.
  const [readyAd, setReadyAd] = useState<any>(null);
  const sdkMountReady = Platform.OS !== 'ios' || (!loading && nativeAd != null && readyAd === nativeAd);

  useEffect(() => {
    if (loading || !nativeAd || Platform.OS !== 'ios') {
      setReadyAd(null);
      return;
    }

    let cancelled = false;
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    setReadyAd(null);
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        timeoutId = setTimeout(() => {
          if (!cancelled) setReadyAd(nativeAd);
        }, 60);
      });
    });

    return () => {
      cancelled = true;
      if (firstFrame !== null) cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [loading, nativeAd]);

  if (!loading && !nativeAd) return null;

  // A plain skeleton keeps NativeAdView/assets/media unmounted while iOS settles.
  // No hidden ad view or replacement ad object is used for this waiting state.
  return <FullSizeSdkAdCard nativeAd={nativeAd} loading={loading || !sdkMountReady} allowMedia={allowMedia} />;
}
