import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { NativeAdView, NativeMediaView } from 'react-native-google-mobile-ads';
import { NativeAsset, NativeAssetType } from 'react-native-google-mobile-ads/src/ads/native-ad/NativeAsset';

interface CompactNativeAdComponentProps {
  nativeAd: any;
  loading: boolean;
}

export default function CompactNativeAdComponent({ nativeAd, loading }: CompactNativeAdComponentProps) {
  if (loading) {
    return (
      <View style={styles.adCard}>
        <Text style={styles.loadingText}>Ad is loading...</Text>
      </View>
    );
  }

  if (!nativeAd) {
    return null;
  }

  const getSafeText = (value: any): string => {
    if (value === null || value === undefined) return '';
    return typeof value === 'string' ? value : String(value);
  };

  const StarRating = ({ rating }: { rating?: number }) => {
    if (!rating || rating <= 0) return null;
    const fullStars = Math.floor(rating);
    const halfStar = rating - fullStars >= 0.5;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

    return (
      <View style={styles.ratingContainer}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {Array.from({ length: fullStars }).map((_, i) => (
            <Text key={`full-${i}`} style={styles.starIcon}>★</Text>
          ))}
          {halfStar && <Text style={styles.starIcon}>☆</Text>}
          {Array.from({ length: emptyStars }).map((_, i) => (
            <Text key={`empty-${i}`} style={styles.emptyStarIcon}>☆</Text>
          ))}
          <Text style={styles.ratingText}>{" " + rating.toFixed(1)}</Text>
        </View>
      </View>
    );
  };

  return (
    <NativeAdView style={styles.adCard} nativeAd={nativeAd}>
      <View style={styles.adBadgeContainer}>
        <Text style={styles.adBadgeText}>Ad</Text>
      </View>
      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {nativeAd.icon && (
              <NativeAsset assetType={NativeAssetType.ICON}>
                <Image
                  source={{ uri: nativeAd.icon.url }}
                  style={styles.iconImage}
                  resizeMode="contain"
                />
              </NativeAsset>
            )}
            <View style={styles.headerTextColumn}>
              {nativeAd.headline && (
                <NativeAsset assetType={NativeAssetType.HEADLINE}>
                  <Text style={styles.headline} numberOfLines={2}>
                    {getSafeText(nativeAd.headline)}
                  </Text>
                </NativeAsset>
              )}
              {nativeAd.advertiser && getSafeText(nativeAd.advertiser) && (
                <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                  <Text style={styles.advertiser} numberOfLines={1}>
                    {getSafeText(nativeAd.advertiser)}
                  </Text>
                </NativeAsset>
              )}
            </View>
          </View>
          {nativeAd.callToAction && getSafeText(nativeAd.callToAction) && (
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <TouchableOpacity
                style={styles.callToActionButton}
                activeOpacity={0.8}
                disabled={true}
              >
                <Text style={styles.callToActionText} numberOfLines={1}>
                  {getSafeText(nativeAd.callToAction)}
                </Text>
              </TouchableOpacity>
            </NativeAsset>
          )}
        </View>
        <View style={styles.mediaContainer}>
          <NativeMediaView style={styles.mediaView} resizeMode="cover" />
        </View>
        {nativeAd.body && getSafeText(nativeAd.body) && (
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text style={styles.body} numberOfLines={2}>
              {getSafeText(nativeAd.body)}
            </Text>
          </NativeAsset>
        )}
        <View style={styles.infoRow}>
          {nativeAd.store && getSafeText(nativeAd.store) && (
            <NativeAsset assetType={NativeAssetType.STORE}>
              <Text style={styles.storeText} numberOfLines={1}>
                {getSafeText(nativeAd.store)}
              </Text>
            </NativeAsset>
          )}
          {nativeAd.store && getSafeText(nativeAd.store) && nativeAd.price && getSafeText(nativeAd.price) && (
            <Text style={styles.separator}>•</Text>
          )}
          {nativeAd.price && getSafeText(nativeAd.price) && (
            <NativeAsset assetType={NativeAssetType.PRICE}>
              <Text style={styles.priceText} numberOfLines={1}>
                {getSafeText(nativeAd.price)}
              </Text>
            </NativeAsset>
          )}
          <StarRating rating={nativeAd.starRating} />
        </View>
      </View>
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  adCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginVertical: 8,
    marginHorizontal: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  contentContainer: {
    padding: 8,
    width: '100%',
  },
  loadingText: {
    textAlign: 'center',
    padding: 12,
    color: '#666',
    fontSize: 12,
  },
  adBadgeContainer: {
    position: 'absolute',
    top: 2,
    left: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 16,
    minHeight: 16,
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#CCCCCC',
  },
  adBadgeText: {
    color: '#666666',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    marginTop: 14,
    marginBottom: 6,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    flex: 1,
    marginRight: 8,
  },
  headerTextColumn: {
    flex: 1,
    flexShrink: 1,
  },
  iconImage: {
    width: 32,
    height: 32,
    borderRadius: 4,
    marginRight: 6,
  },
  headline: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 2,
  },
  advertiser: {
    fontSize: 12,
    color: '#666666',
  },
  mediaContainer: {
    width: '100%',
    height: 120,
    backgroundColor: '#EEEEEE',
    borderRadius: 4,
    marginVertical: 6,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaView: {
    width: '100%',
    height: '100%',
    minWidth: 100,
    minHeight: 100,
  },
  body: {
    fontSize: 12,
    color: '#333333',
    lineHeight: 16,
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 4,
    width: '100%',
  },
  storeText: {
    fontSize: 10,
    color: '#666666',
  },
  separator: {
    fontSize: 10,
    color: '#666666',
    marginHorizontal: 3,
  },
  priceText: {
    fontSize: 10,
    color: '#666666',
  },
  ratingContainer: {
    marginLeft: 6,
  },
  starIcon: {
    fontSize: 10,
    color: '#f5a623',
  },
  emptyStarIcon: {
    fontSize: 10,
    color: '#ddd',
  },
  ratingText: {
    fontSize: 10,
    color: '#666666',
    marginLeft: 2,
  },
  callToActionButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  callToActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});