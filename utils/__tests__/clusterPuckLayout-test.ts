import { clusterOverlapsPuck, getClusterPuckDisplayPoint } from '../clusterPuckLayout';

describe('separate cluster count and location anchors', () => {
  it('leaves separated markers untouched', () => {
    expect(getClusterPuckDisplayPoint([70, 300], [250, 500], 390, 844)).toBeNull();
  });
  it('offsets a colliding bottom-anchored marker without changing either input', () => {
    const anchor: [number, number] = [200, 450], puck: [number, number] = [205, 440];
    const result = getClusterPuckDisplayPoint(anchor, puck, 390, 844);
    expect(result).not.toBeNull();
    expect(clusterOverlapsPuck(result!, puck)).toBe(false);
    expect(anchor).toEqual([200, 450]); expect(puck).toEqual([205, 440]);
  });
  it('reserves room for the count stack above the coordinate and avoids the right rail', () => {
    const result = getClusterPuckDisplayPoint([350, 440], [330, 400], 390, 844)!;
    expect(result[0]).toBeLessThanOrEqual(294);
    expect(clusterOverlapsPuck(result, [330, 400])).toBe(false);
  });
  it('uses an alternate lane when the preferred offset has another cluster', () => {
    const free = getClusterPuckDisplayPoint([190, 450], [190, 450], 600, 844)!;
    const occupied = getClusterPuckDisplayPoint([190, 450], [190, 450], 600, 844, [free])!;
    expect(occupied).not.toEqual(free);
    expect(clusterOverlapsPuck(occupied, [190, 450])).toBe(false);
  });
  it('rejects invalid/native unmeasured viewports', () => {
    expect(getClusterPuckDisplayPoint([1, 1], [1, 1], 0, 0)).toBeNull();
    expect(getClusterPuckDisplayPoint([NaN, 1], [1, 1], 390, 844)).toBeNull();
  });
});
