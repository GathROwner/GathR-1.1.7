import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Animated,
  Platform,
  useColorScheme,
} from 'react-native';
import {
  NativeAdView,
  NativeMediaView,
} from 'react-native-google-mobile-ads';
import { NativeAsset, NativeAssetType } from 'react-native-google-mobile-ads/src/ads/native-ad/NativeAsset';
import { AdColors, AdSpacing, AdRadius, AdAnimations, type AdColorScheme } from '@/constants/AdTheme';

interface NativeAdComponentProps {
  nativeAd: any;
  loading: boolean;
}

// Star Rating Component
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

// Loading Skeleton Component
const AdSkeleton = ({ colors }: { colors: typeof AdColors.light }) => {
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
      {/* Header skeleton */}
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
              { width: '60%', backgroundColor: colors.skeletonBase, opacity },
            ]}
          />
          <Animated.View
            style={[
              styles.skeletonLineSmall,
              { width: '40%', backgroundColor: colors.skeletonBase, opacity },
            ]}
          />
        </View>
      </View>

      {/* Media skeleton */}
      <Animated.View
        style={[
          styles.skeletonMedia,
          { backgroundColor: colors.skeletonBase, opacity },
        ]}
      />

      {/* Body skeleton */}
      <View style={styles.skeletonBody}>
        <Animated.View
          style={[
            styles.skeletonLine,
            { width: '90%', backgroundColor: colors.skeletonBase, opacity },
          ]}
        />
        <Animated.View
          style={[
            styles.skeletonLine,
            { width: '70%', backgroundColor: colors.skeletonBase, opacity },
          ]}
        />
      </View>

      {/* CTA skeleton */}
      <View style={styles.skeletonCta}>
        <Animated.View
          style={[
            styles.skeletonButton,
            { backgroundColor: colors.skeletonBase, opacity },
          ]}
        />
      </View>
    </View>
  );
};

export default function NativeAdComponent({ nativeAd, loading }: NativeAdComponentProps) {
  const colorScheme = (useColorScheme() ?? 'light') as AdColorScheme;
  const colors = AdColors[colorScheme];

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;

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
    return <AdSkeleton colors={colors} />;
  }

  if (!nativeAd) {
    return null;
  }

  // Safe text getter
  const getSafeText = (value: any): string => {
    if (value === null || value === undefined) return '';
    return typeof value === 'string' ? value : String(value);
  };

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
        {/* Sponsored Badge - Subtle pill style */}
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

        {/* Header: Icon + Headline + Advertiser */}
        <View style={styles.header}>
          {nativeAd.icon?.url && (
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image
                source={{ uri: nativeAd.icon.url }}
                style={styles.iconImage}
              />
            </NativeAsset>
          )}
          <View style={styles.headerText}>
            {nativeAd.headline && (
              <NativeAsset assetType={NativeAssetType.HEADLINE}>
                <Text
                  style={[styles.headline, { color: colors.headline }]}
                  numberOfLines={2}
                >
                  {getSafeText(nativeAd.headline)}
                </Text>
              </NativeAsset>
            )}
            {nativeAd.advertiser && getSafeText(nativeAd.advertiser) && (
              <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                <Text style={[styles.advertiser, { color: colors.advertiser }]}>
                  {getSafeText(nativeAd.advertiser)}
                </Text>
              </NativeAsset>
            )}
          </View>
        </View>

        {/* Media - Full bleed social media style */}
        {/* Show NativeMediaView if aspectRatio > 0 OR hasVideoContent (video ads may have aspectRatio=0) */}
        {/* IMPORTANT: Override aspectRatio with undefined to prevent NativeMediaView from collapsing when aspectRatio=0 */}
        <View style={[styles.mediaContainer, { backgroundColor: colors.mediaPlaceholder }]}>
          {nativeAd.mediaContent && (nativeAd.mediaContent.aspectRatio > 0 || nativeAd.mediaContent.hasVideoContent) ? (
            <NativeMediaView style={[styles.mediaView, { aspectRatio: undefined }]} resizeMode="cover" />
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

        {/* Body text */}
        {nativeAd.body && getSafeText(nativeAd.body) && (
          <View style={styles.bodyContainer}>
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text
                style={[styles.body, { color: colors.body }]}
                numberOfLines={2}
              >
                {getSafeText(nativeAd.body)}
              </Text>
            </NativeAsset>
          </View>
        )}

        {/* Info Row: Store, Price, Rating */}
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
            <StarRating rating={nativeAd.starRating} colors={colors} />
          ) : null}
        </View>

        {/* CTA Button - Modern with press feedback */}
        {nativeAd.callToAction && getSafeText(nativeAd.callToAction) && (
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Pressable
              style={({ pressed }) => [
                styles.ctaButton,
                { backgroundColor: pressed ? colors.ctaPressed : colors.ctaBackground },
                pressed && styles.ctaButtonPressed,
              ]}
              disabled={true}
            >
              <Text style={[styles.ctaText, { color: colors.ctaText }]}>
                {getSafeText(nativeAd.callToAction)}
              </Text>
            </Pressable>
          </NativeAsset>
        )}
      </NativeAdView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  animatedContainer: {
    marginHorizontal: AdSpacing.md,
    marginVertical: AdSpacing.sm,
  },
  adCard: {
    borderRadius: AdRadius.lg,
    overflow: 'hidden',
    borderWidth: Platform.OS === 'android' ? 1 : 0,
    // Shadow for iOS
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    // Elevation for Android
    elevation: 4,
  },

  // Sponsored Badge
  sponsoredBadge: {
    position: 'absolute',
    top: AdSpacing.sm,
    left: AdSpacing.sm,
    paddingHorizontal: AdSpacing.sm,
    paddingVertical: AdSpacing.xs,
    borderRadius: AdRadius.xs,
    borderWidth: 1,
    zIndex: 10,
  },
  sponsoredText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: AdSpacing.lg,
    paddingTop: AdSpacing.xl + AdSpacing.lg, // Extra space for badge
    paddingBottom: AdSpacing.md,
  },
  iconImage: {
    width: 44,
    height: 44,
    borderRadius: AdRadius.sm,
    marginRight: AdSpacing.md,
  },
  headerText: {
    flex: 1,
    justifyContent: 'center',
  },
  headline: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
    marginBottom: AdSpacing.xs,
  },
  advertiser: {
    fontSize: 13,
    fontWeight: '400',
  },

  // Media - Full bleed
  mediaContainer: {
    width: '100%',
    height: 200,
    marginBottom: AdSpacing.md,
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
    width: 100,
    height: 100,
    borderRadius: AdRadius.lg,
  },
  mediaFallbackText: {
    fontSize: 24,
    fontWeight: '700',
  },

  // Body
  bodyContainer: {
    paddingHorizontal: AdSpacing.lg,
    marginBottom: AdSpacing.sm,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },

  // Info Row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: AdSpacing.lg,
    marginBottom: AdSpacing.md,
    gap: AdSpacing.xs,
  },
  metaText: {
    fontSize: 12,
  },
  metaSeparator: {
    fontSize: 12,
    marginHorizontal: AdSpacing.xs,
  },

  // Rating
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: AdSpacing.sm,
  },
  star: {
    fontSize: 12,
  },
  ratingText: {
    fontSize: 12,
    marginLeft: AdSpacing.xs,
  },

  // CTA Button
  ctaButton: {
    marginHorizontal: AdSpacing.lg,
    marginBottom: AdSpacing.lg,
    paddingVertical: AdSpacing.md,
    borderRadius: AdRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Skeleton styles
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: AdSpacing.lg,
  },
  skeletonIcon: {
    width: 44,
    height: 44,
    borderRadius: AdRadius.sm,
    marginRight: AdSpacing.md,
  },
  skeletonHeaderText: {
    flex: 1,
    gap: AdSpacing.sm,
  },
  skeletonLine: {
    height: 14,
    borderRadius: AdRadius.xs,
  },
  skeletonLineSmall: {
    height: 12,
    borderRadius: AdRadius.xs,
  },
  skeletonMedia: {
    width: '100%',
    height: 200,
  },
  skeletonBody: {
    padding: AdSpacing.lg,
    gap: AdSpacing.sm,
  },
  skeletonCta: {
    paddingHorizontal: AdSpacing.lg,
    paddingBottom: AdSpacing.lg,
  },
  skeletonButton: {
    height: 44,
    borderRadius: AdRadius.md,
  },
});
