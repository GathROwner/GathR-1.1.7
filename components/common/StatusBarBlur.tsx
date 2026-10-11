import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function StatusBarBlur({ tint = 'dark', androidBlurEnabled = true, children }: {
  tint?: 'light' | 'dark'; androidBlurEnabled?: boolean; children?: React.ReactNode;
}) {
  const { top } = useSafeAreaInsets();
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
    <View pointerEvents="none" style={[styles.container, { height: top }]}>
      {reduceTransparency ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint === 'dark' ? '#0B0D10' : '#F2F3F5' }]} />
      ) : (
        <BlurView intensity={35} tint={tint}
          experimentalBlurMethod={androidBlurEnabled ? 'dimezisBlurView' : 'none'}
          style={StyleSheet.absoluteFill} />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 60, elevation: 60 },
});
