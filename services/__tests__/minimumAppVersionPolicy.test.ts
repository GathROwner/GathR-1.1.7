import { fetchMinimumAppVersionPolicy, VERSION_POLICY_TIMEOUT_MS } from '../minimumAppVersionPolicy';
import disabledPolicy from '../../config/minimum-versions.disabled.json';

const originalFetch = global.fetch;
const mockFetch = jest.fn();
beforeEach(() => { global.fetch = mockFetch; mockFetch.mockReset(); jest.useFakeTimers(); });
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });
const response = (body: string, ok = true) => ({ ok, text: async () => body });

test('fetches an anonymous fresh policy, without identity or account credentials', async () => {
  mockFetch.mockResolvedValue(response(JSON.stringify(disabledPolicy)));
  expect(await fetchMinimumAppVersionPolicy()).toEqual(disabledPolicy);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, options] = mockFetch.mock.calls[0];
  expect(url).toContain('app-config%2Fminimum-versions.json');
  expect(options.cache).toBe('no-store');
  expect(options.headers).toEqual({ Accept: 'application/json' });
  expect(jest.getTimerCount()).toBe(0);
});
test.each([
  response('not json'), response('{}'), response(JSON.stringify(disabledPolicy), false), response(' '.repeat(17000)),
])('bad/missing/oversized responses fail open', async (result) => {
  mockFetch.mockResolvedValue(result);
  expect(await fetchMinimumAppVersionPolicy()).toBeNull();
});
test('offline failure fails open', async () => {
  mockFetch.mockRejectedValue(new Error('offline'));
  expect(await fetchMinimumAppVersionPolicy()).toBeNull();
});
test('deadline covers a hung fetch that ignores abort', async () => {
  mockFetch.mockImplementation(() => new Promise(() => {}));
  const result = fetchMinimumAppVersionPolicy();
  await jest.advanceTimersByTimeAsync(VERSION_POLICY_TIMEOUT_MS);
  expect(await result).toBeNull();
  expect(mockFetch.mock.calls[0][1].signal.aborted).toBe(true);
});
test('deadline also covers a hung response body; late data cannot win', async () => {
  let finish!: (value: string) => void;
  mockFetch.mockResolvedValue({ ok: true, text: () => new Promise((resolve) => { finish = resolve; }) });
  const result = fetchMinimumAppVersionPolicy();
  await jest.advanceTimersByTimeAsync(VERSION_POLICY_TIMEOUT_MS);
  expect(await result).toBeNull();
  finish(JSON.stringify(disabledPolicy));
  expect(await result).toBeNull();
});
test('unmount abort resolves promptly and removes timeout', async () => {
  mockFetch.mockImplementation(() => new Promise(() => {}));
  const controller = new AbortController();
  const result = fetchMinimumAppVersionPolicy(controller.signal);
  controller.abort();
  expect(await result).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
});
test('an already cancelled request makes no network call', async () => {
  const controller = new AbortController();
  controller.abort();
  expect(await fetchMinimumAppVersionPolicy(controller.signal)).toBeNull();
  expect(mockFetch).not.toHaveBeenCalled();
});
