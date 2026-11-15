import { hybridRingGeometry } from '../hybridRingGeometry';

it('preserves a positive arc and gap for every venue without a large-cluster cutoff', () => {
  for (const count of [1, 2, 12, 13, 19, 40, 126, 1000]) {
    for (const [diameter, stroke, preferredGap] of [[42.3, 3.15, 2.88], [21.6, 1.125, 1.35]]) {
      const ring = hybridRingGeometry(diameter, stroke, count, preferredGap);
      expect(ring.arc).toBeGreaterThan(0);
      expect(ring.gap).toBeLessThan(ring.step);
      expect(ring.gap > 0).toBe(count > 1);
      expect((ring.arc + ring.gap) * count).toBeCloseTo(ring.circumference);
      expect(ring.gap / ring.step).toBeLessThanOrEqual(.280001);
    }
  }
});
