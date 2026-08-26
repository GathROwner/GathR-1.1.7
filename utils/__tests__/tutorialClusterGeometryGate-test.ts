import { createTutorialClusterGeometryGate } from '../tutorialClusterGeometryGate';

const binding = { clusterId: 'cluster-a', revision: 3 };
const geometry = {
  clusterId: 'cluster-a',
  bindingRevision: 3,
  wrapper: { x: 0, y: 0, width: 80, height: 90 },
  core: { x: 20, y: 40, width: 32, height: 32 },
};

describe('tutorial cluster geometry gate', () => {
  it('resolves a bounded wait when the exact binding becomes ready', async () => {
    const gate = createTutorialClusterGeometryGate();
    gate.reset(binding);
    const ready = gate.waitFor(binding, { timeoutMs: 100 });

    expect(gate.publish(geometry)).toBe(true);
    await expect(ready).resolves.toEqual(geometry);
  });

  it('ignores zero geometry and stale revisions', async () => {
    const gate = createTutorialClusterGeometryGate();
    gate.reset(binding);

    expect(gate.publish({
      ...geometry,
      core: { ...geometry.core, width: 0 },
    })).toBe(false);
    expect(gate.publish({ ...geometry, bindingRevision: 2 })).toBe(false);
    await expect(gate.waitFor(binding, { timeoutMs: 5 })).resolves.toBeNull();
  });

  it('releases an old waiter when a new binding replaces it', async () => {
    const gate = createTutorialClusterGeometryGate();
    gate.reset(binding);
    const oldWait = gate.waitFor(binding, { timeoutMs: 100 });

    gate.reset({ clusterId: 'cluster-b', revision: 4 });
    await expect(oldWait).resolves.toBeNull();
    expect(gate.get(binding)).toBeNull();
  });
});
