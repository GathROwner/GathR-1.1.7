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
  const capturePhase = useRef<'idle' | 'scheduled' | 'settling'>('idle');
  const recapture = useRef(false);
  const [haloRevision, setHaloRevision] = useState(0);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [venuePhotoReady, setVenuePhotoReady] = useState(false);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [photo, setPhoto] = useState({ y: 0, height: 0 });
  const measuredSize = useRef(size);
  const measuredPhoto = useRef(photo);
  const [selectionReset, setSelectionReset] = useState(0);
  const venueRotation = useRef<(() => void) | null>(null);
  const registerPulseRotation = useCallback((advance: (() => void) | null) => { venueRotation.current = advance; }, []);
  const advanceVenue = useCallback(() => venueRotation.current?.(), []);
  const coordinateVenueRotation = !compact && cluster.timeStatus !== 'future' && !props.reduceMotionEnabled;
  const countLabel = String(cluster.eventCount + cluster.specialCount);
  const compactDiameter = hybridCompactDiameter(countLabel);
  const refresh = useCallback(() => {
    if (capturePhase.current !== 'idle') {
      // A load after the capture needs another snapshot; earlier loads are
      // already included in the scheduled capture.
      if (capturePhase.current === 'settling') recapture.current = true;
      return;
    }
    const capture = () => {
      capturePhase.current = 'scheduled';
      setSnapshotReady(false);
      setHaloRevision(value => value + 1);
      // Hide and replace native paint state before replacing the venue bitmap.
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => {
          capturePhase.current = 'settling';
          annotation.current?.refresh();
          // Allow the native snapshot command and its following frames to
          // settle before a brand-new, collapsed ripple is allowed to start.
          frame.current = requestAnimationFrame(() => {
            frame.current = requestAnimationFrame(() => {
              if (recapture.current) { recapture.current = false; capture(); return; }
              capturePhase.current = 'idle'; frame.current = null;
              setSnapshotReady(true);
            });
          });
        });
      });
    };
    capture();
  }, []);
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    capturePhase.current = 'idle'; recapture.current = false;
  }, []);
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
    {!compact && photo.height > 0 && <HybridMapHalo
      key={`${id}-presentation-${haloRevision}-${props.isActive && !isSelected ? 'active' : 'rest'}`}
      id={`${id}-presentation-${haloRevision}-${props.isActive && !isSelected ? 'active' : 'rest'}`}
      coordinate={coordinate} radius={photo.height / 2} hidden={!snapshotReady || !venuePhotoReady}
      translate={[dockX, dockY - (size.height - photo.y - photo.height / 2)]}
      timing={cluster.timeStatus} active={props.isActive && !isSelected} reduceMotion={props.reduceMotionEnabled}
      onVenueRotation={coordinateVenueRotation ? advanceVenue : undefined} />}
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
            snapshotMode snapshotVisible={!compact} onSnapshotChange={refresh} onPhotoLayout={measurePhoto}
            onPhotoReady={setVenuePhotoReady}
            registerPulseRotation={coordinateVenueRotation ? registerPulseRotation : undefined} />
        </PuckMarkerMeasurement>
      </View>
    </Mapbox.PointAnnotation>
  </>;
}

/** Native paint transitions animate the halo without repeatedly rasterizing the venue graphics. */
export function HybridMapHalo({ id, coordinate, radius, translate, timing, active, reduceMotion, onVenueRotation, hidden = false }: {
  id: string; coordinate: [number, number]; radius: number; translate: [number, number];
  timing: Cluster['timeStatus']; active: boolean; reduceMotion: boolean;
  onVenueRotation?: () => void;
  hidden?: boolean;
}) {
  const [phase, setPhase] = useState<'collapsed' | 'armed' | 'outward' | 'disarmed'>('collapsed');
  const pairs = useRef(0);
  const animate = active && !hidden && !reduceMotion && timing !== 'future';
  useEffect(() => {
    setPhase('collapsed');
    pairs.current = 0;
  }, [animate, onVenueRotation]);
  useEffect(() => {
    if (!animate) return;
    let timer: ReturnType<typeof setTimeout>;
    if (phase === 'outward') {
      timer = setTimeout(() => {
        pairs.current += 1;
        if (pairs.current % HYBRID_PULSE.pairsPerVenue === 0) onVenueRotation?.();
        // Reserve the same total quiet budget for three ordered commits.
        timer = setTimeout(() => setPhase('disarmed'), HYBRID_PULSE.pauseMs / 2 - 2 * HYBRID_PULSE.resetMs);
      }, HYBRID_PULSE.durationMs + HYBRID_PULSE.pauseMs / 2);
    } else {
      // Configure transitions before changing paint targets. Each next timer
      // starts only after this phase commits, so React cannot skip the reset
      // and native paint never has to infer the order of target+duration edits.
      const next = phase === 'disarmed' ? 'collapsed' : phase === 'collapsed' ? 'armed' : 'outward';
      timer = setTimeout(() => setPhase(next), HYBRID_PULSE.resetMs);
    }
    return () => clearTimeout(timer);
  }, [animate, phase, onVenueRotation]);
  const [longitude, latitude] = coordinate;
  const [translateX, translateY] = translate;
  const shape = useMemo(() => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [longitude, latitude] } }), [longitude, latitude]);
  const expanded = phase === 'outward' || phase === 'disarmed';
  const transitionsArmed = animate && (phase === 'armed' || phase === 'outward');
  const duration = transitionsArmed ? HYBRID_PULSE.durationMs : 0;
  const style = useMemo(() => ({
      circleRadius: (radius - 2.7) * (animate && expanded ? HYBRID_PULSE.scale : 1), circleRadiusTransition: { duration, delay: 0 },
      circleColor: 'rgba(0,0,0,0)', circleStrokeWidth: 2.7,
      circleStrokeColor: hybridTimingColor(timing),
      circleStrokeOpacity: hidden ? 0 : !animate ? .25 : expanded ? 0 : HYBRID_PULSE.opacity, circleStrokeOpacityTransition: { duration, delay: 0 },
      circleTranslate: [translateX, translateY] as [number, number], circleTranslateAnchor: 'viewport' as const, circlePitchAlignment: 'viewport' as const, circlePitchScale: 'viewport' as const,
    }), [radius, animate, expanded, duration, timing, translateX, translateY, hidden]);
  const trailingStyle = useMemo(() => ({
    ...style,
    circleRadius: (radius - 2.7) * (animate && expanded ? HYBRID_PULSE.trailingScale : 1),
    circleRadiusTransition: { duration: transitionsArmed ? HYBRID_PULSE.trailingDurationMs : 0, delay: transitionsArmed ? HYBRID_PULSE.trailingDelayMs : 0 },
    circleStrokeOpacity: !animate || expanded ? 0 : HYBRID_PULSE.trailingOpacity,
    circleStrokeOpacityTransition: { duration: transitionsArmed ? HYBRID_PULSE.trailingDurationMs : 0, delay: transitionsArmed ? HYBRID_PULSE.trailingDelayMs : 0 },
  }), [style, radius, animate, expanded, transitionsArmed]);
  return <Mapbox.ShapeSource id={`${id}-halo-source`} shape={shape}>
    <Mapbox.CircleLayer id={`${id}-halo`} style={style} />
    <Mapbox.CircleLayer id={`${id}-halo-trailing`} style={trailingStyle} />
  </Mapbox.ShapeSource>;
}
