import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import type { Event } from '../../types/events';
import { getEventSeriesContext } from '../../utils/eventSeries';

type SeriesEvent = Pick<
  Event,
  | 'title'
  | 'description'
  | 'startDate'
  | 'endDate'
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
  const context = getEventSeriesContext(event);
  if (!context) return null;

  const color = tone === 'dark' ? '#BFC5CD' : '#777777';
  return (
    <View
      accessibilityLabel={`Recurring event. ${context.label}`}
      style={[styles.container, containerStyle]}
      testID="event-series-context"
    >
      <MaterialIcons name="repeat" size={12} color={color} />
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

