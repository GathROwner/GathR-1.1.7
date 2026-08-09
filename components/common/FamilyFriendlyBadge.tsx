import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import type { Event } from '../../types/events';
import { isFamilyFriendlyEvent } from '../../utils/familyFriendly';

type FamilyFriendlyBadgeProps = {
  event: Pick<Event, 'category' | 'familyFriendlyScore'>;
  style?: StyleProp<ViewStyle>;
};

/**
 * Secondary facet badge. Family Friendly is deliberately shown alongside the
 * primary category instead of replacing it (for example, Live Music can also
 * be Family Friendly).
 */
const FamilyFriendlyBadge: React.FC<FamilyFriendlyBadgeProps> = ({ event, style }) => {
  if (!isFamilyFriendlyEvent(event)) return null;

  return (
    <View
      accessibilityLabel="Family Friendly"
      testID="family-friendly-badge"
      style={[styles.badge, style]}
    >
      <MaterialIcons name="family-restroom" size={13} color="#176B3A" />
      <Text style={styles.text}>Family Friendly</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderColor: '#79B98B',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  text: {
    color: '#176B3A',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
});

export default FamilyFriendlyBadge;
