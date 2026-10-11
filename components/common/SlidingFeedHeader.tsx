import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Header, getDefaultHeaderHeight, getHeaderTitle } from '@react-navigation/elements';
import { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedTab, useFeedChrome } from '../../contexts/FeedChromeContext';
import StatusBarBlur from './StatusBarBlur';

export default function SlidingFeedHeader({ layout, options, route }: BottomTabHeaderProps) {
  const insets = useSafeAreaInsets();
  const { progress, hidden } = useFeedChrome(route.name as FeedTab);
  const height = getDefaultHeaderHeight(layout, false, insets.top);
  return (
    <View pointerEvents="box-none" style={{ height, overflow: 'hidden' }}>
      <Animated.View pointerEvents={hidden ? 'none' : 'auto'} style={{
        transform: [{ translateY: progress.interpolate({
          inputRange: [0, 1], outputRange: [0, -height],
        }) }],
      }}>
        <Header {...options} layout={layout} title={getHeaderTitle(options, route.name)} />
      </Animated.View>
      {/* Cards extend beneath this small native blur; status icons stay legible. */}
      <StatusBarBlur>
        <Animated.View style={[StyleSheet.absoluteFill, {
          backgroundColor: '#1E90FF',
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        }]} />
      </StatusBarBlur>
    </View>
  );
}
