const { createTtlCache } = require('./cache');

const DEFAULT_BACKEND_BASE_URL = process.env.BACKEND_BASE_URL
  || 'https://gathr-backend-924732524090.northamerica-northeast1.run.app';

const previewCache = createTtlCache({
  name: 'event-preview-cache',
  defaultTtlMs: Number(process.env.PREVIEW_CACHE_TTL_MS || 5 * 60 * 1000),
  maxEntries: Number(process.env.PREVIEW_CACHE_MAX_ENTRIES || 1000),
});

function buildRequestHeaders() {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'gathr-deeplink-service/1.0',
  };

  const apiKey = process.env.BACKEND_API_KEY;
  const apiKeyHeader = process.env.BACKEND_API_KEY_HEADER || 'x-api-key';
  const bearerToken = process.env.BACKEND_BEARER_TOKEN;

  if (apiKey) headers[apiKeyHeader] = apiKey;
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  return headers;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || process.env.BACKEND_TIMEOUT_MS || 8000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildRequestHeaders(),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let json = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      json = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      json,
      rawText,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toFetchResult(payload, extra = {}) {
  return {
    ok: false,
    notFound: false,
    status: null,
    item: null,
    error: null,
    source: null,
    fetchedAt: Date.now(),
    ...payload,
    ...extra,
  };
}

function getBackendIdCandidates(eventId) {
  const raw = String(eventId || '').trim();
  if (!raw) return [];

  const candidates = [raw];

  // App event IDs are typically namespaced as "fb_<firestoreId>".
  // The backend detail endpoint may only resolve the raw Firestore id.
  if (raw.startsWith('fb_')) {
    const stripped = raw.slice(3);
    if (stripped) candidates.push(stripped);
  }

  return Array.from(new Set(candidates));
}

async function fetchEventPreviewById(id, options = {}) {
  const eventId = String(id || '').trim();
  const requestedType = options.requestedType === 'special' ? 'special' : 'event';
  const backendBaseUrl = String(options.backendBaseUrl || DEFAULT_BACKEND_BASE_URL).replace(/\/+$/, '');
  const cacheKey = `${requestedType}:${eventId}`;
  const ttlMs = Number(options.cacheTtlMs || process.env.PREVIEW_CACHE_TTL_MS || 5 * 60 * 1000);
  const missTtlMs = Number(options.missCacheTtlMs || process.env.PREVIEW_MISS_CACHE_TTL_MS || 60 * 1000);

  if (!eventId) {
    return toFetchResult({
      error: 'Missing event id',
      notFound: true,
    });
  }

  if (!options.skipCache) {
    const cached = previewCache.get(cacheKey);
    if (cached) {
      return { ...cached, source: 'cache' };
    }
  }

  const candidateIds = getBackendIdCandidates(eventId);

  try {
    let lastResponse = null;

    for (const backendId of candidateIds) {
      const url = `${backendBaseUrl}/api/v2/firestore/events/${encodeURIComponent(backendId)}`;
      const response = await fetchJson(url, { timeoutMs: options.timeoutMs });
      lastResponse = response;

      if (!response.ok) {
        // Retry alternate id formats only for not found responses.
        if (response.status === 404) continue;

        const result = toFetchResult({
          ok: false,
          status: response.status,
          notFound: false,
          error: response.rawText || `Backend request failed (${response.status})`,
          source: 'backend',
        });

        previewCache.set(cacheKey, result, missTtlMs);
        return result;
      }

      const item = response.json?.event
        || (Array.isArray(response.json?.events) ? response.json.events[0] : null)
        || null;

      if (!item) {
        continue;
      }

      const result = toFetchResult({
        ok: true,
        status: response.status,
        item,
        source: 'backend',
      });

      previewCache.set(cacheKey, result, ttlMs);
      return result;
    }

    const result = toFetchResult({
      ok: false,
      status: lastResponse?.status || 404,
      notFound: true,
      error: (lastResponse?.rawText || 'Event not found for any supported id format'),
      source: 'backend',
    });

    previewCache.set(cacheKey, result, missTtlMs);
    return result;
  } catch (error) {
    const result = toFetchResult({
      ok: false,
      error: error?.name === 'AbortError'
        ? 'Backend request timed out'
        : String(error?.message || error || 'Unknown backend fetch error'),
      source: 'backend',
    });

    previewCache.set(cacheKey, result, missTtlMs);
    return result;
  }
}

module.exports = {
  DEFAULT_BACKEND_BASE_URL,
  fetchEventPreviewById,
  previewCache,
};
