import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useOtaStatus } from '../../hooks/useOtaStatus';

export default function OtaSettingsIcon({ size, color }: { size: number; color: string }) {
  const { phase, readyId, downloadSequence } = useOtaStatus();
  const [reduceMotion, setReduceMotion] = useState(true);
  const [download, setDownload] = useState(false);
  const turn = useRef(new Animated.Value(0)).current;
  const seen = useRef(0);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (alive) setReduceMotion(enabled); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (reduceMotion || phase !== 'downloading' || !downloadSequence || seen.current === downloadSequence) return;
    seen.current = downloadSequence;
    const half = () => Animated.timing(turn, { toValue: 90, duration: 140, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const back = () => Animated.timing(turn, { toValue: 0, duration: 140, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Exactly two cog → download → cog flips, then rest as the cog.
    for (const offset of [0, 800]) {
      timers.push(setTimeout(() => { half().start(({ finished }) => { if (finished) { setDownload(true); turn.setValue(-90); back().start(); } }); }, offset));
      timers.push(setTimeout(() => { half().start(({ finished }) => { if (finished) { setDownload(false); turn.setValue(-90); back().start(); } }); }, offset + 400));
    }
    return () => { timers.forEach(clearTimeout); turn.stopAnimation(); turn.setValue(0); setDownload(false); };
  }, [downloadSequence, phase, reduceMotion, turn]);
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    <Animated.View style={{ transform: [{ perspective: 300 }, { rotateY: turn.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }) }] }}>
      <Ionicons name={download ? 'download-outline' : 'settings-outline'} size={size} color={color} />
    </Animated.View>
    {readyId && <View testID="ota-ready-dot" style={styles.dot} />}
  </View>;
}
const styles = StyleSheet.create({ dot: { position: 'absolute', right: -3, top: -2, width: 7, height: 7, borderRadius: 4, backgroundColor: '#1E90FF', borderWidth: 1, borderColor: '#FFFFFF' } });
