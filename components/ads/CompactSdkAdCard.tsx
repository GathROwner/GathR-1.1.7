import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View, useColorScheme } from 'react-native';
import {
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from 'react-native-google-mobile-ads';
import { AdColors, AdSpacing, AdRadius, type AdColorScheme } from '@/constants/AdTheme';

type CompactSdkAdCardProps = {
  nativeAd: any;
  loading: boolean;
  allowMedia?: boolean;
};

export default function CompactSdkAdCard({
  nativeAd,
  loading,
  allowMedia = true,
}: CompactSdkAdCardProps) {
  const colorScheme = (useColorScheme() ?? 'light') as AdColorScheme;
  const colors = AdColors[colorScheme];
  const [sdkMountReady, setSdkMountReady] = useState(Platform.OS !== 'ios');

  useEffect(() => {
    if (loading || !nativeAd) {
      setSdkMountReady(Platform.OS !== 'ios');
      return;
    }

    if (Platform.OS !== 'ios') {
      setSdkMountReady(true);
      return;
    }

    let cancelled = false;
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    setSdkMountReady(false);

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        timeoutId = setTimeout(() => {
          if (!cancelled) {
            setSdkMountReady(true);
          }
        }, 60);
      });
    });

    return () => {
      cancelled = true;
      if (firstFrame !== null) {
        cancelAnimationFrame(firstFrame);
      }
      if (secondFrame !== null) {
        cancelAnimationFrame(secondFrame);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [loading, nativeAd]);

  if (loading) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
        ]}
      >
        <View style={styles.skeletonHeader}>
          <View style={[styles.skeletonIcon, { backgroundColor: colors.skeletonBase }]} />
          <View style={styles.skeletonHeaderText}>
            <View style={[styles.skeletonLine, { backgroundColor: colors.skeletonBase }]} />
            <View style={[styles.skeletonLineSmall, { backgroundColor: colors.skeletonBase }]} />
          </View>
          <View style={[styles.skeletonCta, { backgroundColor: colors.skeletonBase }]} />
        </View>
        <View style={[styles.skeletonMedia, { backgroundColor: colors.skeletonBase }]} />
      </View>
    );
  }

  if (!nativeAd) {
    return null;
  }

  const safeText = (value: unknown) => {
    if (value === null || value === undefined) return '';
    return typeof value === 'string' ? value : String(value);
  };

  const headline = safeText(nativeAd.headline);
  const advertiser = safeText(nativeAd.advertiser);
  const body = safeText(nativeAd.body);
  const cta = safeText(nativeAd.callToAction);
  const iconUrl = nativeAd.icon?.url;
  const hasRenderableMedia = Boolean(
    allowMedia &&
      nativeAd.mediaContent &&
      (nativeAd.mediaContent.aspectRatio > 0 || nativeAd.mediaContent.hasVideoContent)
  );

  const renderPlainFallbackCard = () => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
          shadowColor: colors.shadowColor,
          shadowOpacity: colors.shadowOpacity,
        },
      ]}
    >
      <View
        style={[
          styles.contentContainer,
          {
            backgroundColor: colors.cardBackground,
          },
        ]}
      >
        <View style={styles.badgeRow}>
          <Text
            style={[
              styles.badgeText,
              styles.plainSponsoredText,
              {
                color: colors.badgeText,
                backgroundColor: colors.badgeBackground,
                borderColor: colors.badgeBorder,
              },
            ]}
          >
            Sponsored
          </Text>
        </View>

        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {iconUrl ? (
              <Image source={{ uri: iconUrl }} style={styles.iconImage} />
            ) : (
              <View
                style={[styles.iconPlaceholder, { backgroundColor: colors.mediaPlaceholder }]}
              />
            )}
            <View style={styles.headerTextColumn}>
              {headline ? (
                <Text style={[styles.headline, { color: colors.headline }]} numberOfLines={1}>
                  {headline}
                </Text>
              ) : null}
              {advertiser ? (
                <Text style={[styles.advertiser, { color: colors.advertiser }]} numberOfLines={1}>
                  {advertiser}
                </Text>
              ) : null}
            </View>
          </View>
          {cta ? (
            <Text
              style={[
                styles.ctaText,
                {
                  backgroundColor: colors.ctaBackground,
                  color: colors.ctaText,
                },
              ]}
              numberOfLines={1}
            >
              {cta}
            </Text>
          ) : null}
        </View>

        <View style={[styles.mediaContainer, { backgroundColor: colors.mediaPlaceholder }]}>
          {iconUrl ? (
            <Image source={{ uri: iconUrl }} style={styles.mediaFallbackImage} resizeMode="contain" />
          ) : (
            <Text style={[styles.mediaFallbackText, { color: colors.metaText }]}>
              {headline.charAt(0) || 'A'}
            </Text>
          )}
        </View>

        {body ? (
          <Text style={[styles.body, { color: colors.body }]} numberOfLines={2}>
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (!sdkMountReady) {
    return renderPlainFallbackCard();
  }

  return (
    <NativeAdView
      style={[
        styles.card,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
          shadowColor: colors.shadowColor,
          shadowOpacity: colors.shadowOpacity,
        },
      ]}
      nativeAd={nativeAd}
    >
      <View
        style={[
          styles.badge,
          {
            backgroundColor: colors.badgeBackground,
            borderColor: colors.badgeBorder,
          },
        ]}
      >
        <Text style={[styles.badgeText, { color: colors.badgeText }]}>Sponsored</Text>
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {iconUrl ? (
              <NativeAsset assetType={NativeAssetType.ICON}>
                <Image source={{ uri: iconUrl }} style={styles.iconImage} />
              </NativeAsset>
            ) : (
              <View
                style={[styles.iconPlaceholder, { backgroundColor: colors.mediaPlaceholder }]}
              />
            )}
            <View style={styles.headerTextColumn}>
              {headline ? (
                <NativeAsset assetType={NativeAssetType.HEADLINE}>
                  <Text style={[styles.headline, { color: colors.headline }]} numberOfLines={1}>
                    {headline}
                  </Text>
                </NativeAsset>
              ) : null}
              {advertiser ? (
                <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                  <Text style={[styles.advertiser, { color: colors.advertiser }]} numberOfLines={1}>
                    {advertiser}
                  </Text>
                </NativeAsset>
              ) : null}
            </View>
          </View>

          {cta ? (
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <Text
                style={[
                  styles.ctaText,
                  {
                    backgroundColor: colors.ctaBackground,
                    color: colors.ctaText,
                  },
                ]}
              >
                {cta}
              </Text>
            </NativeAsset>
          ) : null}
        </View>

        <View style={[styles.mediaContainer, { backgroundColor: colors.mediaPlaceholder }]}>
          {hasRenderableMedia ? (
            <NativeMediaView
              style={[styles.mediaView, { aspectRatio: undefined }]}
              resizeMode="cover"
            />
          ) : iconUrl ? (
            <Image source={{ uri: iconUrl }} style={styles.mediaFallbackImage} resizeMode="contain" />
          ) : (
            <Text style={[styles.mediaFallbackText, { color: colors.metaText }]}>
              {headline.charAt(0) || 'A'}
            </Text>
          )}
        </View>

        {body ? (
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text style={[styles.body, { color: colors.body }]} numberOfLines={2}>
              {body}
            </Text>
          </NativeAsset>
        ) : null}
      </View>
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: AdRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 3,
  },
  badge: {
    position: 'absolute',
    top: AdSpacing.xs,
    left: AdSpacing.xs,
    paddingHorizontal: AdSpacing.xs + 2,
    paddingVertical: 2,
    borderRadius: AdRadius.xs,
    borderWidth: 1,
    zIndex: 10,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  contentContainer: {
    padding: AdSpacing.sm,
  },
  badgeRow: {
    alignItems: 'flex-start',
    marginBottom: AdSpacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: AdSpacing.lg,
    marginBottom: AdSpacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
    marginRight: AdSpacing.sm,
  },
  headerTextColumn: {
    flex: 1,
  },
  iconImage: {
    width: 36,
    height: 36,
    borderRadius: AdRadius.sm,
    marginRight: AdSpacing.sm,
  },
  iconPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: AdRadius.sm,
    marginRight: AdSpacing.sm,
  },
  headline: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 2,
  },
  advertiser: {
    fontSize: 11,
    fontWeight: '400',
  },
  plainSponsoredText: {
    borderWidth: 1,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: AdSpacing.xs + 2,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '700',
  },
  mediaContainer: {
    width: '100%',
    height: 200,
    marginBottom: AdSpacing.sm,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: AdRadius.md,
  },
  mediaView: {
    width: '100%',
    height: '100%',
  },
  mediaFallbackImage: {
    width: 100,
    height: 100,
    borderRadius: AdRadius.lg,
  },
  mediaFallbackText: {
    fontSize: 24,
    fontWeight: '700',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  ctaText: {
    paddingHorizontal: AdSpacing.md,
    paddingVertical: AdSpacing.sm,
    borderRadius: AdRadius.sm,
    overflow: 'hidden',
    fontSize: 13,
    fontWeight: '600',
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: AdSpacing.sm,
    marginTop: AdSpacing.lg,
    gap: AdSpacing.sm,
  },
  skeletonIcon: {
    width: 36,
    height: 36,
    borderRadius: AdRadius.sm,
  },
  skeletonHeaderText: {
    flex: 1,
    gap: AdSpacing.xs,
  },
  skeletonLine: {
    height: 12,
    borderRadius: AdRadius.xs,
    width: '56%',
  },
  skeletonLineSmall: {
    height: 10,
    borderRadius: AdRadius.xs,
    width: '34%',
  },
  skeletonCta: {
    width: 72,
    height: 34,
    borderRadius: AdRadius.sm,
  },
  skeletonMedia: {
    height: 200,
    borderRadius: AdRadius.md,
    marginHorizontal: AdSpacing.sm,
    marginBottom: AdSpacing.sm,
  },
});
