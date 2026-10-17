import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EdgeBlur from './EdgeBlur';

export default function StatusBarBlur({ androidBlurEnabled = true, children }: {
  androidBlurEnabled?: boolean; children?: React.ReactNode;
}) {
  const { top } = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.container, { height: top }]}>
      <EdgeBlur edge="top" androidBlurEnabled={androidBlurEnabled} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 60, elevation: 60 },
});
