import type { GestureResponderEvent } from 'react-native';

export type MapWindowLayout = { x: number; y: number; width: number; height: number };
// RNMapbox 10.3 creates this manager on iOS. Its native UUIDs differ from React IDs.
export const HYBRID_POINT_ANNOTATION_LAYER_ID = 'RNMBX-mapview-point-annotations';
type HitFeature = { geometry?: { type: string; coordinates?: unknown } | null };
type HitResult = { features?: readonly HitFeature[] } | undefined;
export type HybridTapSurface = {
  identity: object;
  layout: MapWindowLayout;
  zoom: number;
  query: (point: [number, number]) => Promise<HitResult>;
};
export type HybridTapOptions<T> = {
  active: boolean;
  canOpen: () => boolean;
  surface: () => HybridTapSurface | null;
  onPress: (target: T, source: 'release' | 'native') => void;
  trace?: (label: string, details?: Record<string, string | number | boolean>) => void;
};

const worldPoint = (coordinate: unknown): [number, number] | null => {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
  const [longitude, latitude] = coordinate;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 85) return null;
  return [(longitude + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) / Math.PI) / 2];
};
/** Observe completed touches without taking responder ownership from Mapbox.
 * Mapbox determines the actual painted hit. Resolve its native UUID's geometry
 * to one registered annotation, allowing <=2 world pixels for tile quantization.
 * Ambiguous/unmatched hits retain native selection; this is not a hit radius.
 */
export function createHybridTapDelivery<T>(options: () => HybridTapOptions<T>) {
  const targets = new Map<string, { target: T; coordinate: [number, number]; eligible: boolean }>();
  let revision = 0;
  let delivered = false;
  let suppressNativeUntil = 0;
  let touch: { id: string; x: number; y: number; timestamp: number; valid: boolean } | null = null;
  const invalidate = () => { revision++; touch = null; };
  const observeMove = (event: GestureResponderEvent) => {
    if (!touch) return;
    const contacts = event.nativeEvent.touches;
    const first = contacts[0] ?? event.nativeEvent.changedTouches[0];
    if (contacts.length > 1 || !first || first.identifier !== touch.id ||
      Math.hypot(first.pageX - touch.x, first.pageY - touch.y) > 10) touch.valid = false;
  };
  const queryTap = async (pageX: number, pageY: number, ticket: number) => {
    const context = options();
    if (!context.canOpen() || !targets.size) return;
    const surface = context.surface();
    if (!surface || !Number.isFinite(surface.zoom) || surface.zoom < 0 || surface.zoom > 22) return;
    const { x, y, width, height } = surface.layout;
    const point: [number, number] = [pageX - x, pageY - y];
    if (![x, y, width, height, ...point].every(Number.isFinite) || width <= 0 || height <= 0 ||
      point[0] < 0 || point[1] < 0 || point[0] > width || point[1] > height) return;
    try {
      context.trace?.('hybrid_release_hit_query_started');
      const result = await surface.query(point);
      const current = options();
      const currentSurface = current.surface();
      if (ticket !== revision || delivered || !current.active || !current.canOpen() ||
        currentSurface?.identity !== surface.identity || currentSurface.zoom !== surface.zoom || currentSurface.layout !== surface.layout ||
        currentSurface.layout.x !== x || currentSurface.layout.y !== y ||
        currentSurface.layout.width !== width || currentSurface.layout.height !== height) return;
      const hits = new Set<string>();
      for (const feature of result?.features ?? []) {
        const location = feature.geometry?.type === 'Point' ? worldPoint(feature.geometry.coordinates) : null;
        if (!location) return;
        const matches = [...targets].filter(([, entry]) => {
          const candidate = worldPoint(entry.coordinate);
          if (!candidate) return false;
          const dx = Math.abs(location[0] - candidate[0]);
          return Math.hypot(Math.min(dx, 1 - dx), location[1] - candidate[1]) * 512 * 2 ** surface.zoom <= 2;
        });
        if (matches.length !== 1) {
          current.trace?.('hybrid_release_hit_unresolved', { matches: matches.length });
          return;
        }
        hits.add(matches[0][0]);
      }
      if (hits.size !== 1) return;
      const target = targets.get([...hits][0]);
      if (!target?.eligible) return;
      delivered = true;
      // Match the existing opening touch guard; don't latch native-only or
      // accessibility activations indefinitely after the completed finger tap.
      suppressNativeUntil = Date.now() + 1200;
      current.trace?.('hybrid_release_hit_delivered');
      current.onPress(target.target, 'release');
    } catch {
      options().trace?.('hybrid_release_hit_query_failed');
      // The annotation's existing native selection remains the fallback.
    }
  };
  return {
    register(id: string, target: T, coordinate: [number, number], eligible = true) {
      const entry = { target, coordinate: [...coordinate] as [number, number], eligible };
      targets.set(id, entry);
      return () => { if (targets.get(id) === entry) targets.delete(id); };
    },
    invalidate,
    reset() { invalidate(); delivered = false; suppressNativeUntil = 0; },
    onTouchStart(event: GestureResponderEvent) {
      if (!options().active) return;
      if (touch) { touch.valid = false; return; }
      revision++; delivered = false; suppressNativeUntil = 0;
      const contacts = event.nativeEvent.touches;
      const first = contacts[0];
      if (!first) return;
      touch = { id: first.identifier, x: first.pageX, y: first.pageY,
        timestamp: event.nativeEvent.timestamp, valid: contacts.length === 1 };
    },
    onTouchMove: observeMove,
    onTouchEnd(event: GestureResponderEvent) {
      if (!touch) return;
      observeMove(event);
      if (event.nativeEvent.touches.length !== 0) { touch.valid = false; return; }
      const duration = event.nativeEvent.timestamp - touch.timestamp;
      const gestureValid = touch.valid && duration >= 0 && duration <= 500;
      const end = event.nativeEvent.changedTouches[0];
      touch = null;
      if (gestureValid && end && options().active) void queryTap(end.pageX, end.pageY, revision);
    },
    onTouchCancel: invalidate,
    onNativePress(id: string, target: T) {
      const context = options();
      if (context.active && (Date.now() < suppressNativeUntil || touch)) {
        context.trace?.('hybrid_native_tap_suppressed', { annotationId: id, alreadyDelivered: delivered });
        return;
      }
      delivered = true;
      context.onPress(target, 'native');
    },
  };
}
