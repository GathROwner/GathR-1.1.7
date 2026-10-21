import { OtaUpdateController, OTA_ABSENCE, OTA_CHECK_INTERVAL, OTA_DEADLINE } from '../otaUpdateController';

const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
describe('automatic OTA lifecycle', () => {
  let now: number;
  let safe: boolean;
  let attempted: string | null;
  let adapter: any;
  let controller: OtaUpdateController;
  beforeEach(() => {
    jest.useFakeTimers(); now = 0; safe = true; attempted = null;
    adapter = {
      check: jest.fn(async () => 'new'), fetch: jest.fn(async () => 'new'), reload: jest.fn(async () => undefined),
      beforeReload: jest.fn(async (id: string) => { attempted = id; return true; }),
      safe: () => safe, alreadyAttempted: (id: string) => attempted === id,
      cancelAttempt: jest.fn(async () => { attempted = null; }),
    };
    controller = new OtaUpdateController(adapter, () => now);
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
  it('only exposes Update now after fetch has resolved, and never reloads while reading', async () => {
    const download = deferred<string>(); adapter.fetch.mockReturnValue(download.promise);
    const job = controller.check(); await Promise.resolve();
    expect(controller.state.phase).toBe('downloading'); expect(controller.state.readyId).toBeNull();
    expect(await controller.apply()).toBe(false);
    download.resolve('new'); await job;
    expect(controller.state.phase).toBe('ready');
    jest.advanceTimersByTime(60 * 60_000);
    expect(adapter.reload).not.toHaveBeenCalled();
  });
  it('single-flights repeated checks and repeated Update now taps', async () => {
    const download = deferred<string>(); adapter.fetch.mockReturnValue(download.promise);
    const job = controller.check(); await Promise.resolve();
    await Promise.all([controller.check(), controller.check()]);
    expect(adapter.check).toHaveBeenCalledTimes(1);
    download.resolve('new'); await job;
    await Promise.all([controller.apply(), controller.apply(), controller.apply()]);
    expect(adapter.reload).toHaveBeenCalledTimes(1);
  });
  it('keeps no-update state quiet', async () => {
    adapter.check.mockResolvedValue(null); await controller.check();
    expect(controller.state.phase).toBe('idle'); expect(adapter.fetch).not.toHaveBeenCalled();
  });
  it('keeps healthy no-update checks available in a long-lived session', async () => {
    adapter.check.mockResolvedValue(null);
    for (let i = 0; i < 6; i++) { now += OTA_CHECK_INTERVAL; await controller.check(); }
    expect(adapter.check).toHaveBeenCalledTimes(6); expect(adapter.fetch).not.toHaveBeenCalled();
  });
  it('clears failed downloads and bounds retry cadence and total session checks', async () => {
    adapter.fetch.mockRejectedValue(new Error('offline'));
    await controller.check(); expect(controller.state.phase).toBe('error');
    await controller.check(); expect(adapter.check).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 6; i++) { now += OTA_CHECK_INTERVAL; await controller.check(); }
    expect(adapter.check).toHaveBeenCalledTimes(4); expect(adapter.reload).not.toHaveBeenCalled();
  });
  it('expires a hung check without starting a late download', async () => {
    const check = deferred<string>(); adapter.check.mockReturnValue(check.promise);
    const job = controller.check(); jest.advanceTimersByTime(OTA_DEADLINE);
    expect(controller.state.phase).toBe('error');
    now += OTA_CHECK_INTERVAL; await controller.check(); expect(adapter.check).toHaveBeenCalledTimes(1);
    check.resolve('late'); await job;
    expect(adapter.fetch).not.toHaveBeenCalled(); expect(controller.state.phase).toBe('error');
  });
  it('expires a hung download without duplicates, accepting a late usable native result', async () => {
    const download = deferred<string>(); adapter.fetch.mockReturnValue(download.promise);
    const job = controller.check(); await Promise.resolve(); jest.advanceTimersByTime(OTA_DEADLINE);
    expect(controller.state.phase).toBe('error');
    now += OTA_CHECK_INTERVAL; await controller.check(); expect(adapter.fetch).toHaveBeenCalledTimes(1);
    download.resolve('new'); await job; expect(controller.state.phase).toBe('ready');
  });
  it('does not overwrite a pending native update with a stale check/fetch', async () => {
    const check = deferred<string>(); adapter.check.mockReturnValue(check.promise);
    const job = controller.check(); controller.ready('native'); check.resolve('old'); await job;
    expect(controller.state.readyId).toBe('native'); expect(adapter.fetch).not.toHaveBeenCalled();
  });
  it('bounds startup native download status and restores a native pending update', () => {
    controller.nativeDownload(true); expect(controller.state.downloadSequence).toBe(1);
    controller.nativeDownload(true); expect(controller.state.downloadSequence).toBe(1);
    jest.advanceTimersByTime(OTA_DEADLINE); expect(controller.state.phase).toBe('error');
    controller.ready('native'); expect(controller.state.phase).toBe('ready');
  });
  it('does not check or fetch on foreground while a native startup download owns the operation', async () => {
    controller.nativeDownload(true); controller.background(); now += OTA_ABSENCE;
    await controller.foreground(); expect(adapter.check).not.toHaveBeenCalled();
    jest.advanceTimersByTime(OTA_DEADLINE); await controller.check(); expect(adapter.check).not.toHaveBeenCalled();
    controller.nativeDownload(false); await controller.check(); expect(adapter.check).toHaveBeenCalledTimes(1);
  });
  it('applies ignored ready update only after a safe real absence', async () => {
    controller.ready('new'); controller.background(); now += OTA_ABSENCE;
    expect(await controller.foreground()).toBe(true); expect(adapter.reload).toHaveBeenCalledTimes(1);
  });
  it.each(['short', 'unsafe-before', 'unsafe-return', 'touched-return', 'became-ready-away'])('defers %s return', async (scenario) => {
    if (scenario !== 'became-ready-away') controller.ready('new');
    if (scenario === 'unsafe-before') safe = false;
    controller.background(); safe = true;
    now += scenario === 'short' ? 1_000 : OTA_ABSENCE;
    if (scenario === 'unsafe-return') safe = false;
    if (scenario === 'became-ready-away') controller.ready('new');
    await controller.foreground(scenario !== 'touched-return');
    expect(adapter.reload).not.toHaveBeenCalled();
  });
  it('blocks unsafe manual application without dropping readiness', async () => {
    controller.ready('new'); safe = false;
    expect(await controller.apply()).toBe(false); expect(controller.state.readyId).toBe('new');
    safe = true; expect(await controller.apply()).toBe(true);
  });
  it('rechecks safety after durable writes and cancels an unused attempt', async () => {
    controller.ready('new'); adapter.beforeReload.mockImplementation(async () => { attempted = 'new'; safe = false; return true; });
    expect(await controller.apply()).toBe(false); expect(adapter.reload).not.toHaveBeenCalled();
    expect(adapter.cancelAttempt).toHaveBeenCalled(); expect(attempted).toBeNull();
  });
  it('does not reload-loop if the native restart fails or same update rolls back', async () => {
    controller.ready('new'); adapter.reload.mockRejectedValue(new Error('reload failed'));
    expect(await controller.apply()).toBe(false);
    expect(await controller.apply()).toBe(false); expect(adapter.reload).toHaveBeenCalledTimes(1);
    expect(controller.state.phase).toBe('ready');
  });
});
