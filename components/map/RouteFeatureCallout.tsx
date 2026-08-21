import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import {
  ROUTE_FEATURE_CALLOUT_WIDTH,
  type RouteFeatureCalloutData,
} from '../../utils/routeEvent';

type Props = {
  data: RouteFeatureCalloutData;
  placement: 'above' | 'below';
  onClose: () => void;
};

const formatCoordinate = ({
  latitude,
  longitude,
}: RouteFeatureCalloutData['coordinate']): string =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

export default function RouteFeatureCallout({ data, placement, onClose }: Props) {
  const hasPrimaryMetadata = Boolean(
    data.locationText || data.timeLabel || data.description || data.sourceLabel
  );

  return (
    <View style={styles.annotationFrame}>
      {placement === 'below' && <View style={styles.pointerUp} />}
      <View
        accessibilityRole="summary"
        accessibilityLabel={`${data.title}. ${data.statusLabel}`}
        style={styles.card}
      >
        <View style={styles.headingRow}>
          <View style={styles.iconCircle}>
            <MaterialIcons
              name={data.featureType === 'stop' ? 'place' : 'alt-route'}
              size={17}
              color="#6B4E16"
            />
          </View>
          <View style={styles.headingText}>
            <Text style={styles.status}>{data.statusLabel}</Text>
            <Text style={styles.title} numberOfLines={2}>
              {data.title}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close route detail"
            hitSlop={10}
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <MaterialIcons name="close" size={18} color="#D8E8F6" />
          </Pressable>
        </View>

        {data.locationText && (
          <View style={styles.detailRow}>
            <MaterialIcons name="place" size={15} color="#9CC9F5" />
            <Text style={styles.detailText} numberOfLines={3}>
              {data.locationText}
            </Text>
          </View>
        )}
        {data.timeLabel && (
          <View style={styles.detailRow}>
            <MaterialIcons name="schedule" size={15} color="#9CC9F5" />
            <Text style={styles.detailText} numberOfLines={2}>
              {data.timeLabel}
            </Text>
          </View>
        )}
        {data.description && (
          <View style={styles.detailRow}>
            <MaterialIcons name="info-outline" size={15} color="#9CC9F5" />
            <Text style={styles.detailText} numberOfLines={4}>
              {data.description}
            </Text>
          </View>
        )}
        {data.sourceLabel && (
          <View style={styles.detailRow}>
            <MaterialIcons name="verified" size={15} color="#FFD54F" />
            <Text style={styles.sourceText} numberOfLines={2}>
              Source: {data.sourceLabel}
            </Text>
          </View>
        )}
        {!hasPrimaryMetadata && (
          <View style={styles.detailRow}>
            <MaterialIcons name="my-location" size={15} color="#9CC9F5" />
            <Text style={styles.detailText}>
              Map point: {formatCoordinate(data.coordinate)}
            </Text>
          </View>
        )}
      </View>
      {placement === 'above' && <View style={styles.pointerDown} />}
    </View>
  );
}

const styles = StyleSheet.create({
  annotationFrame: {
    width: ROUTE_FEATURE_CALLOUT_WIDTH,
    alignItems: 'center',
  },
  card: {
    width: ROUTE_FEATURE_CALLOUT_WIDTH,
    borderRadius: 14,
    backgroundColor: 'rgba(17, 32, 48, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255, 213, 79, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.32,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 18,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD54F',
    borderWidth: 1.5,
    borderColor: '#FFF8D6',
  },
  headingText: {
    flex: 1,
    marginLeft: 9,
    marginRight: 6,
  },
  status: {
    color: '#9CC9F5',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 1,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  pressed: {
    opacity: 0.72,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    gap: 7,
  },
  detailText: {
    flex: 1,
    color: '#EAF3FB',
    fontSize: 11,
    lineHeight: 15,
  },
  sourceText: {
    flex: 1,
    color: '#FFEAA3',
    fontSize: 10,
    lineHeight: 14,
  },
  pointerDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(17, 32, 48, 0.98)',
  },
  pointerUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(17, 32, 48, 0.98)',
  },
});
