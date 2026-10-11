import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

export default function EdgeBlur({ edge, androidBlurEnabled = true }: {
  edge: 'top' | 'bottom'; androidBlurEnabled?: boolean;
}) {
  const top = edge === 'top';
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
    <MaskedView androidRenderingMode="software" style={StyleSheet.absoluteFill} maskElement={
      <LinearGradient style={StyleSheet.absoluteFill}
        colors={top ? ['black', 'black', 'transparent'] : ['transparent', 'black', 'black']}
        locations={top ? [0, 0.6, 1] : [0, 0.7, 1]} />
    }>
      {reduceTransparency ? <View style={[StyleSheet.absoluteFill, { backgroundColor: '#F2F3F5' }]} /> : (
        <>
          <BlurView intensity={55} tint="light" style={StyleSheet.absoluteFill}
            experimentalBlurMethod={androidBlurEnabled ? 'dimezisBlurView' : 'none'} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
        </>
      )}
    </MaskedView>
  );
}
