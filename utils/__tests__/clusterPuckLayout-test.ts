import { getClusterPuckTranslation, getConservativePuckSnapshot, MAX_PUCK_DISPLACEMENT, rectsOverlap, translateRect, type MapRect } from '../clusterPuckLayout';
const viewport = { left: 0, top: 0, right: 390, bottom: 844 };
const puck = { left: 188, right: 212, top: 438, bottom: 462 };

describe('minimum measured cluster/puck clearance', () => {
  it('does not move a separated marker even inside the old oversized collision region', () => {
    expect(getClusterPuckTranslation({ left: 180, right: 220, top: 490, bottom: 514 }, puck, viewport)).toBeNull();
  });
  it('uses only the overlapping edge distance plus4points, not a preset jump', () => {
    const marker = { left: 150, right: 200, top: 440, bottom: 464 };
    expect(getClusterPuckTranslation(marker, puck, viewport)).toEqual([-16, 0]);
  });
  it('chooses a short valid direction at a viewport edge', () => {
    const marker = { left: 0, right: 40, top: 0, bottom: 24 };
    const edgePuck = { left: 4, right: 28, top: 4, bottom: 28 };
    const delta = getClusterPuckTranslation(marker, edgePuck, viewport)!;
    expect(delta).toEqual([32, 0]); expect(translateRect(marker, delta).left).toBeGreaterThanOrEqual(0);
  });
  it('does not displace a large card across the map if no short placement fits', () => {
    expect(getClusterPuckTranslation({ left: 110, right: 290, top: 360, bottom: 540 }, puck, viewport)).toBeNull();
  });
  it('uses another close edge when a measured neighbor occupies the closest lane', () => {
    const marker = { left: 150, right: 200, top: 440, bottom: 464 };
    const delta = getClusterPuckTranslation(marker, puck, viewport, [{ left: 120, right: 150, top: 440, bottom: 464 }])!;
    expect(delta).not.toEqual([-16, 0]); expect(Math.hypot(...delta)).toBeLessThanOrEqual(MAX_PUCK_DISPLACEMENT);
  });
  it.each([0.75, 1, 1.5, 2, 3])('honors actual measured sizes at content scale%s', scale => {
    const marker: MapRect = { left: 200 - 22 * scale, right: 200 + 22 * scale, top: 450 - 16 * scale, bottom: 450 };
    const delta = getClusterPuckTranslation(marker, puck, viewport)!;
    expect(delta).not.toBeNull(); expect(Math.hypot(...delta)).toBeLessThanOrEqual(MAX_PUCK_DISPLACEMENT);
    expect(rectsOverlap(translateRect(marker, delta), puck)).toBe(false);
  });
  it('rejects unmeasured and invalid geometry', () => {
    expect(getClusterPuckTranslation({ left: 0, top: 0, right: 0, bottom: 0 }, puck, viewport)).toBeNull();
    expect(getClusterPuckTranslation({ left: NaN, top: 400, right: 250, bottom: 450 }, puck, viewport)).toBeNull();
  });
  it('caps total displacement including an existing edge dock', () => {
    const marker = { left: 150, right: 200, top: 440, bottom: 464 };
    const delta = getClusterPuckTranslation(marker, puck, viewport, [], 48, [-40, 0])!;
    expect(delta).not.toEqual([-16, 0]); expect(Math.hypot(delta[0] - 40, delta[1])).toBeLessThanOrEqual(48);
  });
  it('keeps a large-font compact count clear of both the puck and top/left controls', () => {
    const marker = { left: -6, right: 54, top: 67, bottom: 120 };
    const p = { left: 4, right: 32, top: 106, bottom: 134 };
    const safe = { left: 8, right: 316, top: 96, bottom: 520 };
    const delta = getClusterPuckTranslation(marker, p, safe)!;
    expect(delta).toEqual([42, 29]); expect(Math.hypot(...delta)).toBeLessThanOrEqual(MAX_PUCK_DISPLACEMENT);
    expect(translateRect(marker, delta).top).toBe(96);
  });
});

describe('conservative existing-location proxy', () => {
  const sample = { timestamp: 100000, coords: { longitude: -63.13, latitude: 46.24, accuracy: 20 } };
  it('returns an immutable bounded core proxy only for a recent overview sample', () => {
    const s = getConservativePuckSnapshot(sample, 10, 100500)!;
    expect(s.coordinate).toEqual([-63.13, 46.24]); expect(s.bounds.right).toBeGreaterThan(14); expect(s.bounds.right).toBeLessThanOrEqual(18);
    expect(s.validUntil).toBe(130000); expect(s.coordinate).not.toBe(sample.coords);
  });
  it.each([
    [null, 10, 100500], [sample, 14, 100500], [sample, 10, 130000], [sample, 10, 98000],
    [{ ...sample, coords: { ...sample.coords, accuracy: null } }, 10, 100500],
    [{ ...sample, coords: { ...sample.coords, accuracy: 76 } }, 10, 100500],
    [sample, 13.5, 100500],
  ])('declines stale, unknown, inaccurate or too-detailed geometry %#', (s, zoom, now) => {
    expect(getConservativePuckSnapshot(s as typeof sample, zoom as number, now as number)).toBeNull();
  });
});
