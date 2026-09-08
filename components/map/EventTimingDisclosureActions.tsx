import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type EventTimingDisclosureActionsProps = {
  onReportIncorrectTime: () => void;
  onViewOriginalPost?: () => void;
};

export function EventTimingDisclosureActions({
  onReportIncorrectTime,
  onViewOriginalPost,
}: EventTimingDisclosureActionsProps) {
  return (
    <View style={styles.actions} testID="event-timing-disclosure-actions">
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Report an incorrect event time"
        style={styles.action}
        onPress={onReportIncorrectTime}
        testID="report-incorrect-time-action"
      >
        <Text style={styles.reportText}>Report incorrect time</Text>
      </TouchableOpacity>

      {onViewOriginalPost ? (
        <TouchableOpacity
          accessibilityRole="link"
          accessibilityLabel="View original event post"
          style={[styles.action, styles.actionDivider]}
          onPress={onViewOriginalPost}
          testID="view-original-post-action"
        >
          <Text style={styles.sourceText}>View original post</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 38,
    marginTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.13)',
  },
  action: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.13)',
  },
  sourceText: {
    color: '#62B5FF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  reportText: {
    color: '#F4C542',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
