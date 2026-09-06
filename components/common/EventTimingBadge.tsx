import React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { Event } from '../../types/events';
import { getEventTimingBadge, getEventTimingDisclosure } from '../../utils/eventTiming';

interface EventTimingBadgeProps {
  event: Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timing'>;
  compact?: boolean;
  carousel?: boolean;
  onInfoPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EventTimingBadge({
  event,
  compact = false,
  carousel = false,
  onInfoPress,
  style,
}: EventTimingBadgeProps) {
  const badge = getEventTimingBadge(event);
  if (!badge) return null;

  const badgeStyle = [
    styles.base,
    carousel ? styles.carousel : compact ? styles.compact : styles.regular,
    badge.tone === 'positive' && styles.positive,
    badge.tone === 'caution' && styles.caution,
    badge.tone === 'muted' && styles.muted,
    badge.tone === 'neutral' && styles.neutral,
    badge.infoTitle && styles.withInfo,
    carousel && badge.infoTitle && styles.carouselWithInfo,
    style,
  ];

  const content = (
    <>
      <Text style={[styles.text, compact && styles.compactText, carousel && styles.carouselText]}>
        {badge.text}
      </Text>
      {badge.infoTitle ? (
        <View
          pointerEvents="none"
          style={[styles.infoCorner, carousel && styles.carouselInfoCorner]}
          testID="event-timing-badge-info"
        >
          <Text style={[styles.infoCornerText, carousel && styles.carouselInfoCornerText]}>i</Text>
        </View>
      ) : null}
    </>
  );

  if (badge.infoTitle) {
    const disclosure = getEventTimingDisclosure(event);
    const handleInfoPress = (pressEvent: GestureResponderEvent) => {
      pressEvent.stopPropagation?.();
      if (onInfoPress) {
        onInfoPress();
        return;
      }
      Alert.alert(
        badge.infoTitle!,
        disclosure || 'The event source does not provide enough timing information to confirm its current status.'
      );
    };

    return (
      <Pressable
        accessibilityHint="Shows why this time is uncertain"
        accessibilityLabel={`${badge.accessibilityLabel}. More information`}
        accessibilityRole="button"
        hitSlop={4}
        onPressIn={(pressEvent) => pressEvent.stopPropagation?.()}
        onPress={handleInfoPress}
        style={({ pressed }) => [badgeStyle, pressed && styles.pressed]}
        testID="event-timing-badge"
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={badge.accessibilityLabel}
      style={badgeStyle}
      testID="event-timing-badge"
    >
      {content}
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
  withInfo: {
    marginRight: 4,
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
  carousel: {
    borderRadius: 5,
    minHeight: 18,
    minWidth: 34,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  carouselWithInfo: {
    marginRight: 2,
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
  carouselText: {
    fontSize: 6.5,
    letterSpacing: 0.1,
    lineHeight: 7,
  },
  infoCorner: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(107, 70, 0, 0.35)',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    height: 12,
    justifyContent: 'center',
    position: 'absolute',
    right: -4,
    top: -4,
    width: 12,
  },
  infoCornerText: {
    color: '#7A4A00',
    fontSize: 8,
    fontWeight: '900',
    lineHeight: 9,
    textAlign: 'center',
  },
  carouselInfoCorner: {
    borderRadius: 5,
    height: 10,
    right: -2,
    top: -3,
    width: 10,
  },
  carouselInfoCornerText: {
    fontSize: 7,
    lineHeight: 8,
  },
  pressed: {
    opacity: 0.72,
  },
  positive: { backgroundColor: '#1F8F55' },
  caution: { backgroundColor: '#B87800' },
  muted: { backgroundColor: '#6B7280' },
  neutral: { backgroundColor: '#267DBD' },
});
