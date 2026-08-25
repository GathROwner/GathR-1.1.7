import type { Cluster } from '../../types/events';
import {
  clearTutorialClusterTargetsForTests,
  publishTutorialClusterTargets,
  waitForTutorialClusterTargets,
} from '../tutorialClusterTargets';

const cluster = { id: 'cluster-1' } as Cluster;
const target = { cluster, x: 120, y: 240 };

describe('tutorial cluster target readiness', () => {
  beforeEach(() => {
    jest.useRealTimers();
    clearTutorialClusterTargetsForTests();
  });

  it('waits for fresh projected coordinates without polling', async () => {
    publishTutorialClusterTargets([target], 100);
    const waiting = waitForTutorialClusterTargets({ timeoutMs: 200, freshAfter: 150 });
    publishTutorialClusterTargets([{ ...target, x: 160 }], 175);
    await expect(waiting).resolves.toMatchObject({
      source: 'ready',
      targets: [{ x: 160, y: 240 }],
    });
  });

  it('returns the latest usable projection on bounded timeout', async () => {
    jest.useFakeTimers();
    publishTutorialClusterTargets([target], 100);
    const waiting = waitForTutorialClusterTargets({ timeoutMs: 200, freshAfter: 150 });
    jest.advanceTimersByTime(200);
    await expect(waiting).resolves.toMatchObject({ source: 'timeout', targets: [target] });
  });
});
