import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
  TestIds,
} from 'react-native-google-mobile-ads';

import useNativeAds from '../hooks/useNativeAds';
import { useAdPoolStore } from '../store/adPoolStore';

type AdTabType = 'events' | 'specials';
type AdSourceMode = 'live' | 'test';
type TestAdMode = 'native' | 'native_video';
type RenderContextMode = 'plain' | 'events_row' | 'events_flatlist' | 'events_feed';

const REQUESTED_AD_COUNT = 5;
const MAX_LOG_LINES = 80;

const summarizeAd = (ad: any) => ({
  headline: ad?.headline || '',
  advertiser: ad?.advertiser || '',
  hasBody: Boolean(ad?.body),
  hasCTA: Boolean(ad?.callToAction),
  hasIcon: Boolean(ad?.icon?.url),
  hasMediaContent: Boolean(ad?.mediaContent),
  hasVideoContent: Boolean(ad?.mediaContent?.hasVideoContent),
  aspectRatio:
    typeof ad?.mediaContent?.aspectRatio === 'number' ? ad.mediaContent.aspectRatio : null,
});

function AdSdkCard({
  ad,
  useWrapper,
  useAssets,
  useMedia,
  cardLabel,
  appendLog,
}: {
  ad: any;
  useWrapper: boolean;
  useAssets: boolean;
  useMedia: boolean;
  cardLabel: string;
  appendLog: (message: string) => void;
}) {
  const layoutLoggedRef = useRef(false);
  const registerAssets = useWrapper && useAssets;
  const renderSdkMedia = useWrapper && useMedia;

  useEffect(() => {
    appendLog(
      `card_mount label=${cardLabel} wrapper=${useWrapper} assets=${useAssets} media=${useMedia} registeredAssets=${registerAssets} sdkMedia=${renderSdkMedia} headline=${ad?.headline || 'none'}`
    );
    return () => {
      appendLog(
        `card_unmount label=${cardLabel} wrapper=${useWrapper} assets=${useAssets} media=${useMedia} registeredAssets=${registerAssets} sdkMedia=${renderSdkMedia} headline=${ad?.headline || 'none'}`
      );
    };
  }, [ad?.headline, appendLog, cardLabel, registerAssets, renderSdkMedia, useAssets, useMedia, useWrapper]);

  useEffect(() => {
    layoutLoggedRef.current = false;
  }, [ad?.headline, useAssets, useMedia, useWrapper]);

  const onCardLayout = useCallback(
    (event: any) => {
      if (layoutLoggedRef.current) return;
      layoutLoggedRef.current = true;
      const { width, height, x, y } = event.nativeEvent.layout;
      appendLog(
        `card_layout label=${cardLabel} wrapper=${useWrapper} assets=${useAssets} media=${useMedia} x=${x} y=${y} width=${width} height=${height}`
      );
    },
    [appendLog, cardLabel, useAssets, useMedia, useWrapper]
  );

  const renderMediaFallback = () => (
    <View style={styles.mediaFallback}>
      {ad?.icon?.url ? (
        <Image source={{ uri: ad.icon.url }} style={styles.mediaFallbackImage} resizeMode="contain" />
      ) : (
        <Text style={styles.mediaFallbackText}>{(ad?.headline || 'Ad').charAt(0)}</Text>
      )}
    </View>
  );

  const renderAssetAwareContent = () => (
    <>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Sponsored</Text>
      </View>

      <View style={styles.headerRow}>
        {registerAssets ? (
          ad?.icon?.url ? (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image source={{ uri: ad.icon.url }} style={styles.iconImage} />
            </NativeAsset>
          ) : (
            <View style={styles.iconPlaceholder} />
          )
        ) : ad?.icon?.url ? (
          <Image source={{ uri: ad.icon.url }} style={styles.iconImage} />
        ) : (
          <View style={styles.iconPlaceholder} />
        )}

        <View style={styles.headerText}>
          {registerAssets ? (
            <>
              <NativeAsset assetType={NativeAssetType.HEADLINE}>
                <Text style={styles.headline} numberOfLines={2}>
                  {ad?.headline || 'Untitled ad'}
                </Text>
              </NativeAsset>
              {!!ad?.advertiser && (
                <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                  <Text style={styles.advertiser} numberOfLines={1}>
                    {ad.advertiser}
                  </Text>
                </NativeAsset>
              )}
            </>
          ) : (
            <>
              <Text style={styles.headline} numberOfLines={2}>
                {ad?.headline || 'Untitled ad'}
              </Text>
              {!!ad?.advertiser && (
                <Text style={styles.advertiser} numberOfLines={1}>
                  {ad.advertiser}
                </Text>
              )}
            </>
          )}
        </View>
      </View>

      <View style={styles.mediaContainer}>
        {renderSdkMedia ? (
          <NativeMediaView style={styles.mediaView} resizeMode="cover" />
        ) : (
          renderMediaFallback()
        )}
      </View>

      {registerAssets ? (
        !!ad?.body && (
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text style={styles.body} numberOfLines={3}>
              {ad.body}
            </Text>
          </NativeAsset>
        )
      ) : !!ad?.body ? (
        <Text style={styles.body} numberOfLines={3}>
          {ad.body}
        </Text>
      ) : null}

      {registerAssets ? (
        !!ad?.callToAction && (
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Text style={styles.ctaText}>{ad.callToAction}</Text>
          </NativeAsset>
        )
      ) : !!ad?.callToAction ? (
        <Text style={styles.ctaText}>{ad.callToAction}</Text>
      ) : null}
    </>
  );

  if (!useWrapper) {
    return (
      <View style={styles.card} onLayout={onCardLayout}>
        {renderAssetAwareContent()}
      </View>
    );
  }

  return (
    <NativeAdView style={styles.card} nativeAd={ad} onLayout={onCardLayout}>
      {renderAssetAwareContent()}
    </NativeAdView>
  );
}

export default function NativeAdLabScreen() {
  const router = useRouter();
  const [sourceMode, setSourceMode] = useState<AdSourceMode>('live');
  const [tabType, setTabType] = useState<AdTabType>('specials');
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [testAdMode, setTestAdMode] = useState<TestAdMode>('native');
  const [useWrapper, setUseWrapper] = useState(true);
  const [useAssets, setUseAssets] = useState(true);
  const [useMedia, setUseMedia] = useState(false);
  const [duplicateMount, setDuplicateMount] = useState(false);
  const [renderContext, setRenderContext] = useState<RenderContextMode>('plain');
  const [reuseFeedAdObject, setReuseFeedAdObject] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [testAd, setTestAd] = useState<any | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testReloadNonce, setTestReloadNonce] = useState(0);
  const testAdRef = useRef<any | null>(null);

  const eventsPoolSize = useAdPoolStore((s) => s.eventsAds.length);
  const specialsPoolSize = useAdPoolStore((s) => s.specialsAds.length);
  const isEventsLoading = useAdPoolStore((s) => s.isLoading.events);
  const isSpecialsLoading = useAdPoolStore((s) => s.isLoading.specials);

  const liveRequestedCount = sourceMode === 'live' ? REQUESTED_AD_COUNT : 0;
  const adEntries = useNativeAds(liveRequestedCount, tabType, 0);
  const selectedEntry = adEntries[selectedSlot] ?? adEntries[0] ?? { ad: null, loading: false };
  const effectiveAd = sourceMode === 'test' ? testAd : selectedEntry.ad;
  const effectiveLoading = sourceMode === 'test' ? testLoading : selectedEntry.loading;
  const selectedSummary = useMemo(() => summarizeAd(effectiveAd), [effectiveAd]);

  const appendLog = useCallback((message: string) => {
    const line = `${new Date().toLocaleTimeString()} ${message}`;
    setLogs((prev) => [line, ...prev].slice(0, MAX_LOG_LINES));
  }, []);

  useEffect(() => {
    appendLog('native_ad_lab_mounted');
    return () => appendLog('native_ad_lab_unmounted');
  }, [appendLog]);

  useEffect(() => {
    return () => {
      if (testAdRef.current) {
        try {
          testAdRef.current.destroy();
        } catch {}
        testAdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    appendLog(
      `pool_state tab=${tabType} events=${eventsPoolSize} specials=${specialsPoolSize} loadingEvents=${isEventsLoading} loadingSpecials=${isSpecialsLoading}`
    );
  }, [appendLog, eventsPoolSize, isEventsLoading, isSpecialsLoading, specialsPoolSize, tabType]);

  useEffect(() => {
    if (sourceMode !== 'live') return;
    appendLog(
      `selection source=live tab=${tabType} slot=${selectedSlot} loading=${selectedEntry.loading} headline=${selectedSummary.headline || 'none'} advertiser=${selectedSummary.advertiser || 'none'} media=${selectedSummary.hasMediaContent} video=${selectedSummary.hasVideoContent} ratio=${selectedSummary.aspectRatio ?? 'null'}`
    );
  }, [appendLog, selectedEntry.loading, selectedSlot, selectedSummary, sourceMode, tabType]);

  useEffect(() => {
    if (sourceMode !== 'test') {
      if (testAdRef.current) {
        try {
          testAdRef.current.destroy();
        } catch {}
        testAdRef.current = null;
      }
      setTestAd(null);
      setTestLoading(false);
      setTestError(null);
      return;
    }

    const unitId = testAdMode === 'native' ? TestIds.NATIVE : TestIds.NATIVE_VIDEO;
    let cancelled = false;

    const loadTestAd = async () => {
      appendLog(`test_load_started mode=${testAdMode} unitId=${unitId}`);
      setTestLoading(true);
      setTestError(null);
      setTestAd(null);

      if (testAdRef.current) {
        try {
          testAdRef.current.destroy();
        } catch {}
        testAdRef.current = null;
        appendLog('test_ad_destroyed_previous');
      }

      try {
        const nativeAd = await NativeAd.createForAdRequest(unitId, {
          requestNonPersonalizedAdsOnly: false,
        });

        if (cancelled) {
          try {
            nativeAd.destroy();
          } catch {}
          return;
        }

        testAdRef.current = nativeAd;
        setTestAd(nativeAd);
        setTestLoading(false);
        appendLog(
          `test_load_succeeded mode=${testAdMode} headline=${nativeAd.headline || 'none'} advertiser=${nativeAd.advertiser || 'none'} media=${Boolean(nativeAd.mediaContent)} video=${Boolean(nativeAd.mediaContent?.hasVideoContent)} ratio=${typeof nativeAd.mediaContent?.aspectRatio === 'number' ? nativeAd.mediaContent.aspectRatio : 'null'}`
        );
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setTestAd(null);
        setTestLoading(false);
        setTestError(message);
        appendLog(`test_load_failed mode=${testAdMode} message=${message}`);
      }
    };

    loadTestAd();

    return () => {
      cancelled = true;
    };
  }, [appendLog, sourceMode, testAdMode, testReloadNonce]);

  useEffect(() => {
    if (sourceMode !== 'test') return;
    appendLog(
      `selection source=test mode=${testAdMode} loading=${testLoading} error=${testError ?? 'none'} headline=${selectedSummary.headline || 'none'} advertiser=${selectedSummary.advertiser || 'none'} media=${selectedSummary.hasMediaContent} video=${selectedSummary.hasVideoContent} ratio=${selectedSummary.aspectRatio ?? 'null'}`
    );
  }, [appendLog, selectedSummary, sourceMode, testAdMode, testError, testLoading]);

  useEffect(() => {
    appendLog(
      `mode source=${sourceMode} wrapper=${useWrapper} assets=${useAssets} media=${useMedia} duplicate=${duplicateMount} context=${renderContext} reuseFeedAd=${reuseFeedAdObject}`
    );
  }, [appendLog, duplicateMount, renderContext, reuseFeedAdObject, sourceMode, useAssets, useMedia, useWrapper]);

  const shareLogs = useCallback(async () => {
    await Share.share({
      message: ['NATIVE AD LAB', '', ...logs].join('\n'),
    });
  }, [logs]);

  const currentPoolSize = tabType === 'events' ? eventsPoolSize : specialsPoolSize;
  const testUnitId = testAdMode === 'native' ? TestIds.NATIVE : TestIds.NATIVE_VIDEO;
  const flatListData = useMemo(
    () => [
      { id: 'event-top', type: 'event' as const, title: 'Mock event row above ad' },
      { id: 'ad-primary', type: 'ad' as const, cardLabel: 'primary' },
      ...(duplicateMount ? [{ id: 'ad-secondary', type: 'ad' as const, cardLabel: 'secondary' }] : []),
      { id: 'event-bottom', type: 'event' as const, title: 'Mock event row below ad' },
    ],
    [duplicateMount]
  );

  const availableFeedAds = useMemo(() => {
    if (sourceMode === 'test') {
      return effectiveAd ? [effectiveAd] : [];
    }
    return adEntries.map((entry) => entry.ad).filter(Boolean);
  }, [adEntries, effectiveAd, sourceMode]);

  const eventsFeedData = useMemo(() => {
    const feedItems: Array<
      | { id: string; type: 'event'; title: string; subtitle: string }
      | { id: string; type: 'ad'; cardLabel: string; ad: any | null }
    > = [];
    let adSlotIndex = 0;
    const feedEventCount = 12;

    for (let index = 0; index < feedEventCount; index++) {
      feedItems.push({
        id: `feed-event-${index}`,
        type: 'event',
        title: `Mock feed event ${index + 1}`,
        subtitle: `Simulated Events row ${index + 1}`,
      });

      if ((index + 1) % 4 === 0) {
        const ad =
          availableFeedAds.length === 0
            ? null
            : reuseFeedAdObject
              ? availableFeedAds[0]
              : availableFeedAds[adSlotIndex % availableFeedAds.length];
        feedItems.push({
          id: `feed-ad-${adSlotIndex}`,
          type: 'ad',
          cardLabel: `feed-${adSlotIndex + 1}`,
          ad,
        });
        adSlotIndex++;
      }
    }

    return feedItems;
  }, [availableFeedAds, reuseFeedAdObject]);

  const renderCard = useCallback(
    (cardLabel: string, cardAd: any = effectiveAd) => (
      <AdSdkCard
        ad={cardAd}
        useWrapper={useWrapper}
        useAssets={useAssets}
        useMedia={useMedia}
        cardLabel={cardLabel}
        appendLog={appendLog}
      />
    ),
    [appendLog, effectiveAd, useAssets, useMedia, useWrapper]
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Native Ad SDK Lab</Text>
        <TouchableOpacity onPress={shareLogs} style={styles.headerButton}>
          <Ionicons name="share-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Ad Source</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.toggleButton, sourceMode === 'live' && styles.toggleButtonActive]}
              onPress={() => setSourceMode('live')}
            >
              <Text style={[styles.toggleText, sourceMode === 'live' && styles.toggleTextActive]}>
                Live Pool
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, sourceMode === 'test' && styles.toggleButtonActive]}
              onPress={() => setSourceMode('test')}
            >
              <Text style={[styles.toggleText, sourceMode === 'test' && styles.toggleTextActive]}>
                Test Ad
              </Text>
            </TouchableOpacity>
          </View>

          {sourceMode === 'test' ? (
            <>
              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.toggleButton, testAdMode === 'native' && styles.toggleButtonActive]}
                  onPress={() => setTestAdMode('native')}
                >
                  <Text style={[styles.toggleText, testAdMode === 'native' && styles.toggleTextActive]}>
                    Native Test
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleButton, testAdMode === 'native_video' && styles.toggleButtonActive]}
                  onPress={() => setTestAdMode('native_video')}
                >
                  <Text style={[styles.toggleText, testAdMode === 'native_video' && styles.toggleTextActive]}>
                    Video Test
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.toggleButton}
                  onPress={() => setTestReloadNonce((prev) => prev + 1)}
                >
                  <Text style={styles.toggleText}>Reload</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.metaText}>Test unit: {testUnitId || 'none'}</Text>
              {testError ? <Text style={styles.errorText}>Test load error: {testError}</Text> : null}
            </>
          ) : (
            <Text style={styles.metaText}>Using pooled live ads from your app store state.</Text>
          )}
        </View>

        {sourceMode === 'live' && (
          <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Pool</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.toggleButton, tabType === 'events' && styles.toggleButtonActive]}
              onPress={() => {
                setTabType('events');
                setSelectedSlot(0);
              }}
            >
              <Text style={[styles.toggleText, tabType === 'events' && styles.toggleTextActive]}>
                Events
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, tabType === 'specials' && styles.toggleButtonActive]}
              onPress={() => {
                setTabType('specials');
                setSelectedSlot(0);
              }}
            >
              <Text style={[styles.toggleText, tabType === 'specials' && styles.toggleTextActive]}>
                Specials
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.metaText}>
            Current pool size: {currentPoolSize} | requested: {liveRequestedCount} | slot: {selectedSlot + 1}
          </Text>

          <View style={styles.row}>
            {Array.from({ length: REQUESTED_AD_COUNT }).map((_, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.slotButton, selectedSlot === index && styles.slotButtonActive]}
                onPress={() => setSelectedSlot(index)}
              >
                <Text style={[styles.slotText, selectedSlot === index && styles.slotTextActive]}>
                  {index + 1}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          </View>
        )}

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Render Mode</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.toggleButton, !useWrapper && styles.toggleButtonActive]}
              onPress={() => setUseWrapper(false)}
            >
              <Text style={[styles.toggleText, !useWrapper && styles.toggleTextActive]}>
                Fallback
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, useWrapper && styles.toggleButtonActive]}
              onPress={() => setUseWrapper(true)}
            >
              <Text style={[styles.toggleText, useWrapper && styles.toggleTextActive]}>
                SDK Wrapper
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.toggleButton, useAssets && styles.toggleButtonActive]}
              onPress={() => setUseAssets((prev) => !prev)}
            >
              <Text style={[styles.toggleText, useAssets && styles.toggleTextActive]}>
                Assets {useAssets ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, useMedia && styles.toggleButtonActive]}
              onPress={() => setUseMedia((prev) => !prev)}
            >
              <Text style={[styles.toggleText, useMedia && styles.toggleTextActive]}>
                Media {useMedia ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, duplicateMount && styles.toggleButtonActive]}
              onPress={() => setDuplicateMount((prev) => !prev)}
            >
              <Text style={[styles.toggleText, duplicateMount && styles.toggleTextActive]}>
                Duplicate {duplicateMount ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.metaText}>
            Duplicate mounts the same ad object into two cards at once.
          </Text>

          <Text style={styles.subsectionTitle}>Render Context</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.toggleButton, renderContext === 'plain' && styles.toggleButtonActive]}
              onPress={() => setRenderContext('plain')}
            >
              <Text style={[styles.toggleText, renderContext === 'plain' && styles.toggleTextActive]}>
                Plain
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, renderContext === 'events_row' && styles.toggleButtonActive]}
              onPress={() => setRenderContext('events_row')}
            >
              <Text style={[styles.toggleText, renderContext === 'events_row' && styles.toggleTextActive]}>
                Events Row
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, renderContext === 'events_flatlist' && styles.toggleButtonActive]}
              onPress={() => setRenderContext('events_flatlist')}
            >
              <Text style={[styles.toggleText, renderContext === 'events_flatlist' && styles.toggleTextActive]}>
                Events FlatList
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, renderContext === 'events_feed' && styles.toggleButtonActive]}
              onPress={() => setRenderContext('events_feed')}
            >
              <Text style={[styles.toggleText, renderContext === 'events_feed' && styles.toggleTextActive]}>
                Events Feed
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.metaText}>
            `Events FlatList` mimics the list host and row wrapper from the real Events tab.
          </Text>
          {renderContext === 'events_feed' ? (
            <>
              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.toggleButton, reuseFeedAdObject && styles.toggleButtonActive]}
                  onPress={() => setReuseFeedAdObject(true)}
                >
                  <Text style={[styles.toggleText, reuseFeedAdObject && styles.toggleTextActive]}>
                    Reuse Same Ad
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleButton, !reuseFeedAdObject && styles.toggleButtonActive]}
                  onPress={() => setReuseFeedAdObject(false)}
                >
                  <Text style={[styles.toggleText, !reuseFeedAdObject && styles.toggleTextActive]}>
                    Use Different Ads
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.metaText}>
                Feed mode inserts an ad every 4 mock events, like the real Events screen.
              </Text>
            </>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Selected Ad</Text>
          <Text style={styles.metaText}>
            Source: {sourceMode === 'live' ? `live / ${tabType}` : `test / ${testAdMode}`} | Loading:{' '}
            {effectiveLoading ? 'yes' : 'no'} | Present: {effectiveAd ? 'yes' : 'no'}
          </Text>
          <Text style={styles.metaText}>Headline: {selectedSummary.headline || 'none'}</Text>
          <Text style={styles.metaText}>Advertiser: {selectedSummary.advertiser || 'none'}</Text>
          <Text style={styles.metaText}>
            CTA: {selectedSummary.hasCTA ? 'yes' : 'no'} | Body: {selectedSummary.hasBody ? 'yes' : 'no'} | Icon:{' '}
            {selectedSummary.hasIcon ? 'yes' : 'no'}
          </Text>
          <Text style={styles.metaText}>
            Media: {selectedSummary.hasMediaContent ? 'yes' : 'no'} | Video:{' '}
            {selectedSummary.hasVideoContent ? 'yes' : 'no'} | Aspect: {selectedSummary.aspectRatio ?? 'null'}
          </Text>
          {testError && sourceMode === 'test' ? <Text style={styles.errorText}>Error: {testError}</Text> : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Ad Card</Text>
          {effectiveLoading ? (
            <Text style={styles.metaText}>
              {sourceMode === 'test' ? 'Loading test ad...' : 'Loading ad slot...'}
            </Text>
          ) : effectiveAd ? (
            renderContext === 'plain' ? (
              <View style={styles.cardStack}>
                <View style={styles.cardPanel}>
                  <Text style={styles.cardLabel}>Primary</Text>
                  {renderCard('primary')}
                </View>
                {duplicateMount ? (
                  <View style={styles.cardPanel}>
                    <Text style={styles.cardLabel}>Secondary</Text>
                    {renderCard('secondary')}
                  </View>
                ) : null}
              </View>
            ) : renderContext === 'events_row' ? (
              <View style={styles.cardStack}>
                <View style={styles.cardPanel}>
                  <Text style={styles.cardLabel}>Primary</Text>
                  <View style={styles.eventsAdContainer}>{renderCard('primary')}</View>
                </View>
                {duplicateMount ? (
                  <View style={styles.cardPanel}>
                    <Text style={styles.cardLabel}>Secondary</Text>
                    <View style={styles.eventsAdContainer}>{renderCard('secondary')}</View>
                  </View>
                ) : null}
              </View>
            ) : renderContext === 'events_flatlist' ? (
              <FlatList
                data={flatListData}
                key={`events-flatlist-${useWrapper}-${useAssets}-${useMedia}-${duplicateMount}`}
                scrollEnabled={false}
                removeClippedSubviews={false}
                contentContainerStyle={styles.eventsListContent}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  if (item.type === 'event') {
                    return (
                      <View style={styles.mockEventRow}>
                        <Text style={styles.mockEventTitle}>{item.title}</Text>
                        <Text style={styles.mockEventMeta}>Simulated Events list item</Text>
                      </View>
                    );
                  }

                  return (
                    <View style={styles.eventsAdContainer}>
                      <Text style={styles.cardLabel}>
                        {item.cardLabel === 'primary' ? 'Primary' : 'Secondary'}
                      </Text>
                      {renderCard(item.cardLabel)}
                    </View>
                  );
                }}
              />
            ) : (
              <FlatList
                data={eventsFeedData}
                key={`events-feed-${useWrapper}-${useAssets}-${useMedia}-${reuseFeedAdObject}-${sourceMode}-${tabType}`}
                nestedScrollEnabled
                style={styles.feedList}
                contentContainerStyle={styles.eventsListContent}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  if (item.type === 'event') {
                    return (
                      <View style={styles.mockEventRow}>
                        <Text style={styles.mockEventTitle}>{item.title}</Text>
                        <Text style={styles.mockEventMeta}>{item.subtitle}</Text>
                      </View>
                    );
                  }

                  return (
                    <View style={styles.eventsAdContainer}>
                      <Text style={styles.cardLabel}>{item.cardLabel}</Text>
                      {item.ad ? (
                        renderCard(item.cardLabel, item.ad)
                      ) : (
                        <Text style={styles.metaText}>No ad available for this feed slot.</Text>
                      )}
                    </View>
                  );
                }}
              />
            )
          ) : (
            <Text style={styles.metaText}>
              {sourceMode === 'test'
                ? 'No test ad is currently loaded.'
                : 'No ad available for this live slot yet.'}
            </Text>
          )}
        </View>

        <View style={styles.panel}>
          <View style={styles.logHeader}>
            <Text style={styles.sectionTitle}>Lab Log</Text>
            <TouchableOpacity onPress={() => setLogs([])}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.logBox}>
            {logs.length === 0 ? (
              <Text style={styles.logLine}>No logs yet.</Text>
            ) : (
              logs.map((line, index) => (
                <Text key={`${line}-${index}`} style={styles.logLine}>
                  {line}
                </Text>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  header: {
    backgroundColor: '#1E90FF',
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 36,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbe4f0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#22324a',
    marginBottom: 10,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#35506f',
    marginBottom: 8,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#b8c9de',
    backgroundColor: '#eef4fb',
  },
  toggleButtonActive: {
    backgroundColor: '#1E90FF',
    borderColor: '#1E90FF',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#315078',
  },
  toggleTextActive: {
    color: '#fff',
  },
  slotButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#b8c9de',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  slotButtonActive: {
    backgroundColor: '#1E90FF',
    borderColor: '#1E90FF',
  },
  slotText: {
    fontWeight: '700',
    color: '#315078',
  },
  slotTextActive: {
    color: '#fff',
  },
  metaText: {
    fontSize: 13,
    color: '#4d6480',
    marginBottom: 6,
  },
  errorText: {
    fontSize: 13,
    color: '#c0392b',
    marginTop: 4,
  },
  card: {
    borderWidth: 1,
    borderColor: '#d7e3f1',
    borderRadius: 14,
    backgroundColor: '#fff',
    padding: 12,
  },
  cardStack: {
    gap: 12,
  },
  cardPanel: {
    gap: 8,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4d6480',
  },
  eventsListContent: {
    paddingVertical: 16,
  },
  feedList: {
    maxHeight: 540,
  },
  eventsAdContainer: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 12,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  mockEventRow: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e4ebf4',
  },
  mockEventTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#22324a',
    marginBottom: 4,
  },
  mockEventMeta: {
    fontSize: 13,
    color: '#5b6f89',
  },
  badge: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#eef4fb',
    borderWidth: 1,
    borderColor: '#d7e3f1',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4d6480',
    textTransform: 'uppercase',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconImage: {
    width: 42,
    height: 42,
    borderRadius: 10,
    marginRight: 10,
  },
  iconPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: '#eef4fb',
  },
  headerText: {
    flex: 1,
  },
  headline: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16253d',
    marginBottom: 2,
  },
  advertiser: {
    fontSize: 13,
    color: '#627894',
  },
  mediaContainer: {
    height: 180,
    borderRadius: 12,
    backgroundColor: '#edf3f9',
    overflow: 'hidden',
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaView: {
    width: '100%',
    height: '100%',
    aspectRatio: undefined,
  },
  mediaFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaFallbackImage: {
    width: 96,
    height: 96,
  },
  mediaFallbackText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#5f7695',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#304966',
    marginBottom: 12,
  },
  ctaText: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1E90FF',
    color: '#fff',
    fontWeight: '700',
    overflow: 'hidden',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearText: {
    color: '#1E90FF',
    fontWeight: '700',
  },
  logBox: {
    marginTop: 8,
    backgroundColor: '#f7faff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    padding: 10,
    gap: 6,
  },
  logLine: {
    fontSize: 12,
    color: '#314760',
  },
});
