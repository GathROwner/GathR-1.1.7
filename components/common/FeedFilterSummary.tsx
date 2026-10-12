import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TimeFilterType, type TypeFilterCriteria } from '../../types/filter';
import { formatUpcomingDateLabel } from '../../utils/upcomingDateWindow';

export const FEED_FILTER_SUMMARY_HEIGHT = 44;

export function getFeedFilterSummary(filters: TypeFilterCriteria): string {
  const time = filters.timeFilter === TimeFilterType.UPCOMING ? formatUpcomingDateLabel(filters.upcomingDate) :
    { all: 'All times', now: 'Now', today: 'Today', tomorrow: 'Tomorrow' }[filters.timeFilter];
  return [time, filters.category || 'All categories', filters.savedOnly ? 'Saved only' : null].filter(Boolean).join(' · ');
}

export default function FeedFilterSummary({ filters, expanded, onPress }: {
  filters: TypeFilterCriteria; expanded: boolean; onPress: () => void;
}) {
  const summary = getFeedFilterSummary(filters);
  return <TouchableOpacity testID="feed-filter-summary" style={styles.row} activeOpacity={0.8}
    onPress={onPress} accessibilityRole="button" accessibilityLabel={`${summary}. ${expanded ? 'Hide' : 'Show'} filters`}
    accessibilityState={{ expanded }}>
    <Text style={styles.summary} numberOfLines={1}>{summary}</Text>
    <MaterialIcons name="filter-list" size={18} color="#64B5F6" />
    <Text style={styles.action}>Filters</Text>
    <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={21} color="#64B5F6" />
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  row: { minHeight: FEED_FILTER_SUMMARY_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, backgroundColor: '#0B0D10', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#30353D' },
  summary: { flex: 1, minWidth: 0, fontSize: 12, color: '#E5E9EF', marginRight: 6 },
  action: { fontSize: 13, fontWeight: '600', color: '#64B5F6' },
});
