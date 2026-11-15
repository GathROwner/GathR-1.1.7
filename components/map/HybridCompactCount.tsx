import React, { useMemo } from 'react';
import Mapbox from '@rnmapbox/maps';

export const hybridCompactDiameter = (label: string) => Math.ceil(Math.max(30, label.length * 12 * .65 + 18));

/** Both the background and count are map paint; neither depends on an offscreen UIKit snapshot. */
export default function HybridCompactCount({ id, coordinate, label, diameter, dockX, dockY, onPress }: {
  id: string; coordinate: [number, number]; label: string; diameter: number;
  dockX: number; dockY: number; onPress: () => void;
}) {
  const shape = useMemo(() => ({ type: 'Feature' as const, properties: { count: label },
    geometry: { type: 'Point' as const, coordinates: coordinate } }), [coordinate, label]);
  const translate: [number, number] = [dockX, dockY - diameter / 2];
  return <Mapbox.ShapeSource id={`${id}-compact-source`} shape={shape} hitbox={{ width: 1, height: 1 }} onPress={onPress}>
    <Mapbox.CircleLayer id={`${id}-compact-background`} style={{
      circleRadius: diameter / 2 - 1, circleColor: '#FFFDF6', circleStrokeColor: '#8C6E31', circleStrokeWidth: 1,
      circleTranslate: translate, circleTranslateAnchor: 'viewport', circlePitchAlignment: 'viewport', circlePitchScale: 'viewport',
    }} />
    <Mapbox.SymbolLayer id={`${id}-compact-count`} style={{
      textField: ['get', 'count'], textSize: 12, textColor: '#674C13', textFont: ['Open Sans Bold', 'Arial Unicode MS Regular'],
      textAllowOverlap: true, textIgnorePlacement: true, textPadding: 0, textAnchor: 'center',
      textTranslate: translate, textTranslateAnchor: 'viewport', textPitchAlignment: 'viewport', textRotationAlignment: 'viewport',
    }} />
  </Mapbox.ShapeSource>;
}
