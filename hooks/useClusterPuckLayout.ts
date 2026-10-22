import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Cluster } from '../types/events';
import { getClusterPuckDisplayPoint, type MapPoint, type PuckDisplacement } from '../utils/clusterPuckLayout';

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
};
const point = (p: number[]): p is [number, number] => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Bounded native projection work after camera idle, data or location changes. */
export function useClusterPuckLayout(options: Options) {
  const userLongitude = options.userCoordinate?.[0];
  const userLatitude = options.userCoordinate?.[1];
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [offsets, setOffsets] = useState<Record<string, PuckDisplacement>>({});
  const refresh = useCallback(() => {
    const ticket = ++generation.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const run = async () => {
        const o = latest.current, map = o.map.current, user = o.userCoordinate;
        if (!o.enabled || !map || !user || !o.width || !o.height) { setOffsets({}); return; }
        // Only the eight nearest geographic clusters can plausibly collide with the puck.
        const candidates = o.clusters.filter(c => c.venues.length > 0).map(c => ({ cluster: c, anchor: o.coordinateForCluster(c) }))
          .sort((a, b) => Math.hypot(a.anchor[0] - user[0], a.anchor[1] - user[1]) - Math.hypot(b.anchor[0] - user[0], b.anchor[1] - user[1])).slice(0, 8);
        const [puck, projected] = await Promise.all([
          map.getPointInView(user), Promise.all(candidates.map(async c => ({ ...c, screen: await map.getPointInView(c.anchor) }))),
        ]);
        if (ticket !== generation.current || !point(puck)) return;
        const next: Record<string, PuckDisplacement> = {};
        const placed: MapPoint[] = [];
        for (const c of projected) {
          if (!point(c.screen)) continue;
          const occupied = [...placed, ...projected.filter(p => p !== c && point(p.screen)).map(p => p.screen as [number, number])];
          const display = getClusterPuckDisplayPoint(c.screen, puck, o.width, o.height, occupied);
          if (!display) continue;
          const coordinate = await map.getCoordinateFromView(display);
          if (ticket !== generation.current) return;
          if (point(coordinate)) { next[c.cluster.id] = { anchor: c.anchor, coordinate }; placed.push(display); }
        }
        if (ticket === generation.current) setOffsets(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      };
      void run().catch(() => { if (ticket === generation.current) setOffsets({}); });
    }, 120);
  }, []);
  useEffect(() => { refresh(); }, [options.clusters, userLongitude, userLatitude, options.width, options.height, options.enabled, refresh]);
  useEffect(() => () => { generation.current += 1; if (timer.current) clearTimeout(timer.current); }, []);
  return { offsets, refresh };
}
