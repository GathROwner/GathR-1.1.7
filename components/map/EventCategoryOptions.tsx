import React from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useMapStore } from '../../store';
import { formatFilterCount, getEventCategoryOptions } from './eventFilterPanelModel';

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

  return <ScrollView style={{ height: maxHeight }} nestedScrollEnabled showsVerticalScrollIndicator
    keyboardShouldPersistTaps="always" contentContainerStyle={styles.grid}>
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
  </ScrollView>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 7, paddingBottom: 3 },
  option: { width: '48.5%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, borderRadius: 12, borderWidth: 1, borderColor: '#DAE3EE',
    backgroundColor: '#FFFFFF', elevation: 1, shadowColor: '#273E60', shadowOpacity: 0.07,
    shadowRadius: 3, shadowOffset: { width: 0, height: 2 } },
  selected: { backgroundColor: '#E7F3FF', borderColor: '#1681E2' },
  label: { flexShrink: 1, fontSize: 12, color: '#263F68', fontWeight: '500' },
  selectedLabel: { color: '#0874D5', fontWeight: '700' },
});
