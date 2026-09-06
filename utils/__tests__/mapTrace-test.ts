type MapTraceModule = typeof import('../mapTrace');

const loadEnabledTrace = (): MapTraceModule => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE = '1';
  process.env.EXPO_PUBLIC_MAP_LATENCY_VARIANT = 'baseline';
  return require('../mapTrace') as MapTraceModule;
};

describe('bounded map latency diagnostics', () => {
  const originalTraceFlag = process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE;
  const originalTraceVariant = process.env.EXPO_PUBLIC_MAP_LATENCY_VARIANT;

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();

    if (originalTraceFlag === undefined) {
      delete process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE;
    } else {
      process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE = originalTraceFlag;
    }

    if (originalTraceVariant === undefined) {
      delete process.env.EXPO_PUBLIC_MAP_LATENCY_VARIANT;
    } else {
      process.env.EXPO_PUBLIC_MAP_LATENCY_VARIANT = originalTraceVariant;
    }
  });

  it('uses a monotonic clock and carries one gesture session through trace entries', () => {
    let monotonicMs = 100;
    jest.spyOn(globalThis.performance, 'now').mockImplementation(() => monotonicMs++);
    const trace = loadEnabledTrace();

    const gestureSessionId = trace.beginMapTraceGestureSession('test_gesture');
    trace.traceMapEvent('gesture_step');

    const entries = trace.getMapTraceState().entries;
    expect(gestureSessionId).toMatch(/-g1$/);
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.gestureSessionId === gestureSessionId)).toBe(true);
    expect(entries[1].monotonicMs).toBeGreaterThan(entries[0].monotonicMs);
  });

  it('counts measured schedule-state invocations and cumulative duration by caller', () => {
    let monotonicMs = 200;
    jest.spyOn(globalThis.performance, 'now').mockImplementation(() => {
      const current = monotonicMs;
      monotonicMs += 2.5;
      return current;
    });
    const trace = loadEnabledTrace();
    const gestureSessionId = trace.beginMapTraceGestureSession('schedule_test');

    expect(trace.measureMapScheduleState('events_pill_counts', () => 'first')).toBe('first');
    expect(trace.measureMapScheduleState('events_pill_counts', () => 'second')).toBe('second');
    expect(trace.measureMapScheduleState('specials_pill_counts', () => 'special')).toBe('special');

    expect(trace.getMapScheduleStateMetricSnapshot('events_pill_counts', gestureSessionId)).toEqual({
      count: 2,
      cumulativeDurationMs: 5,
    });
    expect(trace.getMapScheduleStateMetricSnapshot('specials_pill_counts', gestureSessionId)).toEqual({
      count: 1,
      cumulativeDurationMs: 2.5,
    });
    expect(trace.getMapScheduleStateMetricSnapshot('cluster_now_today', gestureSessionId)).toEqual({
      count: 0,
      cumulativeDurationMs: 0,
    });
  });

  it('records expected versus actual timer timing and event-loop lateness', () => {
    jest.spyOn(globalThis.performance, 'now').mockReturnValue(900);
    const trace = loadEnabledTrace();
    const gestureSessionId = trace.beginMapTraceGestureSession('timer_test');
    const expectation = trace.createMapTraceTimerExpectation(
      'movement_end_debounce',
      250,
      gestureSessionId,
      100
    );

    trace.traceMapTimerScheduled(expectation);
    trace.traceMapTimerFired(expectation, undefined, 375);

    const fired = trace.getMapTraceState().entries.find((entry) =>
      entry.label === 'timer_fired' && entry.details?.timerId === expectation.id
    );
    expect(fired).toMatchObject({
      gestureSessionId,
      details: {
        timerName: 'movement_end_debounce',
        delayMs: 250,
        scheduledAtMonotonicMs: 100,
        expectedAtMonotonicMs: 350,
        firedAtMonotonicMs: 375,
        actualDelayMs: 275,
        latenessMs: 25,
      },
    });
  });

  it('retains only the newest 160 timestamped entries', () => {
    jest.spyOn(globalThis.performance, 'now').mockReturnValue(1);
    const trace = loadEnabledTrace();

    for (let index = 0; index < 170; index += 1) {
      trace.traceMapEvent(`entry_${index}`);
    }

    const entries = trace.getMapTraceState().entries;
    expect(entries).toHaveLength(160);
    expect(entries[0].label).toBe('entry_10');
    expect(entries[159].label).toBe('entry_169');
  });
});
