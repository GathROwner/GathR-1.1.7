import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { ReadinessRings } from '../ReadinessRings';
import { acknowledgedRingFrame } from '../../../hooks/useAcknowledgedRingProgress';

describe('acknowledged ring animation', () => {
  let tree: renderer.ReactTestRenderer;
  const view = (place: number, resetKey = 'session', label = 'Active', ready = false) =>
    <ReadinessRings here={1} place={place} hereReady placeReady={ready} resetKey={resetKey}><Text>{label}</Text></ReadinessRings>;
  const mount = (place = 0.2) => { act(() => { tree = renderer.create(view(place)); }); };
  const update = (place: number, key = 'session', label = 'Active', ready = false) => { act(() => tree.update(view(place, key, label, ready))); };
  const advance = (ms: number) => { act(() => jest.advanceTimersByTime(ms)); };
  const progress = () => 1 - tree.root.findByProps({ testID: 'check-in-place-ring' }).props.strokeDashoffset / (2 * Math.PI * 21.5);
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { act(() => tree?.unmount()); jest.useRealTimers(); });

  it('moves through intermediate pixels and ends within 600ms plus one frame at the confirmed target', () => {
    mount(); update(0.7);
    expect(progress()).toBeCloseTo(0.2);
    advance(250); expect(progress()).toBeGreaterThan(0.2); expect(progress()).toBeLessThan(0.7);
    advance(400); expect(progress()).toBeCloseTo(0.7);
  });

  it('coalesces a newer acknowledgement from the current displayed value without overshooting', () => {
    mount(); update(0.6); advance(180);
    const before = progress(); update(0.85); expect(progress()).toBeCloseTo(before);
    let previous = before;
    for (let n = 0; n < 40; n += 1) {
      advance(20); const current = progress();
      expect(current).toBeGreaterThanOrEqual(previous - 1e-10);
      expect(current).toBeLessThanOrEqual(0.85 + 1e-10); previous = current;
    }
    expect(progress()).toBeCloseTo(0.85);
  });

  it('holds after the acknowledged target across pause, resume, error and two minutes of staleness', () => {
    mount(0.7);
    for (const label of ['Paused', 'Resumed', 'Verification error', 'Stale']) {
      update(0.7, 'session', label); advance(120_000);
      expect(progress()).toBeCloseTo(0.7);
    }
    update(0.75); advance(650); expect(progress()).toBeCloseTo(0.75);
  });

  it('immediately clears a genuine session reset and cancels the prior animation', () => {
    mount(); update(0.85); advance(160); update(0, 'replacement');
    expect(tree.root.findAllByProps({ testID: 'check-in-place-ring' })).toHaveLength(0);
    advance(10_000);
    expect(tree.root.findAllByProps({ testID: 'check-in-place-ring' })).toHaveLength(0);
    update(0.1, 'replacement'); advance(650); expect(progress()).toBeCloseTo(0.1);
  });

  it('never closes an unready ring and keeps the real ready/revocation presentation', () => {
    mount(1); expect(progress()).toBeCloseTo(0.92);
    update(1, 'session', 'Ready', true); advance(650); expect(progress()).toBe(1);
    update(1, 'session', 'Verification required', false); expect(progress()).toBeCloseTo(0.92);
  });

  it('cancels outstanding frames when the component unmounts', () => {
    mount(); update(0.7); expect(jest.getTimerCount()).toBeGreaterThan(0);
    act(() => tree.unmount()); expect(jest.getTimerCount()).toBe(0);
  });

  it('bounds interpolation even for early and late frames', () => {
    expect(acknowledgedRingFrame(0.2, 0.7, -50)).toBe(0.2);
    expect(acknowledgedRingFrame(0.2, 0.7, 10_000)).toBe(0.7);
    expect(acknowledgedRingFrame(0.7, 0, 100)).toBe(0);
  });
});
