import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useMapStore } from '../../store';
import { useUserPrefsStore } from '../../store/userPrefsStore';
import { useClusterInteractionStore } from '../../store/clusterInteractionStore';
import { buildHotInterestCarouselEvents } from '../../utils/hotInterestCarouselUtils';

type HotFlamePillProps = {
  isActive: boolean;
  onPress: () => void;
  top?: number;
  right?: number;
};

const NewContentDot: React.FC = () => {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.6,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    pulseAnimation.start();
    return () => {
      pulseAnimation.stop();
    };
  }, [pulseOpacity, pulseScale]);

  return (
    <Animated.View
      style={[
        styles.newDot,
        {
          opacity: pulseOpacity,
          transform: [{ scale: pulseScale }],
        },
      ]}
    />
  );
};

const HotFlamePill: React.FC<HotFlamePillProps> = ({
  isActive,
  onPress,
  top = 134,
  right = 10,
}) => {
  const userInterests = useUserPrefsStore((s) => s.interests);
  const { onScreenEvents, filterCriteria, clusters, activeFilterPanel } = useMapStore();
  const {
    hasNewContent: checkHasNewContent,
    carouselViewedEventIds,
    interactions,
  } = useClusterInteractionStore();

  const hotEvents = useMemo(
    () =>
      buildHotInterestCarouselEvents({
        onScreenEvents,
        filterCriteria,
        userInterests,
      }),
    [onScreenEvents, filterCriteria, userInterests]
  );

  const venueByEventId = useMemo(() => {
    const map = new Map<string, { locationKey: string; eventIds: string[] }>();

    clusters.forEach((cluster) => {
      cluster.venues.forEach((venue) => {
        const venueEventIds = venue.events.map((e) => e.id.toString());
        venue.events.forEach((event) => {
          const key = event.id.toString();
          if (!map.has(key)) {
            map.set(key, {
              locationKey: venue.locationKey,
              eventIds: venueEventIds,
            });
          }
        });
      });
    });

    return map;
  }, [clusters]);

  const newHotItemCount = useMemo(() => {
    let count = 0;

    hotEvents.forEach((event) => {
      const venue = venueByEventId.get(event.id.toString());
      if (!venue) return;

      const venueHasNew = checkHasNewContent(venue.locationKey, venue.eventIds);
      if (!venueHasNew) return;

      if (carouselViewedEventIds.has(event.id.toString())) return;
      count += 1;
    });

    return count;
  }, [hotEvents, venueByEventId, checkHasNewContent, carouselViewedEventIds, interactions]);

  if (!userInterests || userInterests.length === 0) {
    return null;
  }

  const disabled = hotEvents.length === 0 && !isActive;

  return (
    <View
      pointerEvents={activeFilterPanel ? 'none' : 'box-none'}
      style={[styles.container, { top, right, opacity: activeFilterPanel ? 0 : 1 }]}
    >
      <TouchableOpacity
        style={[
          styles.pill,
          isActive && styles.pillActive,
          disabled && styles.pillDisabled,
        ]}
        onPress={() => {
          if (disabled) return;
          onPress();
        }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="What's hot interest filter"
      >
        <MaterialIcons
          name="local-fire-department"
          size={18}
          color={isActive ? '#FFFFFF' : '#B33900'}
        />
        <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
          <Text style={[styles.countText, isActive && styles.countTextActive]}>
            {hotEvents.length}
          </Text>
          {newHotItemCount > 0 && (
            <View style={styles.newDotWrapper}>
              <NewContentDot />
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 11, // Keep below MapLegend so the legend panel/button can cover it
    alignItems: 'flex-end',
  },
  pill: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 10,
    backgroundColor: '#FFF5EE',
    borderWidth: 1,
    borderColor: '#F1D3C2',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  pillActive: {
    backgroundColor: '#E85D04',
    borderColor: '#D94E00',
  },
  pillDisabled: {
    opacity: 0.7,
  },
  countBadge: {
    minWidth: 24,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(179, 57, 0, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  countBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A2E00',
  },
  countTextActive: {
    color: '#FFFFFF',
  },
  newDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  newDotWrapper: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default HotFlamePill;
