import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TimeFilterType } from '../../types';
import { EVENT_TIME_OPTIONS, formatFilterCount } from './eventFilterPanelModel';

type Props = {
  selected: TimeFilterType;
  counts: Record<TimeFilterType, number>;
  columns: number;
  onSelect: (filter: TimeFilterType) => void;
};

export default function EventTimeOptions({ selected, counts, columns, onSelect }: Props) {
  return <View style={styles.grid}>
    {EVENT_TIME_OPTIONS.map(option => {
      const active = selected === option.value;
      const label = formatFilterCount(option.label, counts[option.value] ?? 0);
      return <Pressable key={option.value} accessibilityRole="button"
        accessibilityLabel={`${option.label}, ${counts[option.value] ?? 0} events`}
        accessibilityState={{ selected: active }}
        onPress={() => onSelect(option.value)}
        style={[styles.option, { width: columns === 4 ? '23.5%' : '48.5%' }, active && styles.selected]}>
        <Ionicons name={option.icon} size={columns === 4 ? 15 : 17}
          color={active ? '#0874D5' : '#263F68'} />
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}
          style={[styles.label, active && styles.selectedLabel]}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 7 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingHorizontal: 5, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1,
    borderColor: '#DAE3EE', elevation: 1, shadowColor: '#273E60', shadowOpacity: 0.08,
    shadowRadius: 3, shadowOffset: { width: 0, height: 2 } },
  selected: { backgroundColor: '#E7F3FF', borderColor: '#1681E2' },
  label: { fontSize: 12, color: '#263F68', fontWeight: '500', flexShrink: 1 },
  selectedLabel: { color: '#0874D5', fontWeight: '700' },
});
