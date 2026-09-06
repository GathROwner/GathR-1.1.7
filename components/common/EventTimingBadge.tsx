import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Event } from '../../types/events';
import { getEventTimingBadge } from '../../utils/eventTiming';

interface EventTimingBadgeProps {
  event: Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timing'>;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function EventTimingBadge({ event, compact = false, style }: EventTimingBadgeProps) {
  const badge = getEventTimingBadge(event);
  if (!badge) return null;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={badge.accessibilityLabel}
      style={[
        styles.base,
        compact ? styles.compact : styles.regular,
        badge.tone === 'positive' && styles.positive,
        badge.tone === 'caution' && styles.caution,
        badge.tone === 'muted' && styles.muted,
        badge.tone === 'neutral' && styles.neutral,
        style,
      ]}
      testID="event-timing-badge"
    >
      <Text style={[styles.text, compact && styles.compactText]}>{badge.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 9,
    justifyContent: 'center',
    minWidth: 54,
    paddingHorizontal: 7,
  },
  regular: {
    minHeight: 28,
    paddingVertical: 4,
  },
  compact: {
    borderRadius: 7,
    minHeight: 24,
    minWidth: 48,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.25,
    lineHeight: 10,
    textAlign: 'center',
  },
  compactText: {
    fontSize: 9,
    lineHeight: 9,
  },
  positive: { backgroundColor: '#1F8F55' },
  caution: { backgroundColor: '#B87800' },
  muted: { backgroundColor: '#6B7280' },
  neutral: { backgroundColor: '#267DBD' },
});
