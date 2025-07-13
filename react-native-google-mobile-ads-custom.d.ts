// react-native-google-mobile-ads-custom.d.ts

declare module 'react-native-google-mobile-ads/NativeAdView' {
  import { ViewProps } from 'react-native';
  import React from 'react';
  export interface NativeAdViewProps extends ViewProps {
    nativeAd: any; // Replace with the proper type if available
  }
  const NativeAdView: React.FC<NativeAdViewProps>;
  export default NativeAdView;
}

declare module 'react-native-google-mobile-ads/NativeMediaView' {
  import { ViewProps } from 'react-native';
  import React from 'react';
  export interface NativeMediaViewProps extends ViewProps {}
  const NativeMediaView: React.FC<NativeMediaViewProps>;
  export default NativeMediaView;
}

declare module 'react-native-google-mobile-ads/NativeAsset' {
  import React from 'react';
  export interface NativeAssetProps {
    assetType: string; // You can refine this with specific string literal types
    children: React.ReactNode;
  }
  const NativeAsset: React.FC<NativeAssetProps>;
  export default NativeAsset;
}

declare module 'react-native-google-mobile-ads/NativeAssetType' {
  const NativeAssetType: {
    HEADLINE: string;
    BODY: string;
    ADVERTISER: string;
    CALL_TO_ACTION: string;
    STAR_RATING: string;
  };
  export default NativeAssetType;
}
