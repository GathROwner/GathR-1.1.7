import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

export default React.memo(function MapLogoBackdrop() {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (mounted) setReduceTransparency(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  return (
    <View testID="map-logo-backdrop" pointerEvents="none" accessible={false}
      importantForAccessibility="no-hide-descendants" style={styles.host}>
      <MaskedView style={StyleSheet.absoluteFill} androidRenderingMode="software" maskElement={
        <Svg width={108} height={48} viewBox="0 0 108 48">
          <Defs>
            <RadialGradient id="mapLogoFade" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="black" stopOpacity={1} />
              <Stop offset="55%" stopColor="black" stopOpacity={1} />
              <Stop offset="75%" stopColor="black" stopOpacity={0.8} />
              <Stop offset="90%" stopColor="black" stopOpacity={0.3} />
              <Stop offset="100%" stopColor="black" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={108} height={48} fill="url(#mapLogoFade)" />
        </Svg>
      }>
        {reduceTransparency ? (
          <View style={[StyleSheet.absoluteFill, styles.accessibleBackdrop]} />
        ) : (
          <BlurView intensity={55} tint="light" style={StyleSheet.absoluteFill} />
        )}
      </MaskedView>
    </View>
  );
});

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, top: -4, width: 108, height: 48 },
  accessibleBackdrop: { backgroundColor: '#F2F3F5' },
});
