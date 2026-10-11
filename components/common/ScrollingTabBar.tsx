import React from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { BottomTabBar, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTabDockBottom, TAB_DOCK_HEIGHT } from '../../constants/tabDock';
import { useFeedChrome } from '../../contexts/FeedChromeContext';
import EdgeBlur from './EdgeBlur';

export default function ScrollingTabBar(props: BottomTabBarProps) {
  const events = useFeedChrome('events');
  const specials = useFeedChrome('specials');
  const active = props.state.routes[props.state.index].name;
  const progress = active === 'events' ? events.progress : active === 'specials' ? specials.progress : null;
  const { bottom } = useSafeAreaInsets();
  const height = getTabDockBottom(Platform.OS, bottom) + TAB_DOCK_HEIGHT;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height,
        opacity: progress ? progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : 1,
      }}>
        <EdgeBlur edge="bottom" androidBlurEnabled={active !== 'map'} />
      </Animated.View>
      <BottomTabBar {...props} />
    </View>
  );
}
