import { observePuck, puckDiagnosticSnapshot, startPuckDiagnostics, stopPuckDiagnostics, subscribePuckDiagnostics } from '../puckDiagnostics';

describe('private bounded placement observation', () => {
  beforeEach(() => { jest.useFakeTimers(); stopPuckDiagnostics(); });
  afterEach(() => { stopPuckDiagnostics(); jest.useRealTimers(); });
  it('records nothing before deliberate activation and clears everything on stop', () => {
    observePuck('attempt', { generation: 1 }); expect(puckDiagnosticSnapshot().rows).toEqual([]);
    startPuckDiagnostics(); observePuck('attempt', { generation: 2 }); expect(puckDiagnosticSnapshot().attempts).toBe(1);
    stopPuckDiagnostics(); expect(puckDiagnosticSnapshot()).toMatchObject({ active: false, attempts: 0, rows: [], sample: null });
  });
  it('cannot activate in a bundle with the compile gate disabled', () => {
    const previous = process.env.EXPO_PUBLIC_PUCK_DIAGNOSTICS;
    process.env.EXPO_PUBLIC_PUCK_DIAGNOSTICS = '0';
    jest.isolateModules(() => { const off = require('../puckDiagnostics'); off.startPuckDiagnostics(); off.observePuck('attempt'); expect(off.puckDiagnosticSnapshot().active).toBe(false); expect(off.puckDiagnosticSnapshot().rows).toEqual([]); });
    process.env.EXPO_PUBLIC_PUCK_DIAGNOSTICS = previous;
  });
  it('drops unexpected fields and non-finite values, even on a wider accidental input', () => {
    startPuckDiagnostics();
    observePuck('candidate', { width: 65.333, height: Infinity, coordinate: [1, 2], longitude: 3, id: 'private', error: 'private' } as any);
    observePuck('private-error-message' as any, { width: 9 });
    expect(puckDiagnosticSnapshot().candidates[0].values).toEqual({ width: 65.3 });
    expect(JSON.stringify(puckDiagnosticSnapshot())).not.toMatch(/private|longitude|coordinate|Infinity/);
  });
  it('bounds history, aggregates camera traffic, and throttles notifications', () => {
    const notify = jest.fn(); const unsubscribe = subscribePuckDiagnostics(notify);
    startPuckDiagnostics(); notify.mockClear();
    for (let i = 0; i < 100; i++) { observePuck('camera-moving'); observePuck('candidate', { rank: i }); }
    expect(notify).not.toHaveBeenCalled(); jest.advanceTimersByTime(250); expect(notify).toHaveBeenCalledTimes(1);
    expect(puckDiagnosticSnapshot()).toMatchObject({ cameraMoves: 100 });
    expect(puckDiagnosticSnapshot().rows).toHaveLength(12); expect(puckDiagnosticSnapshot().candidates).toHaveLength(8); unsubscribe();
  });
  it('shows only a current committed move and expires capture', () => {
    startPuckDiagnostics(); observePuck('chosen', { rank: 1 }); observePuck('sample-changed'); expect(puckDiagnosticSnapshot().chosen).toBeNull();
    observePuck('committed', { offsets: 1 }); observePuck('committed-move', { dx: 0, dy: -44 }); expect(puckDiagnosticSnapshot().chosen?.values.dy).toBe(-44);
    observePuck('invalidated'); expect(puckDiagnosticSnapshot().currentOffsets).toBe(0); expect(puckDiagnosticSnapshot().chosen).toBeNull();
    jest.advanceTimersByTime(180000); expect(puckDiagnosticSnapshot().active).toBe(false); expect(puckDiagnosticSnapshot().rows).toEqual([]);
  });
});
