import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import type { Event } from '../../types/events';
import { isFamilyFriendlyEvent } from '../../utils/familyFriendly';

type FamilyFriendlyBadgeProps = {
  event: Pick<Event, 'category' | 'familyFriendlyScore'>;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'carousel';
};

/**
 * Secondary facet badge. Family Friendly is deliberately shown alongside the
 * primary category instead of replacing it (for example, Live Music can also
 * be Family Friendly).
 */
const FamilyFriendlyBadge: React.FC<FamilyFriendlyBadgeProps> = ({
  event,
  style,
  variant = 'default',
}) => {
  if (!isFamilyFriendlyEvent(event)) return null;

  const isCarousel = variant === 'carousel';

  return (
    <View
      accessible
      accessibilityLabel="Family Friendly"
      accessibilityRole="image"
      testID="family-friendly-badge"
      style={[styles.badge, isCarousel && styles.carouselBadge, style]}
    >
      <MaterialIcons name="family-restroom" size={isCarousel ? 12 : 14} color="#176B3A" />
      <View style={[styles.checkBadge, isCarousel && styles.carouselCheckBadge]}>
        <MaterialIcons name="check" size={isCarousel ? 5 : 7} color="#FFFFFF" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    width: 28,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderColor: '#79B98B',
    borderWidth: 1,
    borderRadius: 4,
    marginRight: 8,
    position: 'relative',
  },
  checkBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34A853',
    borderColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 5,
  },
  carouselBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  carouselCheckBadge: {
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

export default FamilyFriendlyBadge;
