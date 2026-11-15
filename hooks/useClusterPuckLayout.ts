import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Cluster } from '../types/events';
import { observePuck } from '../utils/puckDiagnostics';
import { isMapCameraGestureActive } from '../utils/mapCameraGestures';
import { matchesCameraProjection, sampleCameraProjection, type CameraProjection, type ProjectionMap } from '../utils/puckCameraProjection';
import { canPlaceRect, getClusterPuckTranslation, MAX_PUCK_DISPLACEMENT, rectsOverlap, translateRect, type MapRect, type MarkerGeometry, type PuckDisplacement, type PuckSnapshot } from '../utils/clusterPuckLayout';
export type { PuckSnapshot } from '../utils/clusterPuckLayout';

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
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelFrames = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const cameraSeen = useRef(false);
  const lastCameraAt = useRef(0);
  const nativeGesture = useRef(false);
  const touch = useRef<'unknown' | 'down' | 'up'>('unknown');
  const idleWhileTouched = useRef<number | null>(null);
  const cameraProof = useRef<CameraProjection | null>(null);
  const checking = useRef(false);
  const checkAgain = useRef(false);
  const checkRetries = useRef(0);
  const nextCheckAt = useRef(0);
  const resumeRun = useRef(false);
  const refreshRef = useRef<() => void>(() => {});
  const queueRef = useRef<() => void>(() => {});
  const measurements = useRef(new Map<string, MarkerGeometry>());
  const [offsets, setOffsets] = useState<Record<string, PuckDisplacement>>({});
  const touchBlocked = useCallback(() => touch.current === 'down' || (nativeGesture.current && touch.current !== 'up'), []);
  const cancelCameraCheck = useCallback(() => {
    if (quietTimer.current) { clearTimeout(quietTimer.current); quietTimer.current = null; }
    cancelFrames.current?.(); cancelFrames.current = null;
  }, []);
  const invalidate = useCallback(() => {
    generation.current += 1;
    cancelCameraCheck();
    observePuck('invalidated', { generation: generation.current });
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (expiryTimer.current) { clearTimeout(expiryTimer.current); expiryTimer.current = null; }
    setOffsets(previous => Object.keys(previous).length ? {} : previous);
  }, [cancelCameraCheck]);
  const retryCameraCheck = useCallback(() => {
    // Recover a transient native read/drift without requiring another camera
    // callback, but never turn a missing/failed projection API into polling.
    if (checkRetries.current >= 2) return;
    checkRetries.current += 1;
    nextCheckAt.current = Date.now() + 250 * 2 ** (checkRetries.current - 1);
    queueRef.current();
  }, []);
  const queueCameraCheck = useCallback(() => {
    const o = latest.current;
    if (settled.current || !mounted.current || !cameraSeen.current || !o.enabled || !o.map.current || o.width <= 0 || o.height <= 0) return;
    if (touchBlocked()) { observePuck('waiting-touch'); return; }
    if (checking.current) { checkAgain.current = true; return; }
    if (quietTimer.current) return;
    // Quiet only schedules a check. Native projection agreement across UI frames
    // and again at commit is the proof; elapsed time alone never unlocks layout.
    observePuck('camera-check-queued');
    quietTimer.current = setTimeout(() => {
      quietTimer.current = null;
      const state = latest.current, map = state.map.current;
      if (!map || !state.enabled || touchBlocked() || settled.current) return;
      const ticket = generation.current;
      const current = () => mounted.current && ticket === generation.current && latest.current.enabled && latest.current.map.current === map && !touchBlocked();
      checking.current = true; checkAgain.current = false;
      const waitFrames = () => new Promise<boolean>(resolve => {
        let handle: number, remaining = 2, done = false;
        const finish = (value: boolean) => { if (done) return; done = true; cancelFrames.current = null; resolve(value); };
        const frame = () => { if (!current()) finish(false); else if (--remaining === 0) finish(true); else handle = requestAnimationFrame(frame); };
        handle = requestAnimationFrame(frame);
        cancelFrames.current = () => { cancelAnimationFrame(handle); finish(false); };
      });
      const verify = async () => {
        observePuck('camera-check', { generation: ticket });
        const proof = await sampleCameraProjection(map, state.width, state.height);
        if (!current() || !(await waitFrames())) return;
        const stable = await matchesCameraProjection(map, proof, latest.current.width, latest.current.height);
        if (!current()) return;
        if (!stable) { observePuck('camera-drift'); retryCameraCheck(); return; }
        cameraProof.current = proof; settled.current = true;
        observePuck('camera-verified', { generation: ticket });
        refreshRef.current();
      };
      void verify().catch(() => { if (current()) { observePuck('camera-check-error'); retryCameraCheck(); } }).finally(() => {
        checking.current = false;
        if (!settled.current && mounted.current && (checkAgain.current || ticket !== generation.current)) queueRef.current();
      });
    }, Math.max(0, 250 - (Date.now() - lastCameraAt.current), nextCheckAt.current - Date.now()));
  }, [retryCameraCheck, touchBlocked]);
  useLayoutEffect(() => { queueRef.current = queueCameraCheck; }, [queueCameraCheck]);
  const refresh = useCallback(() => {
    invalidate();
    if (!settled.current) { observePuck('waiting-idle'); queueRef.current(); return; }
    const ticket = generation.current;
    const current = () => {
      if (ticket !== generation.current || !settled.current || !mounted.current) return false;
      if (touchBlocked()) { resumeRun.current = true; return false; }
      return true;
    };
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
        // Read location first so a slow provider cannot create an unchecked
        // camera gap after the final native projection proof.
        const finalPuck = await o.getPuckSnapshot();
        if (!current()) return;
        // A verified fallback camera must still match after all other awaited
        // work. A delayed/missing camera callback cannot authorize stale work.
        const proof = cameraProof.current;
        if (proof && !(await matchesCameraProjection(map, proof, o.width, o.height))) {
          if (current()) {
            observePuck('camera-drift'); cameraProof.current = null; settled.current = false;
            lastCameraAt.current = Date.now(); invalidate(); retryCameraCheck();
          }
          return;
        }
        if (!current()) return;
        if (current() && equal(finalPuck, puck) && (puck.validUntil == null || puck.validUntil > Date.now())) {
          setOffsets(next);
          checkRetries.current = 0; nextCheckAt.current = 0;
          observePuck('committed', { generation: ticket, offsets: Object.keys(next).length });
          for (const move of committedMoves) observePuck('committed-move', { generation: ticket, ...move });
          if (puck.validUntil != null) expiryTimer.current = setTimeout(invalidate, Math.max(0, puck.validUntil - Date.now()));
        } else observePuck(!current() ? 'stale-generation' : puck.validUntil != null && puck.validUntil <= Date.now() ? 'sample-expired' : 'sample-changed');
      };
      void run().catch(() => {
        observePuck('projection-error');
        if (current()) {
          const usedFallback = cameraProof.current !== null;
          if (usedFallback) { cameraProof.current = null; settled.current = false; }
          invalidate();
          if (usedFallback) retryCameraCheck();
        }
      });
    }, 80);
  }, [invalidate, retryCameraCheck, touchBlocked]);
  useLayoutEffect(() => { refreshRef.current = refresh; }, [refresh]);
  const onCameraChanged = useCallback((event?: unknown) => {
    const active = isMapCameraGestureActive(event);
    // A native camera event may be delivered after the real touch-end event.
    // The observed map-surface touch state remains authoritative until the next
    // touch-start/cancel; a cached isGestureActive=true must not relatch it.
    nativeGesture.current = active; cameraSeen.current = true; lastCameraAt.current = Date.now();
    checkRetries.current = 0; nextCheckAt.current = 0;
    cameraProof.current = null; idleWhileTouched.current = null;
    observePuck('camera-moving', { gestureActive: Number(active) }); settled.current = false; invalidate(); queueRef.current();
  }, [invalidate]);
  const onMapIdle = useCallback(() => {
    observePuck('camera-idle'); cameraSeen.current = true; nativeGesture.current = false;
    if (touch.current === 'down') { idleWhileTouched.current = generation.current; observePuck('waiting-touch'); return; }
    cameraProof.current = null; settled.current = true; refresh();
  }, [refresh]);
  const onMapTouchStart = useCallback((count = 1) => {
    touch.current = 'down'; cancelCameraCheck(); observePuck('map-touch-down', { touches: count });
  }, [cancelCameraCheck]);
  const onMapTouchEnd = useCallback((count = 0) => {
    touch.current = count > 0 ? 'down' : 'up'; observePuck('map-touch-up', { touches: count });
    if (count > 0) return;
    if (idleWhileTouched.current === generation.current) {
      idleWhileTouched.current = null; cameraProof.current = null; settled.current = true; refresh();
    } else if (resumeRun.current && settled.current) { resumeRun.current = false; refresh(); }
    else queueRef.current();
  }, [refresh]);
  const onMapTouchCancel = useCallback(() => {
    touch.current = 'unknown'; cancelCameraCheck(); observePuck('map-touch-cancelled');
  }, [cancelCameraCheck]);
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
    if (!options.enabled) { settled.current = false; cameraProof.current = null; nativeGesture.current = false; touch.current = 'unknown'; }
    const ids = new Set(options.clusters.map(c => c.id));
    for (const id of measurements.current.keys()) if (!ids.has(id)) measurements.current.delete(id);
    refresh();
  }, [options.clusters, userLongitude, userLatitude, options.puckRevision, options.width, options.height, options.enabled, options.getPuckSnapshot, options.layoutRevision, safeViewportKey, refresh]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; cancelCameraCheck(); if (timer.current) clearTimeout(timer.current); if (expiryTimer.current) clearTimeout(expiryTimer.current); };
  }, [cancelCameraCheck]);
  return { offsets, refresh, onCameraChanged, onMapIdle, onMapTouchStart, onMapTouchEnd, onMapTouchCancel, recordMarkerBounds, recordMarkerGeometry };
}
