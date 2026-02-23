import React, { useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { toggleFavoriteVenue } from '../../services/userService';
import { useUserPrefsStore } from '../../store/userPrefsStore';
import { useAuth } from '../../contexts/AuthContext';

interface VenueFavoriteButtonProps {
  locationKey: string;
  venueName: string;
  size?: number;
  style?: any;
  source?: string; // For analytics: 'map_callout' | 'events_tab' | 'specials_tab'
  showLabel?: boolean; // Show "Save Venue" / "Saved" text label
}

export const VenueFavoriteButton: React.FC<VenueFavoriteButtonProps> = ({
  locationKey,
  venueName,
  size = 18,
  style,
  source = 'unknown',
  showLabel = false
}) => {
  const { user } = useAuth();
  const isGuest = !user;
  const favoriteVenues = useUserPrefsStore((s) => s.favoriteVenues);
  const isFavorite = favoriteVenues.includes(locationKey);
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = async (e: any) => {
    // Stop propagation to prevent triggering venue selection
    e?.stopPropagation?.();

    if (isGuest) {
      // Guest users cannot favorite venues
      return;
    }

    if (isToggling) return;

    setIsToggling(true);

    // Store previous state for potential revert
    const previousFavorites = [...favoriteVenues];

    // Optimistic update
    const newFavorites = isFavorite
      ? favoriteVenues.filter((k: string) => k !== locationKey)
      : [...favoriteVenues, locationKey];
    useUserPrefsStore.getState().setAll({ favoriteVenues: newFavorites });

    try {
      const result = await toggleFavoriteVenue(locationKey, {
        venueName,
        source,
        referrer: source
      });

      if (!result.success) {
        // Revert on failure
        useUserPrefsStore.getState().setAll({ favoriteVenues: previousFavorites });
        Alert.alert('Error', result.message || 'Failed to update favorite venue');
      }
    } catch (error) {
      // Revert on error
      useUserPrefsStore.getState().setAll({ favoriteVenues: previousFavorites });
      console.error('Error toggling favorite venue:', error);
      Alert.alert('Error', 'Failed to update favorite venue');
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        showLabel && styles.buttonWithLabel,
        style,
        isGuest && styles.disabledButton
      ]}
      onPress={handleToggle}
      activeOpacity={isGuest ? 1 : 0.7}
      disabled={isGuest || isToggling}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View style={[styles.iconContainer, showLabel && styles.iconContainerWithLabel]}>
        <MaterialIcons
          name={isFavorite ? 'favorite' : 'favorite-border'}
          size={size}
          color={isGuest ? '#CCCCCC' : isFavorite ? '#E91E63' : '#666666'}
        />
        {isGuest && !showLabel && (
          <View style={styles.lockOverlay}>
            <MaterialIcons name="lock" size={8} color="#333333" />
          </View>
        )}
      </View>
      {showLabel && (
        <Text style={[
          styles.labelText,
          isFavorite && styles.labelTextActive,
          isGuest && styles.labelTextDisabled
        ]}>
          {isFavorite ? 'Saved' : 'Save Venue'}
        </Text>
      )}
      {showLabel && isGuest && (
        <MaterialIcons name="lock" size={12} color="#999999" style={styles.labelLockIcon} />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  buttonWithLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  iconContainer: {
    position: 'relative',
  },
  iconContainerWithLabel: {
    marginRight: 0,
  },
  lockOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 6,
    padding: 1,
  },
  labelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333333',
    marginLeft: 8,
  },
  labelTextActive: {
    color: '#E91E63',
  },
  labelTextDisabled: {
    color: '#999999',
  },
  labelLockIcon: {
    marginLeft: 4,
  },
});

export default VenueFavoriteButton;
