import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import type { Event } from '../../types/events';
import { formatEventTimingSummary } from '../../utils/dateUtils';
import { getEventTimeRangeParts, getEventTimingDisclosure } from '../../utils/eventTiming';

type TimingEvent = Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timing'>;

interface EventTimingSummaryTextProps {
  event: TimingEvent;
  suffix?: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
  onInfoPress?: () => void;
  infoColor?: string;
}

/**
 * Shared provenance-aware time text. The info control sits immediately after
 * the endpoint it qualifies, so the UI never implies that both times are
 * uncertain when only one was estimated.
 */
export function EventTimingSummaryText({
  event,
  suffix = '',
  style,
  containerStyle,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
  onInfoPress,
  infoColor = '#267DBD',
}: EventTimingSummaryTextProps) {
  const [expanded, setExpanded] = useState(false);
  const parts = getEventTimeRangeParts(event);
  const disclosure = getEventTimingDisclosure(event);
  const summary = formatEventTimingSummary(event);
  const summaryPrefix = summary.endsWith(parts.text)
    ? summary.slice(0, -parts.text.length)
    : '';
  const hasEstimateMarker = parts.startEstimated || parts.endEstimated;
  const flattenedTextStyle = StyleSheet.flatten(style);
  const disclosureColor = typeof flattenedTextStyle?.color === 'string'
    ? flattenedTextStyle.color
    : '#374151';

  const handleInfoPress = (pressEvent: GestureResponderEvent) => {
    pressEvent.stopPropagation?.();
    if (onInfoPress) {
      onInfoPress();
      return;
    }
    setExpanded((value) => !value);
  };

  const infoLabel = useMemo(() => {
    if (parts.startEstimated && parts.endEstimated) return 'Explain estimated start and end times';
    if (parts.startEstimated) return 'Explain estimated start time';
    return 'Explain estimated end time';
  }, [parts.endEstimated, parts.startEstimated]);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text
        style={style}
        numberOfLines={expanded ? undefined : numberOfLines}
        adjustsFontSizeToFit={adjustsFontSizeToFit}
        minimumFontScale={minimumFontScale}
      >
        {summaryPrefix}{parts.prefix}{parts.start}
        {parts.startEstimated ? (
          <Text
            accessibilityRole="button"
            accessibilityLabel={infoLabel}
            onPress={handleInfoPress}
            suppressHighlighting={false}
            style={[styles.infoMarker, { color: infoColor }]}
            testID="estimated-start-info"
          >
            {' ⓘ'}
          </Text>
        ) : null}
        {parts.separator}{parts.end}
        {parts.endEstimated ? (
          <Text
            accessibilityRole="button"
            accessibilityLabel={infoLabel}
            onPress={handleInfoPress}
            suppressHighlighting={false}
            style={[styles.infoMarker, { color: infoColor }]}
            testID="estimated-end-info"
          >
            {' ⓘ'}
          </Text>
        ) : null}
        {suffix}
      </Text>
      {hasEstimateMarker && disclosure && expanded && !onInfoPress ? (
        <View style={styles.disclosure} testID="estimated-time-disclosure">
          <Text style={[styles.disclosureText, { color: disclosureColor }]}>{disclosure}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexShrink: 1,
    justifyContent: 'center',
  },
  infoMarker: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 12,
  },
  disclosure: {
    backgroundColor: 'rgba(38, 125, 189, 0.10)',
    borderColor: 'rgba(38, 125, 189, 0.25)',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  disclosureText: {
    fontSize: 11,
    lineHeight: 15,
  },
});
