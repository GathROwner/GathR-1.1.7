import {
  MINIMUM_VERSION_POLICY_URL,
  MinimumAppVersionPolicy,
  parseMinimumAppVersionPolicy,
} from '../utils/minimumAppVersion';

export const VERSION_POLICY_TIMEOUT_MS = 2500;

/** No persisted mandatory policy: missing, stale, offline or bad data fails open. */
export async function fetchMinimumAppVersionPolicy(signal?: AbortSignal): Promise<MinimumAppVersionPolicy | null> {
  if (signal?.aborted) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const cancelled = new Promise<null>((resolve) => {
    cancel = () => {
      controller.abort();
      resolve(null);
    };
    timer = setTimeout(cancel, VERSION_POLICY_TIMEOUT_MS);
    signal?.addEventListener('abort', cancel, { once: true });
  });
  const request = (async () => {
    try {
      const response = await fetch(MINIMUM_VERSION_POLICY_URL, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;
      const body = await response.text();
      if (body.length > 16384) return null;
      return parseMinimumAppVersionPolicy(JSON.parse(body));
    } catch {
      return null;
    }
  })();
  try {
    // Deadline covers body consumption too, even if a fetch implementation
    // ignores AbortController. A late response cannot re-enable the gate.
    return await Promise.race([request, cancelled]);
  } finally {
    clearTimeout(timer);
    if (cancel) signal?.removeEventListener('abort', cancel);
  }
}
