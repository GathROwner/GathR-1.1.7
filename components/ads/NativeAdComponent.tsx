import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, useWindowDimensions } from 'react-native';
import { 
  NativeAdView,
  NativeMediaView
} from 'react-native-google-mobile-ads';
import { NativeAsset, NativeAssetType } from 'react-native-google-mobile-ads/src/ads/native-ad/NativeAsset';

interface NativeAdComponentProps {
  nativeAd: any;
  loading: boolean;
}

export default function NativeAdComponent({ nativeAd, loading }: NativeAdComponentProps) {
  const { width } = useWindowDimensions();
  
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

  // Safe text getter that ensures we have a string
  const getSafeText = (value: any): string => {
    if (value === null || value === undefined) return '';
    return typeof value === 'string' ? value : String(value);
  };

  // Custom StarRating component
  const StarRating = ({ rating }: { rating?: number }) => {
    if (!rating || rating <= 0) return null;
    
    const fullStars = Math.floor(rating);
    const halfStar = rating - fullStars >= 0.5;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
    
    return (
      <View style={styles.ratingContainer}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Full stars */}
          {Array.from({ length: fullStars }).map((_, i) => (
            <Text key={`full-${i}`} style={styles.starIcon}>★</Text>
          ))}
          
          {/* Half star */}
          {halfStar && (
            <Text style={styles.starIcon}>☆</Text>
          )}
          
          {/* Empty stars */}
          {Array.from({ length: emptyStars }).map((_, i) => (
            <Text key={`empty-${i}`} style={styles.emptyStarIcon}>☆</Text>
          ))}
          
          {/* Rating number */}
          <Text style={styles.ratingText}>
            {" " + rating.toFixed(1)}
          </Text>
        </View>
      </View>
    );
  };

  // Debug logging
  console.log('🐛 NativeAd properties:', {
    headline: nativeAd.headline,
    advertiser: nativeAd.advertiser,
    body: nativeAd.body,
    callToAction: nativeAd.callToAction,
    price: nativeAd.price,
    store: nativeAd.store,
    starRating: nativeAd.starRating
  });

  return (
    <NativeAdView 
      style={styles.adCard}
      nativeAd={nativeAd}
    >
      {/* Ad Badge (Required for attribution) */}
      <View style={styles.adBadgeContainer}>
        <Text style={styles.adBadgeText}>Ad</Text>
      </View>
      
      <View style={styles.contentContainer}>
        {/* Headline and Advertiser Row */}
        <View style={styles.headerRow}>
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
                <Text style={styles.advertiser}>
                  {getSafeText(nativeAd.advertiser)}
                </Text>
              </NativeAsset>
            )}
          </View>
        </View>
        
        {/* Media View with fixed height */}
        <View style={styles.mediaContainer}>
          <NativeMediaView 
            style={styles.mediaView} 
            resizeMode="cover"
          />
        </View>
        
        {/* Body text (if available) */}
        {nativeAd.body && getSafeText(nativeAd.body) && (
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text style={styles.body} numberOfLines={3}>
              {getSafeText(nativeAd.body)}
            </Text>
          </NativeAsset>
        )}
        
        {/* Store and Price Row - Now with custom star rating */}
        <View style={styles.infoRow}>
          {nativeAd.store && getSafeText(nativeAd.store) && (
            <NativeAsset assetType={NativeAssetType.STORE}>
              <Text style={styles.storeText}>
                {getSafeText(nativeAd.store)}
              </Text>
            </NativeAsset>
          )}
          
          {nativeAd.store && getSafeText(nativeAd.store) && nativeAd.price && getSafeText(nativeAd.price) && (
            <Text style={styles.separator}>•</Text>
          )}
          
          {nativeAd.price && getSafeText(nativeAd.price) && (
            <NativeAsset assetType={NativeAssetType.PRICE}>
              <Text style={styles.priceText}>
                {getSafeText(nativeAd.price)}
              </Text>
            </NativeAsset>
          )}
          
          {/* Custom star rating - no NativeAsset wrapper */}
          <StarRating rating={nativeAd.starRating} />
        </View>
        
        {/* Call to Action Button */}
        {nativeAd.callToAction && getSafeText(nativeAd.callToAction) && (
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <TouchableOpacity 
              style={styles.callToActionButton}
              activeOpacity={0.8}
              disabled={true}
            >
              <Text style={styles.callToActionText}>
                {getSafeText(nativeAd.callToAction)}
              </Text>
            </TouchableOpacity>
          </NativeAsset>
        )}
      </View>
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  adCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    margin: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  contentContainer: {
    padding: 12,
    width: '100%',
  },
  loadingText: {
    textAlign: 'center',
    padding: 16,
    color: '#666',
  },
  adBadgeContainer: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    minHeight: 20,
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#CCCCCC',
  },
  adBadgeText: {
    color: '#666666',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    marginTop: 20,
    marginBottom: 8,
    width: '100%',
  },
  headerTextColumn: {
    flex: 1,
    flexShrink: 1,
  },
  iconImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 8,
  },
  headline: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
  },
  advertiser: {
    fontSize: 14,
    color: '#666666',
  },
  mediaContainer: {
    width: '100%',
    height: 180,
    backgroundColor: '#EEEEEE',
    borderRadius: 6,
    marginVertical: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaView: {
    width: '100%',
    height: '100%',
    minWidth: 120,
    minHeight: 120,
  },
  body: {
    fontSize: 14,
    color: '#333333',
    lineHeight: 20,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  storeText: {
    fontSize: 12,
    color: '#666666',
  },
  separator: {
    fontSize: 12,
    color: '#666666',
    marginHorizontal: 4,
  },
  priceText: {
    fontSize: 12,
    color: '#666666',
  },
  ratingContainer: {
    marginLeft: 8,
  },
  starIcon: {
    fontSize: 12,
    color: '#f5a623',
  },
  emptyStarIcon: {
    fontSize: 12,
    color: '#ddd',
  },
  ratingText: {
    fontSize: 12,
    color: '#666666',
    marginLeft: 2,
  },
  callToActionButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  callToActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  }
});