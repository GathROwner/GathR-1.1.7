import { isCalloutContentAtTop, shouldDismissCalloutPull } from '../calloutPullDismiss';

describe('callout downward dismissal intent', () => {
  it('requires the content to start at the top, tolerating native rounding/bounce', () => {
    expect([0, 1.5, -8].map(isCalloutContentAtTop)).toEqual([true, true, true]);
    expect([3, 150, NaN].map(isCalloutContentAtTop)).toEqual([false, false, false]);
  });
  it('uses a proportionate but bounded distance and a deliberate flick', () => {
    expect(shouldDismissCalloutPull(99, 0, 500)).toBe(false);
    expect(shouldDismissCalloutPull(100, 0, 500)).toBe(true);
    expect(shouldDismissCalloutPull(140, 0, 1000)).toBe(true);
    expect(shouldDismissCalloutPull(80, 0, 200)).toBe(true);
    expect(shouldDismissCalloutPull(23, 1200, 500)).toBe(false);
    expect(shouldDismissCalloutPull(24, 900, 500)).toBe(true);
  });
  it('cancels upward reversals and rejects invalid measurements', () => {
    expect(shouldDismissCalloutPull(170, -400, 600)).toBe(false);
    expect(shouldDismissCalloutPull(-150, -1000, 500)).toBe(false);
    expect(shouldDismissCalloutPull(150, NaN, 500)).toBe(false);
    expect(shouldDismissCalloutPull(150, 300, 0)).toBe(false);
  });
});
