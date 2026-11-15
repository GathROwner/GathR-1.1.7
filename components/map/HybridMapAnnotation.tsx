import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import type { Cluster } from '../../types/events';
import type { MarkerGeometry } from '../../utils/clusterPuckLayout';
import HybridClusterMarker from './HybridClusterMarker';
import { PuckMarkerMeasurement } from './PuckMarkerMeasurement';
import HybridCompactCount, { hybridCompactDiameter } from './HybridCompactCount';
import { traceMapEvent } from '../../utils/mapTrace';
import { HYBRID_PULSE, hybridTimingColor } from '../../utils/hybridPulse';

type Props = {
  id: string; cluster: Cluster; coordinate: [number, number]; isSelected: boolean;
  isReady: boolean; isProcessing: boolean; disabled: boolean; isActive: boolean; reduceMotionEnabled: boolean;
  compact: boolean; dockX: number; dockY: number; measurementDockX: number; measurementDockY: number;
  record: (id: string, geometry: MarkerGeometry) => void;
  categoryIcon: (category: string) => string;
  onPress: () => void; onBackgroundPress: () => void;
  registerTapTarget?: (id: string, cluster: Cluster, coordinate: [number, number], eligible: boolean) => (() => void);
};

/** Canvas-rendered annotations, not UIKit view annotations, keep the map's native gesture surface clear. */
export default function HybridMapAnnotation(props: Props) {
  const { id, cluster, coordinate, isSelected, disabled, compact, dockX, dockY } = props;
  const registerTapTarget = props.registerTapTarget;
  const [longitude, latitude] = coordinate;
  useLayoutEffect(() => registerTapTarget?.(id, cluster, [longitude, latitude], !compact),
    [compact, registerTapTarget, id, cluster, longitude, latitude]);
  const annotation = useRef<Mapbox.PointAnnotation>(null);
  const frame = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [photo, setPhoto] = useState({ y: 0, height: 0 });
  const measuredSize = useRef(size);
  const measuredPhoto = useRef(photo);
  const [selectionReset, setSelectionReset] = useState(0);
  const countLabel = String(cluster.eventCount + cluster.specialCount);
  const compactDiameter = hybridCompactDiameter(countLabel);
  const refresh = useCallback(() => {
    if (frame.current !== null) return;
    // Image decoding and React/native layout must commit before the native bitmap is refreshed.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => { frame.current = null; annotation.current?.refresh(); });
    });
  }, []);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const measure = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (measuredSize.current.width === width && measuredSize.current.height === height) return;
    measuredSize.current = { width, height };
    setSize(measuredSize.current);
    refresh();
  }, [refresh]);
  const measurePhoto = useCallback((next: { y: number; height: number }) => {
    if (measuredPhoto.current.y === next.y && measuredPhoto.current.height === next.height) return;
    measuredPhoto.current = next;
    setPhoto(next);
    refresh();
  }, [refresh]);
  // iOS rounds snapshot dimensions to a multiple of four logical points.
  const bitmapWidth = Platform.OS === 'ios' ? Math.max(4, Math.ceil(Math.floor(size.width) / 4) * 4) : Math.max(1, size.width);
  const bitmapHeight = Platform.OS === 'ios' ? Math.max(4, Math.ceil(Math.floor(size.height) / 4) * 4) : Math.max(1, size.height);
  // Anchor the visible content, not the transparent padding added by native snapshot rounding.
  const anchor = { x: (size.width / 2 - dockX) / bitmapWidth, y: (size.height - dockY) / bitmapHeight };
  useEffect(refresh, [refresh, compact, isSelected, dockX, dockY, coordinate[0], coordinate[1], size, selectionReset]);
  return <>
    {compact && <HybridCompactCount id={id} coordinate={coordinate} label={countLabel} diameter={compactDiameter}
      dockX={dockX} dockY={dockY} onPress={() => { if (!disabled && !isSelected) props.onPress(); }} />}
    {!compact && photo.height > 0 && <HybridMapHalo id={id} coordinate={coordinate} radius={photo.height / 2}
      translate={[dockX, dockY - (size.height - photo.y - photo.height / 2)]}
      timing={cluster.timeStatus} active={props.isActive} reduceMotion={props.reduceMotionEnabled} />}
    <Mapbox.PointAnnotation ref={annotation} key={`${id}-${selectionReset}`} id={id} coordinate={coordinate}
      anchor={anchor} selected={isSelected} draggable={false}
      onSelected={() => {
        traceMapEvent('hybrid_native_selection_received', { clusterId: cluster.id, disabled, isSelected });
        if (isSelected) return;
        // Discard an ignored native selection, without remounting every marker during normal processing.
        if (disabled) { setSelectionReset(value => value + 1); return; }
        props.onPress();
      }}
      onDeselected={event => {
        if (event.properties && 'deselectAnnotationOnMapTap' in event.properties && event.properties.deselectAnnotationOnMapTap === true) props.onBackgroundPress();
      }}>
      <View collapsable={false} pointerEvents="none" onLayout={measure}>
        <PuckMarkerMeasurement id={cluster.id} compact={compact} countLabel={countLabel}
          countStyle={{ width: compactDiameter, height: compactDiameter, backgroundColor: 'transparent', borderColor: 'transparent' }}
          countContent={<View pointerEvents="none" accessibilityLabel={`${countLabel} items in cluster`} />}
          dockX={props.measurementDockX} dockY={props.measurementDockY} record={props.record}>
          <HybridClusterMarker cluster={cluster} isActive={props.isActive} isSelected={isSelected} isReady={props.isReady}
            isProcessing={props.isProcessing} reduceMotionEnabled={props.reduceMotionEnabled} categoryIcon={props.categoryIcon}
            snapshotMode snapshotVisible={!compact} onSnapshotChange={refresh} onPhotoLayout={measurePhoto} />
        </PuckMarkerMeasurement>
      </View>
    </Mapbox.PointAnnotation>
  </>;
}

/** Native paint transitions animate the halo without repeatedly rasterizing the venue graphics. */
export function HybridMapHalo({ id, coordinate, radius, translate, timing, active, reduceMotion }: {
  id: string; coordinate: [number, number]; radius: number; translate: [number, number];
  timing: Cluster['timeStatus']; active: boolean; reduceMotion: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const animate = active && !reduceMotion && timing !== 'future';
  useEffect(() => {
    setExpanded(false);
    if (!animate) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const grow = () => {
      if (stopped) return;
      setExpanded(true);
      timer = setTimeout(() => { setExpanded(false); timer = setTimeout(grow, HYBRID_PULSE.resetMs); }, HYBRID_PULSE.durationMs + HYBRID_PULSE.pauseMs);
    };
    timer = setTimeout(grow, HYBRID_PULSE.resetMs);
    return () => { stopped = true; clearTimeout(timer); };
  }, [animate]);
  const shape = useMemo(() => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: coordinate } }), [coordinate]);
  const duration = animate && expanded ? HYBRID_PULSE.durationMs : 0;
  return <Mapbox.ShapeSource id={`${id}-halo-source`} shape={shape}>
    <Mapbox.CircleLayer id={`${id}-halo`} style={{
      circleRadius: (radius - 2.7) * (animate && expanded ? HYBRID_PULSE.scale : 1), circleRadiusTransition: { duration, delay: 0 },
      circleColor: 'rgba(0,0,0,0)', circleStrokeWidth: 2.7,
      circleStrokeColor: hybridTimingColor(timing),
      circleStrokeOpacity: !animate ? .25 : expanded ? 0 : HYBRID_PULSE.opacity, circleStrokeOpacityTransition: { duration, delay: 0 },
      circleTranslate: translate, circleTranslateAnchor: 'viewport', circlePitchAlignment: 'viewport', circlePitchScale: 'viewport',
    }} />
  </Mapbox.ShapeSource>;
}
