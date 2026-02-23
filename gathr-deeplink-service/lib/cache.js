function createTtlCache(options = {}) {
  const name = options.name || 'cache';
  const maxEntries = Number(options.maxEntries || 500);
  const defaultTtlMs = Number(options.defaultTtlMs || 5 * 60 * 1000);
  const store = new Map();

  function now() {
    return Date.now();
  }

  function pruneExpired() {
    const ts = now();
    for (const [key, entry] of store.entries()) {
      if (!entry || entry.expiresAt <= ts) {
        store.delete(key);
      }
    }
  }

  function enforceMaxEntries() {
    if (store.size <= maxEntries) return;
    const keysToDelete = store.size - maxEntries;
    let i = 0;
    for (const key of store.keys()) {
      store.delete(key);
      i += 1;
      if (i >= keysToDelete) break;
    }
  }

  return {
    name,
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },

    set(key, value, ttlMs = defaultTtlMs) {
      store.set(key, {
        value,
        expiresAt: now() + Math.max(1000, Number(ttlMs || defaultTtlMs)),
      });
      pruneExpired();
      enforceMaxEntries();
      return value;
    },

    delete(key) {
      return store.delete(key);
    },

    clear() {
      store.clear();
    },

    stats() {
      pruneExpired();
      return {
        name,
        size: store.size,
        maxEntries,
        defaultTtlMs,
      };
    },
  };
}

module.exports = {
  createTtlCache,
};
