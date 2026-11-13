import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAcknowledgedRingProgress } from '../../hooks/useAcknowledgedRingProgress';
import { UNVERIFIED_RING_PROGRESS_MAX } from '../../utils/checkInReadinessPresentation';

function Ring({ name, radius, progress, ready, color, readyColor, emphasized, resetKey }: {
  name: 'here' | 'place'; radius: number; progress: number; ready: boolean;
  color: string; readyColor: string; emphasized: boolean; resetKey?: string;
}) {
  const circumference = 2 * Math.PI * radius;
  // The gap and authorization rules are unchanged; animation only approaches this target.
  const target = ready ? 1 : Math.min(UNVERIFIED_RING_PROGRESS_MAX, Math.max(0, progress));
  const displayed = useAcknowledgedRingProgress(target, resetKey);
  return <>
    <Circle cx={24} cy={24} r={radius} stroke={color} strokeOpacity={0.16} strokeWidth={3.5} fill="none" />
    {target > 0 && <Circle testID={`check-in-${name}-ring`} cx={24} cy={24} r={radius}
      stroke={ready ? readyColor : color} strokeWidth={ready ? (emphasized ? 5.5 : 4.5) : 3.5} fill="none"
      strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`}
      strokeDashoffset={circumference * (1 - displayed)} rotation={-90} origin="24, 24" />}
  </>;
}

export function ReadinessRings({ here, place, hereReady, placeReady, emphasizedRing, children, resetKey }: {
  here: number; place: number; hereReady: boolean; placeReady: boolean;
  emphasizedRing?: 'here' | 'place'; children: React.ReactNode; resetKey?: string;
}) {
  return <View style={styles.rings} pointerEvents="none">
    <Svg width={36} height={36} viewBox="0 0 48 48" style={StyleSheet.absoluteFill}>
      <Ring name="place" radius={21.5} progress={place} ready={placeReady} color="#2F80ED"
        readyColor="#175CD3" emphasized={emphasizedRing === 'place'} resetKey={resetKey} />
      <Ring name="here" radius={16} progress={here} ready={hereReady} color="#8B5CF6"
        readyColor="#6D28D9" emphasized={emphasizedRing === 'here'} resetKey={resetKey} />
    </Svg>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  rings: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
