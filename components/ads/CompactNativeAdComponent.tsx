import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Platform,
  useColorScheme,
} from 'react-native';
import { NativeAdView, NativeMediaView, NativeAsset, NativeAssetType } from 'react-native-google-mobile-ads';
import { AdColors, AdSpacing, AdRadius, AdAnimations, type AdColorScheme } from '@/constants/AdTheme';

interface CompactNativeAdComponentProps {
  nativeAd: any;
  loading: boolean;
}

const COMPACT_NATIVE_AD_DISABLE_MEDIA_VIEW_DEBUG = true;
const COMPACT_NATIVE_AD_DISABLE_WRAPPER_DEBUG = true;

// Star Rating Component (Compact version)
const StarRating = ({ rating, colors }: { rating: number; colors: typeof AdColors.light }) => {
  if (!rating || rating <= 0) return null;

  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <View style={styles.ratingContainer}>
      {Array.from({ length: fullStars }).map((_, i) => (
        <Text key={`full-${i}`} style={[styles.star, { color: colors.starActive }]}>
          ★
        </Text>
      ))}
      {hasHalfStar && (
        <Text style={[styles.star, { color: colors.starActive }]}>★</Text>
      )}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <Text key={`empty-${i}`} style={[styles.star, { color: colors.starInactive }]}>
          ☆
        </Text>
      ))}
      <Text style={[styles.ratingText, { color: colors.metaText }]}>
        {rating.toFixed(1)}
      </Text>
    </View>
  );
};

// Compact Loading Skeleton
const CompactAdSkeleton = ({ colors }: { colors: typeof AdColors.light }) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    shimmer.start();
    return () => shimmer.stop();
  }, []);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  return (
    <View style={[styles.adCard, { backgroundColor: colors.cardBackground }]}>
      <View style={styles.skeletonHeader}>
        <Animated.View
          style={[
            styles.skeletonIcon,
            { backgroundColor: colors.skeletonBase, opacity },
          ]}
        />
        <View style={styles.skeletonHeaderText}>
          <Animated.View
            style={[
              styles.skeletonLine,
              { width: '50%', backgroundColor: colors.skeletonBase, opacity },
            ]}
          />
          <Animated.View
            style={[
              styles.skeletonLineSmall,
              { width: '35%', backgroundColor: colors.skeletonBase, opacity },
            ]}
          />
        </View>
        <Animated.View
          style={[
            styles.skeletonCta,
            { backgroundColor: colors.skeletonBase, opacity },
          ]}
        />
      </View>
      <Animated.View
        style={[
          styles.skeletonMedia,
          { backgroundColor: colors.skeletonBase, opacity },
        ]}
      />
    </View>
  );
};

export default function CompactNativeAdComponent({ nativeAd, loading }: CompactNativeAdComponentProps) {
  const colorScheme = (useColorScheme() ?? 'light') as AdColorScheme;
  const colors = AdColors[colorScheme];

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    if (nativeAd && !loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: AdAnimations.fadeIn,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [nativeAd, loading]);

  // Show skeleton while loading
  if (loading) {
    return <CompactAdSkeleton colors={colors} />;
  }

  if (!nativeAd) {
    return null;
  }

  // Safe text getter
  const getSafeText = (value: any): string => {
    if (value === null || value === undefined) return '';
    return typeof value === 'string' ? value : String(value);
  };

  if (COMPACT_NATIVE_AD_DISABLE_WRAPPER_DEBUG) {
    return (
      <Animated.View
        style={[
          styles.animatedContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View
          style={[
            styles.adCard,
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
              styles.sponsoredBadge,
              {
                backgroundColor: colors.badgeBackground,
                borderColor: colors.badgeBorder,
              },
            ]}
          >
            <Text style={[styles.sponsoredText, { color: colors.badgeText }]}>
              Sponsored
            </Text>
          </View>

          <View style={styles.contentContainer}>
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                {nativeAd.icon?.url ? (
                  <Image
                    source={{ uri: nativeAd.icon.url }}
                    style={styles.iconImage}
                  />
                ) : null}
                <View style={styles.headerTextColumn}>
                  {getSafeText(nativeAd.headline) ? (
                    <Text
                      style={[styles.headline, { color: colors.headline }]}
                      numberOfLines={1}
                    >
                      {getSafeText(nativeAd.headline)}
                    </Text>
                  ) : null}
                  {getSafeText(nativeAd.advertiser) ? (
                    <Text
                      style={[styles.advertiser, { color: colors.advertiser }]}
                      numberOfLines={1}
                    >
                      {getSafeText(nativeAd.advertiser)}
                    </Text>
                  ) : null}
                </View>
              </View>

              {getSafeText(nativeAd.callToAction) ? (
                <View style={[styles.ctaButton, { backgroundColor: colors.ctaBackground }]}>
                  <Text style={[styles.ctaText, { color: colors.ctaText }]}>
                    {getSafeText(nativeAd.callToAction)}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.mediaContainer, { backgroundColor: colors.mediaPlaceholder }]}>
              <View style={styles.mediaFallback}>
                {nativeAd.icon?.url ? (
                  <Image
                    source={{ uri: nativeAd.icon.url }}
                    style={styles.mediaFallbackImage}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={[styles.mediaFallbackText, { color: colors.metaText }]}>
                    {getSafeText(nativeAd.headline).charAt(0) || 'Ad'}
                  </Text>
                )}
              </View>
            </View>

            {getSafeText(nativeAd.body) ? (
              <Text
                style={[styles.body, { color: colors.body }]}
                numberOfLines={2}
              >
                {getSafeText(nativeAd.body)}
              </Text>
            ) : null}

            <View style={styles.infoRow}>
              {getSafeText(nativeAd.store) ? (
                <Text style={[styles.metaText, { color: colors.metaText }]}>
                  {getSafeText(nativeAd.store)}
                </Text>
              ) : null}
              {getSafeText(nativeAd.store) && getSafeText(nativeAd.price) ? (
                <Text style={[styles.metaSeparator, { color: colors.metaText }]}>
                  ·
                </Text>
              ) : null}
              {getSafeText(nativeAd.price) ? (
                <Text style={[styles.metaText, { color: colors.metaText }]}>
                  {getSafeText(nativeAd.price)}
                </Text>
              ) : null}
              {nativeAd.starRating && nativeAd.starRating > 0 ? (
                <StarRating rating={nativeAd.starRating} colors={colors} />
              ) : null}
            </View>
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.animatedContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <NativeAdView
        style={[
          styles.adCard,
          {
            backgroundColor: colors.cardBackground,
            borderColor: colors.cardBorder,
            shadowColor: colors.shadowColor,
            shadowOpacity: colors.shadowOpacity,
          },
        ]}
        nativeAd={nativeAd}
      >
        {/* Sponsored Badge */}
        <View
          style={[
            styles.sponsoredBadge,
            {
              backgroundColor: colors.badgeBackground,
              borderColor: colors.badgeBorder,
            },
          ]}
        >
          <Text style={[styles.sponsoredText, { color: colors.badgeText }]}>
            Sponsored
          </Text>
        </View>

        <View style={styles.contentContainer}>
          {/* Header: Icon + Text + CTA */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {nativeAd.icon?.url && (
                <NativeAsset assetType={NativeAssetType.ICON}>
                  <Image
                    source={{ uri: nativeAd.icon.url }}
                    style={styles.iconImage}
                  />
                </NativeAsset>
              )}
              <View style={styles.headerTextColumn}>
                {nativeAd.headline && (
                  <NativeAsset assetType={NativeAssetType.HEADLINE}>
                    <Text
                      style={[styles.headline, { color: colors.headline }]}
                      numberOfLines={1}
                    >
                      {getSafeText(nativeAd.headline)}
                    </Text>
                  </NativeAsset>
                )}
                {nativeAd.advertiser && getSafeText(nativeAd.advertiser) && (
                  <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                    <Text
                      style={[styles.advertiser, { color: colors.advertiser }]}
                      numberOfLines={1}
                    >
                      {getSafeText(nativeAd.advertiser)}
                    </Text>
                  </NativeAsset>
                )}
              </View>
            </View>

            {/* CTA asset must be a direct child of NativeAsset */}
            {nativeAd.callToAction && getSafeText(nativeAd.callToAction) && (
              <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                <Text
                  style={[
                    styles.ctaAssetText,
                    {
                      backgroundColor: colors.ctaBackground,
                      color: colors.ctaText,
                    },
                  ]}
                >
                  {getSafeText(nativeAd.callToAction)}
                </Text>
              </NativeAsset>
            )}
          </View>

          {/* Media - Compact height */}
          {/* Debug isolation: force fallback media rendering without NativeMediaView */}
          <View style={[styles.mediaContainer, { backgroundColor: colors.mediaPlaceholder }]}>
            {!COMPACT_NATIVE_AD_DISABLE_MEDIA_VIEW_DEBUG && nativeAd.mediaContent && (nativeAd.mediaContent.aspectRatio > 0 || nativeAd.mediaContent.hasVideoContent) ? (
              <NativeMediaView
                style={[styles.mediaView, { aspectRatio: undefined }]}
                resizeMode="cover"
              />
            ) : (
              /* Fallback only when there's no valid media content */
              <View style={styles.mediaFallback}>
                {nativeAd.icon?.url ? (
                  <Image
                    source={{ uri: nativeAd.icon.url }}
                    style={styles.mediaFallbackImage}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={[styles.mediaFallbackText, { color: colors.metaText }]}>
                    {getSafeText(nativeAd.headline).charAt(0) || 'Ad'}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Body text (optional in compact) */}
          {nativeAd.body && getSafeText(nativeAd.body) && (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text
                style={[styles.body, { color: colors.body }]}
                numberOfLines={2}
              >
                {getSafeText(nativeAd.body)}
              </Text>
            </NativeAsset>
          )}

          {/* Info Row */}
          <View style={styles.infoRow}>
            {getSafeText(nativeAd.store) ? (
              <NativeAsset assetType={NativeAssetType.STORE}>
                <Text style={[styles.metaText, { color: colors.metaText }]}>
                  {getSafeText(nativeAd.store)}
                </Text>
              </NativeAsset>
            ) : null}
            {getSafeText(nativeAd.store) && getSafeText(nativeAd.price) ? (
              <Text style={[styles.metaSeparator, { color: colors.metaText }]}>
                ·
              </Text>
            ) : null}
            {getSafeText(nativeAd.price) ? (
              <NativeAsset assetType={NativeAssetType.PRICE}>
                <Text style={[styles.metaText, { color: colors.metaText }]}>
                  {getSafeText(nativeAd.price)}
                </Text>
              </NativeAsset>
            ) : null}
            {nativeAd.starRating && nativeAd.starRating > 0 ? (
              <NativeAsset assetType={NativeAssetType.STAR_RATING}>
                <Text style={[styles.ratingText, { color: colors.metaText }]}>
                  {`${nativeAd.starRating.toFixed(1)}★`}
                </Text>
              </NativeAsset>
            ) : null}
          </View>
        </View>
      </NativeAdView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  animatedContainer: {
    marginHorizontal: AdSpacing.xs,
    marginVertical: AdSpacing.sm,
  },
  adCard: {
    borderRadius: AdRadius.md,
    overflow: 'hidden',
    borderWidth: Platform.OS === 'android' ? 1 : 0,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 3,
  },

  // Sponsored Badge
  sponsoredBadge: {
    position: 'absolute',
    top: AdSpacing.xs,
    left: AdSpacing.xs,
    paddingHorizontal: AdSpacing.xs + 2,
    paddingVertical: 2,
    borderRadius: AdRadius.xs,
    borderWidth: 1,
    zIndex: 10,
  },
  sponsoredText: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  contentContainer: {
    padding: AdSpacing.sm,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: AdSpacing.lg, // Space for badge
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

  // CTA in header
  ctaButton: {
    paddingVertical: AdSpacing.xs + 2,
    paddingHorizontal: AdSpacing.md,
    borderRadius: AdRadius.sm,
  },
  ctaButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  ctaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ctaAssetText: {
    paddingVertical: AdSpacing.xs + 2,
    paddingHorizontal: AdSpacing.md,
    borderRadius: AdRadius.sm,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    overflow: 'hidden',
  },

  // Media - Compact
  mediaContainer: {
    width: '100%',
    height: 200,
    borderRadius: AdRadius.sm,
    overflow: 'hidden',
    marginBottom: AdSpacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaView: {
    width: '100%',
    height: '100%',
  },
  mediaFallback: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaFallbackImage: {
    width: 80,
    height: 80,
    borderRadius: AdRadius.md,
  },
  mediaFallbackText: {
    fontSize: 18,
    fontWeight: '700',
  },

  // Body
  body: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: AdSpacing.xs,
  },

  // Info Row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: AdSpacing.xs,
  },
  metaText: {
    fontSize: 10,
  },
  metaSeparator: {
    fontSize: 10,
  },

  // Rating
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: AdSpacing.xs,
  },
  star: {
    fontSize: 10,
  },
  ratingText: {
    fontSize: 10,
    marginLeft: 2,
  },

  // Skeleton styles
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: AdSpacing.sm,
    paddingTop: AdSpacing.lg + AdSpacing.sm,
  },
  skeletonIcon: {
    width: 36,
    height: 36,
    borderRadius: AdRadius.sm,
    marginRight: AdSpacing.sm,
  },
  skeletonHeaderText: {
    flex: 1,
    gap: AdSpacing.xs,
  },
  skeletonLine: {
    height: 12,
    borderRadius: AdRadius.xs,
  },
  skeletonLineSmall: {
    height: 10,
    borderRadius: AdRadius.xs,
  },
  skeletonCta: {
    width: 60,
    height: 28,
    borderRadius: AdRadius.sm,
  },
  skeletonMedia: {
    height: 140,
    marginHorizontal: AdSpacing.sm,
    marginBottom: AdSpacing.sm,
    borderRadius: AdRadius.sm,
  },
});
