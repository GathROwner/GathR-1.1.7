import React, { useEffect, useRef, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated, NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useMapStore } from '../../store';
import {
  formatFilterCount, getEventCategoryOptions, shouldShowEventCategoryScrollCue,
} from './eventFilterPanelModel';

export const getEventCategoryIcon = (category: string): keyof typeof MaterialIcons.glyphMap => {
  const value = category.toLowerCase();
  if (value.includes('music')) return 'audiotrack';
  if (value.includes('comedy')) return 'sentiment-very-satisfied';
  if (value.includes('sport')) return 'sports-basketball';
  if (value.includes('trivia')) return 'psychology-alt';
  if (value.includes('workshop') || value.includes('class')) return 'school';
  if (value.includes('religious') || value.includes('church')) return 'church';
  if (value.includes('family')) return 'family-restroom';
  if (value.includes('gathering') || value.includes('parties')) return 'nightlife';
  if (value.includes('cinema') || value.includes('movie')) return 'theaters';
  return 'category';
};

type Props = { counts: Record<string, number>; allCount: number; maxHeight: number };

export default function EventCategoryOptions({ counts, allCount, maxHeight }: Props) {
  const activeCategory = useMapStore(state => state.filterCriteria.eventFilters.category);
  const setTypeFilters = useMapStore(state => state.setTypeFilters);
  const categories = getEventCategoryOptions(counts, activeCategory);
  const options = [{ label: 'All categories', count: allCount, category: undefined },
    ...categories.map(category => ({ label: category, count: counts[category] ?? 0, category }))];
  const hasOverflow = shouldShowEventCategoryScrollCue(options.length);
  const [contentHeight, setContentHeight] = useState(maxHeight);
  const [hasMoreBelow, setHasMoreBelow] = useState(hasOverflow);
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scrollY.setValue(0);
    setHasMoreBelow(hasOverflow);
  }, [hasOverflow, options.length, scrollY]);

  const updateMoreState = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    setHasMoreBelow(contentOffset.y + layoutMeasurement.height < contentSize.height - 4);
  };

  const thumbHeight = contentHeight > maxHeight
    ? Math.max(24, (maxHeight / contentHeight) * maxHeight)
    : maxHeight;
  const scrollDistance = Math.max(1, contentHeight - maxHeight);
  const thumbTravel = Math.max(0, maxHeight - thumbHeight);
  const thumbTranslateY = scrollY.interpolate({
    inputRange: [0, scrollDistance], outputRange: [0, thumbTravel], extrapolate: 'clamp',
  });

  return <View>
    <View style={[styles.scrollViewport, { height: maxHeight }]}>
      <Animated.ScrollView style={styles.scrollView} nestedScrollEnabled
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always"
        accessibilityHint={hasOverflow ? 'Swipe up to see more event categories' : undefined}
        scrollEventThrottle={16}
        onContentSizeChange={(_, height) => setContentHeight(height)}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false, listener: updateMoreState }
        )}
        contentContainerStyle={[styles.grid, hasOverflow && styles.gridWithIndicator]}>
        {options.map(option => {
          const active = activeCategory === option.category;
          return <Pressable key={option.label} accessibilityRole="button"
            accessibilityLabel={`${option.label}, ${option.count} events`}
            accessibilityState={{ selected: active }}
            onPress={() => setTypeFilters('event', { category: option.category }, 'filter-pills')}
            style={[styles.option, active && styles.selected]}>
            <MaterialIcons name={option.category ? getEventCategoryIcon(option.category) : 'apps'}
              size={18} color={active ? '#0874D5' : '#263F68'} />
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
              style={[styles.label, active && styles.selectedLabel]}>
              {formatFilterCount(option.label, option.count)}
            </Text>
          </Pressable>;
        })}
      </Animated.ScrollView>
      {hasOverflow && <View pointerEvents="none" style={styles.scrollTrack}>
        <Animated.View style={[styles.scrollThumb, {
          height: thumbHeight, transform: [{ translateY: thumbTranslateY }],
        }]} />
      </View>}
      {hasMoreBelow && <LinearGradient pointerEvents="none"
        colors={['rgba(250, 252, 255, 0)', 'rgba(250, 252, 255, 0.96)']}
        style={styles.bottomFade} />}
    </View>
    {hasOverflow && <View accessible accessibilityLabel={hasMoreBelow
      ? 'More categories below' : 'End of categories'} style={styles.moreCue}>
      <Text style={styles.moreCueText}>{hasMoreBelow ? 'More categories' : 'All categories shown'}</Text>
      <MaterialIcons name={hasMoreBelow ? 'keyboard-arrow-down' : 'done'} size={18} color="#526880" />
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  scrollViewport: { position: 'relative' },
  scrollView: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 7, paddingBottom: 3 },
  gridWithIndicator: { paddingRight: 7 },
  option: { width: '48.5%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: '#DAE3EE',
    backgroundColor: '#FFFFFF', elevation: 1, shadowColor: '#273E60', shadowOpacity: 0.07,
    shadowRadius: 3, shadowOffset: { width: 0, height: 2 } },
  selected: { backgroundColor: '#E7F3FF', borderColor: '#1681E2' },
  label: { flexShrink: 1, fontSize: 12, color: '#263F68', fontWeight: '500' },
  selectedLabel: { color: '#0874D5', fontWeight: '700' },
  scrollTrack: { position: 'absolute', top: 2, right: 0, bottom: 2, width: 3,
    borderRadius: 2, backgroundColor: '#E2E9F1' },
  scrollThumb: { width: 3, borderRadius: 2, backgroundColor: '#8FA4BC' },
  bottomFade: { position: 'absolute', left: 0, right: 7, bottom: 0, height: 14 },
  moreCue: { height: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  moreCueText: { color: '#526880', fontSize: 12, fontWeight: '500' },
});
