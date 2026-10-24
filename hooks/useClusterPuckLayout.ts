import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Cluster } from '../types/events';
import { observePuck } from '../utils/puckDiagnostics';
import { canPlaceRect, getClusterPuckTranslation, MAX_PUCK_DISPLACEMENT, rectsOverlap, translateRect, type MapRect, type MarkerGeometry, type PuckDisplacement, type PuckSnapshot } from '../utils/clusterPuckLayout';
export type { PuckSnapshot } from '../utils/clusterPuckLayout';

type ProjectionMap = {
  getPointInView: (coordinate: number[]) => Promise<number[]>;
  getCoordinateFromView: (point: number[]) => Promise<number[]>;
};
type Options = {
  map: React.RefObject<ProjectionMap | null>;
  clusters: Cluster[];
  userCoordinate: [number, number] | null;
  width: number;
  height: number;
  enabled: boolean;
  coordinateForCluster: (cluster: Cluster) => [number, number];
  // Caller documents whether this is measured native geometry or a conservative proxy.
  getPuckSnapshot?: () => Promise<PuckSnapshot | null> | PuckSnapshot | null;
  puckRevision?: number;
  safeViewport?: MapRect;
  layoutRevision?: string;
};
const point = (p: number[]): p is [number, number] => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** One settled camera/location/layout transaction. Never reuse a geographic offset across camera changes. */
export function useClusterPuckLayout(options: Options) {
  const userLongitude = options.userCoordinate?.[0];
  const userLatitude = options.userCoordinate?.[1];
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });
  const generation = useRef(0);
  const settled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measurements = useRef(new Map<string, MarkerGeometry>());
  const [offsets, setOffsets] = useState<Record<string, PuckDisplacement>>({});
  const invalidate = useCallback(() => {
    generation.current += 1;
    observePuck('invalidated', { generation: generation.current });
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (expiryTimer.current) { clearTimeout(expiryTimer.current); expiryTimer.current = null; }
    setOffsets(previous => Object.keys(previous).length ? {} : previous);
  }, []);
  const refresh = useCallback(() => {
    invalidate();
    if (!settled.current) { observePuck('waiting-idle'); return; }
    const ticket = generation.current;
    const current = () => ticket === generation.current && settled.current;
    timer.current = setTimeout(() => {
      timer.current = null;
      const run = async () => {
        const o = latest.current, map = o.map.current;
        observePuck('attempt', { generation: ticket, measured: measurements.current.size });
        if (!o.enabled || !map || !o.getPuckSnapshot || o.width <= 0 || o.height <= 0) { observePuck(!o.enabled ? 'disabled' : 'map-unavailable'); return; }
        const sampledPuck = await o.getPuckSnapshot();
        if (!current() || !sampledPuck) { observePuck(!current() ? 'stale-generation' : 'snapshot-unavailable'); return; }
        // Native providers may reuse/mutate their snapshot object between reads.
        const puck: PuckSnapshot = { ...sampledPuck, coordinate: [...sampledPuck.coordinate], bounds: { ...sampledPuck.bounds } };
        if (puck.validUntil != null && puck.validUntil <= Date.now()) { observePuck('sample-expired'); return; }
        const candidates = o.clusters.filter(c => c.venues.length && measurements.current.has(c.id))
          .map(cluster => ({ cluster, anchor: o.coordinateForCluster(cluster), geometry: measurements.current.get(cluster.id)! }))
          .sort((a, b) => Math.hypot(a.anchor[0] - puck.coordinate[0], a.anchor[1] - puck.coordinate[1]) - Math.hypot(b.anchor[0] - puck.coordinate[0], b.anchor[1] - puck.coordinate[1])).slice(0, 8);
        const projectionStarted = Date.now();
        const [puckPoint, projected] = await Promise.all([
          map.getPointInView(puck.coordinate),
          Promise.all(candidates.map(async c => ({ ...c, screen: await map.getPointInView(c.anchor) }))),
        ]);
        observePuck('projected', { generation: ticket, candidates: candidates.length, projectionMs: Date.now() - projectionStarted, puckWidth: puck.bounds.right - puck.bounds.left, puckHeight: puck.bounds.bottom - puck.bounds.top, validForMs: puck.validUntil == null ? 0 : puck.validUntil - Date.now() });
        if (!current() || !point(puckPoint)) { observePuck(!current() ? 'stale-generation' : 'invalid-projection'); return; }
        const puckRect = translateRect(puck.bounds, puckPoint);
        const viewport = o.safeViewport ?? { left: 0, top: 0, right: o.width, bottom: o.height };
        const next: Record<string, PuckDisplacement> = {};
        const committedMoves: { rank: number; dx: number; dy: number; compact: number }[] = [];
        const visibleRect = (c: typeof projected[number], bounds = c.geometry.bounds) => translateRect(bounds, [c.screen[0] + c.geometry.dock[0], c.screen[1] + c.geometry.dock[1]]);
        const placed = new Map(projected.filter(c => point(c.screen)).map(c => [c.cluster.id, visibleRect(c)]));
        let rank = 0;
        for (const c of projected) {
          rank += 1;
          if (!current()) { observePuck('stale-generation'); return; }
          if (!point(c.screen)) { observePuck('invalid-projection', { rank }); continue; }
          const markerRect = visibleRect(c);
          observePuck('candidate', { rank, width: c.geometry.bounds.right - c.geometry.bounds.left, height: c.geometry.bounds.bottom - c.geometry.bounds.top, compactWidth: c.geometry.compactBounds ? c.geometry.compactBounds.right - c.geometry.compactBounds.left : 0, compactHeight: c.geometry.compactBounds ? c.geometry.compactBounds.bottom - c.geometry.compactBounds.top : 0, dockX: c.geometry.dock[0], dockY: c.geometry.dock[1], overlap: Number(rectsOverlap(markerRect, puckRect)) });
          // Only a current visible overlap starts a displacement/compact fallback.
          if (!rectsOverlap(markerRect, puckRect)) continue;
          const occupied = [...placed].filter(([id]) => id !== c.cluster.id).map(([, bounds]) => bounds);
          let compact = false;
          let chosenRect = markerRect;
          let delta = getClusterPuckTranslation(markerRect, puckRect, viewport, occupied, MAX_PUCK_DISPLACEMENT, c.geometry.dock);
          if (!delta && c.geometry.compactBounds) {
            chosenRect = visibleRect(c, c.geometry.compactBounds);
            delta = canPlaceRect(chosenRect, puckRect, viewport, occupied) && Math.hypot(...c.geometry.dock) <= MAX_PUCK_DISPLACEMENT
              ? [0, 0]
              : getClusterPuckTranslation(chosenRect, puckRect, viewport, occupied, MAX_PUCK_DISPLACEMENT, c.geometry.dock, false);
            compact = !!delta;
          }
          if (!delta) { observePuck('no-clearance', { rank }); continue; }
          observePuck('chosen', { rank, compact: Number(compact) });
          const coordinate = await map.getCoordinateFromView([c.screen[0] + c.geometry.dock[0] + delta[0], c.screen[1] + c.geometry.dock[1] + delta[1]]);
          if (!current()) { observePuck('stale-generation'); return; }
          if (point(coordinate)) { next[c.cluster.id] = { anchor: c.anchor, coordinate, ...(compact ? { compact: true } : {}) }; placed.set(c.cluster.id, translateRect(chosenRect, delta)); committedMoves.push({ rank, dx: c.geometry.dock[0] + delta[0], dy: c.geometry.dock[1] + delta[1], compact: Number(compact) }); }
          else observePuck('invalid-reverse', { rank });
        }
        // Location can change without a camera callback while native projection is pending.
        const finalPuck = await o.getPuckSnapshot();
        if (current() && equal(finalPuck, puck) && (puck.validUntil == null || puck.validUntil > Date.now())) {
          setOffsets(next);
          observePuck('committed', { generation: ticket, offsets: Object.keys(next).length });
          for (const move of committedMoves) observePuck('committed-move', { generation: ticket, ...move });
          if (puck.validUntil != null) expiryTimer.current = setTimeout(invalidate, Math.max(0, puck.validUntil - Date.now()));
        } else observePuck(!current() ? 'stale-generation' : puck.validUntil != null && puck.validUntil <= Date.now() ? 'sample-expired' : 'sample-changed');
      };
      void run().catch(() => { observePuck('projection-error'); if (current()) invalidate(); });
    }, 80);
  }, [invalidate]);
  const onCameraChanged = useCallback(() => { observePuck('camera-moving'); settled.current = false; invalidate(); }, [invalidate]);
  const onMapIdle = useCallback(() => { observePuck('camera-idle'); settled.current = true; refresh(); }, [refresh]);
  const recordMarkerBounds = useCallback((id: string, bounds: MapRect) => {
    const geometry: MarkerGeometry = { bounds, dock: [0, 0] };
    if (equal(measurements.current.get(id), geometry)) return;
    measurements.current.set(id, geometry);
    refresh();
  }, [refresh]);
  const recordMarkerGeometry = useCallback((id: string, geometry: MarkerGeometry) => {
    if (equal(measurements.current.get(id), geometry)) return;
    measurements.current.set(id, geometry);
    refresh();
  }, [refresh]);
  const safeViewportKey = JSON.stringify(options.safeViewport);
  useLayoutEffect(() => {
    const ids = new Set(options.clusters.map(c => c.id));
    for (const id of measurements.current.keys()) if (!ids.has(id)) measurements.current.delete(id);
    refresh();
  }, [options.clusters, userLongitude, userLatitude, options.puckRevision, options.width, options.height, options.enabled, options.getPuckSnapshot, options.layoutRevision, safeViewportKey, refresh]);
  useLayoutEffect(() => () => { generation.current += 1; if (timer.current) clearTimeout(timer.current); if (expiryTimer.current) clearTimeout(expiryTimer.current); }, []);
  return { offsets, refresh, onCameraChanged, onMapIdle, recordMarkerBounds, recordMarkerGeometry };
}
