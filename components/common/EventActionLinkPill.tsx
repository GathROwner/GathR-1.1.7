import React from 'react';
import { GestureResponderEvent, StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { EventActionLinkRole } from '../../types/events';

interface EventActionLinkPillProps {
  label: string;
  role: EventActionLinkRole;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ICON_BY_ROLE: Partial<Record<EventActionLinkRole, React.ComponentProps<typeof MaterialIcons>['name']>> = {
  schedule: 'event-note',
  event_info: 'info-outline',
  livestream: 'play-circle-outline',
  wagering: 'account-balance',
};

const EventActionLinkPill: React.FC<EventActionLinkPillProps> = ({
  label,
  role,
  onPress,
  disabled = false,
  style,
  testID,
}) => (
  <TouchableOpacity
    accessibilityLabel={label}
    accessibilityRole="link"
    activeOpacity={disabled ? 1 : 0.72}
    disabled={disabled}
    onPress={onPress}
    style={[styles.pill, disabled && styles.disabled, style]}
    testID={testID}
  >
    <MaterialIcons color={disabled ? '#777F87' : '#34424F'} name={ICON_BY_ROLE[role] || 'open-in-new'} size={14} />
    <Text style={[styles.label, disabled && styles.disabledLabel]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  pill: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#E7ECF1',
    borderWidth: 1,
    borderColor: '#B6C0CA',
  },
  label: {
    color: '#34424F',
    fontSize: 12,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.65,
  },
  disabledLabel: {
    color: '#777F87',
  },
});

export default EventActionLinkPill;

