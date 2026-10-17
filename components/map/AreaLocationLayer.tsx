import React from 'react';
import MapboxGL from '@rnmapbox/maps';
import type { Event } from '../../types/events';
import { buildAreaLocationFeatureCollection } from '../../utils/areaEvent';

/** Unordered festival locations. Shared coordinates remain one selectable pin. */
export default function AreaLocationLayer({ event, onPress }: {
  event: Event;
  onPress: (event: any) => void;
}) {
  return <MapboxGL.ShapeSource id="active-area-locations-source"
    shape={buildAreaLocationFeatureCollection(event) as any}
    hitbox={{ width: 52, height: 52 }} onPress={onPress}>
    <MapboxGL.CircleLayer id="active-area-location-halos"
      style={{ circleColor: '#FFFFFF', circleRadius: 10, circleOpacity: 0.98 }} />
    <MapboxGL.CircleLayer id="active-area-confirmed-locations"
      filter={['==', ['get', 'certainty'], 'confirmed'] as any}
      style={{ circleColor: '#F6C84C', circleRadius: 7, circleStrokeColor: '#6B4E16', circleStrokeWidth: 2 }} />
    <MapboxGL.CircleLayer id="active-area-possible-locations"
      filter={['==', ['get', 'certainty'], 'approximate'] as any}
      style={{ circleColor: '#FFFFFF', circleRadius: 7, circleStrokeColor: '#D98700', circleStrokeWidth: 3 }} />
    <MapboxGL.SymbolLayer id="active-area-location-labels" style={{
      textField: ['get', 'label'] as any, textSize: 12, textColor: '#4E342E',
      textHaloColor: '#FFFFFF', textHaloWidth: 2, textOffset: [0, 1.65], textAnchor: 'top', textAllowOverlap: true,
    }} />
  </MapboxGL.ShapeSource>;
}
