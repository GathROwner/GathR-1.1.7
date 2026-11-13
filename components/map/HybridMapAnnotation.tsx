import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import type { Cluster } from '../../types/events';
import type { MarkerGeometry } from '../../utils/clusterPuckLayout';
import HybridClusterMarker from './HybridClusterMarker';
import { PuckMarkerMeasurement } from './PuckMarkerMeasurement';

type Props = {
  id: string; cluster: Cluster; coordinate: [number, number]; isSelected: boolean;
  isReady: boolean; isProcessing: boolean; disabled: boolean; isActive: boolean; reduceMotionEnabled: boolean;
  compact: boolean; dockX: number; dockY: number; measurementDockX: number; measurementDockY: number;
  record: (id: string, geometry: MarkerGeometry) => void;
  categoryIcon: (category: string) => string;
  onPress: () => void; onBackgroundPress: () => void;
};

/** Canvas-rendered annotations, not UIKit view annotations, keep the map's native gesture surface clear. */
export default function HybridMapAnnotation(props: Props) {
  const { id, cluster, coordinate, isSelected, disabled, compact, dockX, dockY } = props;
  const annotation = useRef<Mapbox.PointAnnotation>(null);
  const frame = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [photo, setPhoto] = useState({ y: 0, height: 0 });
  const [selectionReset, setSelectionReset] = useState(0);
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
    setSize(old => old.width === width && old.height === height ? old : { width, height });
    refresh();
  }, [refresh]);
  const measurePhoto = useCallback((next: { y: number; height: number }) => {
    setPhoto(old => old.y === next.y && old.height === next.height ? old : next); refresh();
  }, [refresh]);
  // iOS rounds snapshot dimensions to a multiple of four logical points.
  const bitmapWidth = Platform.OS === 'ios' ? Math.max(4, Math.ceil(Math.floor(size.width) / 4) * 4) : Math.max(1, size.width);
  const bitmapHeight = Platform.OS === 'ios' ? Math.max(4, Math.ceil(Math.floor(size.height) / 4) * 4) : Math.max(1, size.height);
  // Anchor the visible content, not the transparent padding added by native snapshot rounding.
  const anchor = { x: (size.width / 2 - dockX) / bitmapWidth, y: (size.height - dockY) / bitmapHeight };
  useEffect(refresh, [refresh, compact, disabled, isSelected, dockX, dockY, size, selectionReset]);
  return <>
    {!compact && photo.height > 0 && <HybridMapHalo id={id} coordinate={coordinate} radius={photo.height / 2}
      translate={[dockX, dockY - (size.height - photo.y - photo.height / 2)]}
      timing={cluster.timeStatus} active={props.isActive} reduceMotion={props.reduceMotionEnabled} />}
    <Mapbox.PointAnnotation ref={annotation} key={`${id}-${selectionReset}`} id={id} coordinate={coordinate}
      anchor={anchor} selected={isSelected} draggable={false}
      onSelected={() => {
        if (isSelected) return;
        // Discard an ignored native selection, without remounting every marker during normal processing.
        if (disabled) { setSelectionReset(value => value + 1); return; }
        props.onPress();
      }}
      onDeselected={event => {
        if (event.properties && 'deselectAnnotationOnMapTap' in event.properties && event.properties.deselectAnnotationOnMapTap === true) props.onBackgroundPress();
      }}>
      <View collapsable={false} pointerEvents="none" onLayout={measure}>
        <PuckMarkerMeasurement id={cluster.id} compact={compact} countLabel={String(cluster.eventCount + cluster.specialCount)}
          dockX={props.measurementDockX} dockY={props.measurementDockY} record={props.record}>
          <HybridClusterMarker cluster={cluster} isActive={props.isActive} isSelected={isSelected} isReady={props.isReady}
            isProcessing={props.isProcessing} reduceMotionEnabled={props.reduceMotionEnabled} categoryIcon={props.categoryIcon}
            snapshotMode onSnapshotChange={refresh} onPhotoLayout={measurePhoto} />
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
      timer = setTimeout(() => { setExpanded(false); timer = setTimeout(grow, 40); }, 2600);
    };
    timer = setTimeout(grow, 40);
    return () => { stopped = true; clearTimeout(timer); };
  }, [animate]);
  const shape = useMemo(() => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: coordinate } }), [coordinate]);
  const duration = animate && expanded ? 1600 : 0;
  return <Mapbox.ShapeSource id={`${id}-halo-source`} shape={shape}>
    <Mapbox.CircleLayer id={`${id}-halo`} style={{
      circleRadius: (radius - 2.7) * (animate && expanded ? 1.8 : 1), circleRadiusTransition: { duration, delay: 0 },
      circleColor: 'rgba(0,0,0,0)', circleStrokeWidth: 2.7,
      circleStrokeColor: timing === 'now' ? '#34A853' : timing === 'today' ? '#FBBC05' : '#9AA0A6',
      circleStrokeOpacity: !animate ? .25 : expanded ? 0 : .45, circleStrokeOpacityTransition: { duration, delay: 0 },
      circleTranslate: translate, circleTranslateAnchor: 'viewport', circlePitchAlignment: 'viewport', circlePitchScale: 'viewport',
    }} />
  </Mapbox.ShapeSource>;
}
