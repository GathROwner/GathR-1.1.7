import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Cluster, Event, Venue } from '../../types/events';
import { traceMapEvent } from '../../utils/mapTrace';

interface StaticDebugCalloutProps {
  venues: Venue[];
  cluster: Cluster | null;
  onClose: () => void;
  onLayoutReady?: () => void;
  onEventSelected?: (event: Event) => void;
}

const StaticDebugCallout: React.FC<StaticDebugCalloutProps> = ({
  venues,
  cluster,
  onClose,
  onLayoutReady,
}) => {
  const hasReportedLayoutRef = useRef(false);
  const totalItems = venues.reduce((sum, venue) => sum + venue.events.length, 0);

  console.log('[StaticDebugCallout] render', {
    venueCount: venues.length,
    totalItems,
    clusterId: cluster?.id ?? 'none',
  });

  useEffect(() => {
    console.log('[StaticDebugCallout] mounted', {
      venueCount: venues.length,
      totalItems,
      clusterId: cluster?.id ?? 'none',
    });
    traceMapEvent('static_debug_callout_rendered', {
      venueCount: venues.length,
      totalItems,
      clusterId: cluster?.id ?? 'none',
      venueNames: venues.map((venue) => venue.venue).join(' | ') || 'none',
    });
    return () => {
      console.log('[StaticDebugCallout] unmounted', {
        venueCount: venues.length,
        totalItems,
        clusterId: cluster?.id ?? 'none',
      });
    };
  }, [cluster?.id, totalItems, venues]);

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View
        style={styles.sheet}
        onLayout={(event) => {
          const { height, width, x, y } = event.nativeEvent.layout;
          console.log('[StaticDebugCallout] layout', {
            height,
            width,
            x,
            y,
            venueCount: venues.length,
            totalItems,
            clusterId: cluster?.id ?? 'none',
          });
          traceMapEvent('static_debug_callout_on_layout', {
            height,
            width,
            x,
            y,
            venueCount: venues.length,
            totalItems,
            clusterId: cluster?.id ?? 'none',
          });

          if (!hasReportedLayoutRef.current) {
            hasReportedLayoutRef.current = true;
            traceMapEvent('static_debug_callout_layout_ready', {
              height,
              width,
              x,
              y,
              venueCount: venues.length,
              totalItems,
              clusterId: cluster?.id ?? 'none',
            });
            onLayoutReady?.();
          }
        }}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Static Debug Callout</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>

        <Text style={styles.meta}>
          {venues.length} venue{venues.length === 1 ? '' : 's'} | {totalItems} item{totalItems === 1 ? '' : 's'}
        </Text>

        <Text style={styles.label}>Cluster</Text>
        <Text style={styles.value} numberOfLines={3}>
          {cluster?.id ?? 'none'}
        </Text>

        <Text style={styles.label}>Venues</Text>
        {venues.slice(0, 5).map((venue) => (
          <Text key={venue.locationKey} style={styles.venueRow} numberOfLines={1}>
            {venue.venue} ({venue.events.length})
          </Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#FF3B30',
    minHeight: 240,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111111',
  },
  closeButton: {
    backgroundColor: '#111111',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FF3B30',
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#666666',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 4,
  },
  value: {
    fontSize: 13,
    lineHeight: 18,
    color: '#222222',
  },
  venueRow: {
    fontSize: 16,
    lineHeight: 22,
    color: '#111111',
    marginBottom: 4,
  },
});

export default StaticDebugCallout;
