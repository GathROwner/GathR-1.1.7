import {
  getTutorialDemoClusterFrame,
  TUTORIAL_DEMO_CLUSTER_SIZE,
} from '../tutorialDemoFixtureLayout';

describe('tutorial demo fixture layout', () => {
  it('centres the tutorial-only cluster within the iPhone safe viewport and above the sheet', () => {
    const frame = getTutorialDemoClusterFrame(
      { width: 393, height: 852 },
      { top: 59, right: 0, bottom: 34, left: 0 },
    );

    expect(frame).toEqual({ x: 160.5, y: 367, width: 72, height: 72 });
    expect(frame.x + frame.width / 2).toBe(196.5);
    expect(frame.y).toBeGreaterThan(59 + 168 - 1);
    expect(frame.y + frame.height).toBeLessThan(852 - 34 - 364 + 1);
  });

  it('accounts for Android system insets without using a platform-specific offset', () => {
    const frame = getTutorialDemoClusterFrame(
      { width: 412, height: 915 },
      { top: 24, right: 0, bottom: 24, left: 0 },
    );

    expect(frame).toEqual({ x: 170, y: 396, width: 72, height: 72 });
    expect(frame.x + frame.width / 2).toBe(206);
    expect(frame.y + frame.height).toBeLessThan(915 - 24 - 364 + 1);
  });

  it('keeps the cluster inside a compact viewport when sheet clearance is tight', () => {
    const frame = getTutorialDemoClusterFrame(
      { width: 320, height: 568 },
      { top: 20, right: 0, bottom: 0, left: 0 },
    );

    expect(frame.width).toBe(TUTORIAL_DEMO_CLUSTER_SIZE);
    expect(frame.height).toBe(TUTORIAL_DEMO_CLUSTER_SIZE);
    expect(frame.y).toBeGreaterThanOrEqual(188);
  });
});
