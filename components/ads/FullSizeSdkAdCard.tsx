import React, { useState } from 'react';
import { Image, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { NativeAdView, NativeAsset, NativeAssetType, NativeMediaView } from 'react-native-google-mobile-ads';
import { AdColors, AdRadius, type AdColorScheme } from '@/constants/AdTheme';
import { getNativeAdMediaLayout } from '@/utils/nativeAdLayout';

type FullSizeSdkAdCardProps = { nativeAd: any; loading: boolean; allowMedia?: boolean };

export default function FullSizeSdkAdCard({ nativeAd, loading, allowMedia = true }: FullSizeSdkAdCardProps) {
  const colorScheme = (useColorScheme() ?? 'light') as AdColorScheme;
  const colors = AdColors[colorScheme];
  const window = useWindowDimensions();
  const [cardWidth, setCardWidth] = useState(() => Math.max(200, window.width - 16));
  const onLayout = (event: { nativeEvent: { layout: { width: number } } }) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) setCardWidth(previous => Math.abs(previous - width) < 1 ? previous : width);
  };

  if (loading) return <View onLayout={onLayout} style={[styles.card, styles.skeletonCard, { backgroundColor: colors.cardBackground }]}>
    <View style={[styles.skeletonMedia, { backgroundColor: colors.skeletonBase }]} />
    <View style={[styles.skeletonLine, { backgroundColor: colors.skeletonBase }]} />
    <View style={[styles.skeletonLine, styles.skeletonShort, { backgroundColor: colors.skeletonBase }]} />
  </View>;
  if (!nativeAd) return null;

  const safeText = (value: unknown) => value == null ? '' : typeof value === 'string' ? value : String(value);
  const headline = safeText(nativeAd.headline);
  const advertiser = safeText(nativeAd.advertiser);
  const body = safeText(nativeAd.body);
  const cta = safeText(nativeAd.callToAction);
  const iconUrl = nativeAd.icon?.url;
  const layout = getNativeAdMediaLayout({
    cardWidth, aspectRatio: nativeAd.mediaContent?.aspectRatio,
    hasMediaContent: Boolean(nativeAd.mediaContent), hasVideoContent: Boolean(nativeAd.mediaContent?.hasVideoContent),
    allowMedia, fontScale: window.fontScale,
  });

  const icon = iconUrl ? <NativeAsset assetType={NativeAssetType.ICON}>
    <Image source={{ uri: iconUrl }} style={[styles.icon, layout.split && styles.portraitIcon]} />
  </NativeAsset> : null;
  const title = headline ? <NativeAsset assetType={NativeAssetType.HEADLINE}>
    <Text style={[styles.headline, { color: colors.headline }]} numberOfLines={layout.split ? 3 : 2}>{headline}</Text>
  </NativeAsset> : null;
  const advertiserText = advertiser ? <NativeAsset assetType={NativeAssetType.ADVERTISER}>
    <Text style={[styles.advertiser, { color: colors.advertiser }]} numberOfLines={2}>{advertiser}</Text>
  </NativeAsset> : null;
  const description = body ? <NativeAsset assetType={NativeAssetType.BODY}>
    <Text style={[styles.body, { color: colors.body }]} numberOfLines={layout.split ? 5 : 2}>{body}</Text>
  </NativeAsset> : null;
  const action = cta ? <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
    <Text style={[styles.cta, layout.split ? styles.portraitCta : styles.footerCta,
      { backgroundColor: colors.ctaBackground, color: colors.ctaText }]} numberOfLines={2}>{cta}</Text>
  </NativeAsset> : null;
  const media = layout.kind !== 'compact' ? <View testID="native-ad-media-frame"
    style={[styles.media, { width: layout.mediaWidth, height: layout.mediaHeight, backgroundColor: colors.mediaPlaceholder }]}>
    <NativeMediaView
      // The frame owns dimensions, including for video creatives reporting ratio 0.
      style={[styles.mediaView, { aspectRatio: undefined }]} resizeMode="contain"
    />
  </View> : null;
  const disclosure = <View testID="native-ad-disclosure"
    style={[styles.disclosureRow, layout.split && styles.portraitDisclosure]}>
    <View style={[styles.badge, { backgroundColor: colors.badgeBackground, borderColor: colors.badgeBorder }]}>
      <Text style={[styles.badgeText, { color: colors.badgeText }]}>Sponsored</Text>
    </View>
  </View>;

  // Fabric's SDK view positions its own contentView using padding/border insets.
  // Keep decoration on a regular View so child coordinates are not inset twice.
  return <View onLayout={onLayout} testID="native-ad-card-frame"
    style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder,
      shadowColor: colors.shadowColor, shadowOpacity: colors.shadowOpacity }]}>
    <NativeAdView nativeAd={nativeAd} style={styles.sdkView}
      testID={`native-ad-card-${layout.split ? 'portrait' : layout.kind}`}>
    {/* Reserve the opposite corner for the SDK-owned AdChoices overlay. */}
    {!layout.split && disclosure}
    {layout.split ? <View style={styles.splitRow}>
      {media}
      <View style={[styles.splitDetails, { minHeight: layout.mediaHeight }]}>
        {disclosure}
        {icon}{title}{advertiserText}
        {description && <View style={styles.portraitBody}>{description}</View>}
        {action && <View style={styles.portraitAction}>{action}</View>}
      </View>
    </View> : <>
      {media && <View style={styles.stackedMedia}>{media}</View>}
      <View style={styles.footerRow}>
        <View style={styles.identity}>
          {icon}<View style={styles.identityText}>{title}{advertiserText}</View>
        </View>
        {action}
      </View>
      {description && <View style={styles.footerBody}>{description}</View>}
    </>}
    </NativeAdView>
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 8, borderRadius: AdRadius.md, overflow: 'hidden', borderWidth: 1,
    shadowOffset: { width: 0, height: 1 }, shadowRadius: 4, elevation: 3 },
  sdkView: { width: '100%' },
  disclosureRow: { minHeight: 18, paddingRight: 24, marginBottom: 8, alignItems: 'flex-start' },
  portraitDisclosure: { position: 'absolute', top: 0, left: 0, right: 0, marginBottom: 0 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  badgeText: { fontSize: 10, lineHeight: 12, fontWeight: '500', letterSpacing: 0.2 },
  media: { borderRadius: 10, overflow: 'hidden', alignSelf: 'center' },
  mediaView: { width: '100%', height: '100%' },
  stackedMedia: { alignItems: 'center', marginBottom: 8 },
  splitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  splitDetails: { flex: 1, minWidth: 0, justifyContent: 'center', paddingTop: 26 },
  portraitIcon: { marginRight: 0, marginBottom: 8 },
  portraitBody: { marginTop: 8 },
  portraitAction: { marginTop: 12 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  identityText: { flex: 1, minWidth: 0 },
  icon: { width: 36, height: 36, borderRadius: 8, marginRight: 8 },
  headline: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  advertiser: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  body: { fontSize: 14, lineHeight: 20 },
  footerBody: { marginTop: 8 },
  cta: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, overflow: 'hidden',
    fontSize: 13, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
  footerCta: { maxWidth: '40%' },
  portraitCta: { alignSelf: 'stretch' },
  skeletonCard: { minHeight: 300 },
  skeletonMedia: { height: 200, borderRadius: 10, marginTop: 26, marginBottom: 12 },
  skeletonLine: { height: 14, borderRadius: 4, marginBottom: 8 },
  skeletonShort: { width: '70%' },
});
