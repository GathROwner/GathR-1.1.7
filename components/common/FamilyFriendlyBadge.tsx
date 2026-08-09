import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
      accessible
      accessibilityLabel="Family Friendly"
      accessibilityRole="image"
      testID="family-friendly-badge"
      style={[styles.badge, style]}
    >
      <MaterialIcons name="family-restroom" size={15} color="#176B3A" />
      <View style={styles.checkBadge}>
        <MaterialIcons name="check" size={8} color="#FFFFFF" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderColor: '#79B98B',
    borderWidth: 1,
    borderRadius: 14,
    marginRight: 8,
    position: 'relative',
  },
  checkBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34A853',
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
    borderRadius: 6,
  },
});

export default FamilyFriendlyBadge;
