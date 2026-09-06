import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import type { Event } from '../../types/events';
import { getEventScheduleContext } from '../../utils/eventSeries';

type SeriesEvent = Pick<
  Event,
  | 'title'
  | 'description'
  | 'startDate'
  | 'endDate'
  | 'startTime'
  | 'endTime'
  | 'isRecurring'
  | 'recurringPattern'
  | 'recurrenceUntilDate'
>;

interface EventSeriesContextLineProps {
  event: SeriesEvent;
  tone?: 'light' | 'dark';
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  numberOfLines?: number;
}

export function EventSeriesContextLine({
  event,
  tone = 'light',
  style,
  containerStyle,
  numberOfLines = 1,
}: EventSeriesContextLineProps) {
  const context = getEventScheduleContext(event);
  if (!context) return null;

  const color = tone === 'dark' ? '#BFC5CD' : '#777777';
  return (
    <View
      accessibilityLabel={`Schedule details. ${context.label}`}
      style={[styles.container, containerStyle]}
      testID="event-series-context"
    >
      <MaterialIcons
        name={context.kind === 'overnight_end' || context.kind === 'multi_day_span' ? 'date-range' : 'repeat'}
        size={12}
        color={color}
      />
      <Text numberOfLines={numberOfLines} style={[styles.text, { color }, style]}>
        {context.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 14,
  },
  text: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
    marginLeft: 4,
  },
});
