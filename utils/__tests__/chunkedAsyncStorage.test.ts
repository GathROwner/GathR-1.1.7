jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  createChunkedAsyncStorage,
  type AsyncStringStorage,
} from '../chunkedAsyncStorage';

function createMemoryStorage() {
  const values = new Map<string, string>();
  const storage: AsyncStringStorage = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
    async multiGet(keys) {
      return keys.map((key) => [key, values.get(key) ?? null] as const);
    },
    async multiSet(entries) {
      entries.forEach(([key, value]) => values.set(key, value));
    },
    async multiRemove(keys) {
      keys.forEach((key) => values.delete(key));
    },
  };

  return { storage, values };
}

describe('chunkedAsyncStorage', () => {
  it('round-trips a value across bounded storage rows', async () => {
    const backing = createMemoryStorage();
    const chunkSize = 8;
    const storage = createChunkedAsyncStorage(backing.storage, chunkSize);
    const snapshot = JSON.stringify({ text: 'A🙂BCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(5) });

    await storage.setItem('query-cache', snapshot);

    expect(await storage.getItem('query-cache')).toBe(snapshot);
    const manifest = JSON.parse(backing.values.get('query-cache') || '{}');
    const chunks = await backing.storage.multiGet(
      Array.from({ length: manifest.chunkCount }, (_, index) =>
        `query-cache:chunk:${manifest.generation}:${index}`
      )
    );
    expect(chunks.every(([, value]) => typeof value === 'string' && value.length <= chunkSize)).toBe(true);
  });

  it('returns no snapshot when a manifest references a missing chunk', async () => {
    const backing = createMemoryStorage();
    const storage = createChunkedAsyncStorage(backing.storage, 8);

    await storage.setItem('query-cache', 'a sufficiently long query snapshot');
    const manifest = JSON.parse(backing.values.get('query-cache') || '{}');
    await backing.storage.removeItem(`query-cache:chunk:${manifest.generation}:1`);

    expect(await storage.getItem('query-cache')).toBeNull();
  });

  it('switches to the new snapshot before cleaning up old chunks', async () => {
    const backing = createMemoryStorage();
    const storage = createChunkedAsyncStorage(backing.storage, 8);

    await storage.setItem('query-cache', 'first snapshot large enough to split');
    const oldManifest = JSON.parse(backing.values.get('query-cache') || '{}');
    await storage.setItem('query-cache', 'second snapshot also large enough to split');
    const newManifest = JSON.parse(backing.values.get('query-cache') || '{}');

    expect(newManifest.generation).not.toBe(oldManifest.generation);
    expect(await backing.storage.getItem(`query-cache:chunk:${oldManifest.generation}:0`)).toBeNull();
    expect(await storage.getItem('query-cache')).toBe('second snapshot also large enough to split');
  });

  it('keeps the previous snapshot readable when writing a new one fails', async () => {
    const backing = createMemoryStorage();
    const storage = createChunkedAsyncStorage(backing.storage, 8);
    await storage.setItem('query-cache', 'previous complete snapshot');

    const failingBacking: AsyncStringStorage = {
      ...backing.storage,
      async multiSet() {
        throw new Error('simulated storage write failure');
      },
    };
    const failingStorage = createChunkedAsyncStorage(failingBacking, 8);

    await expect(failingStorage.setItem('query-cache', 'next snapshot that has several chunks'))
      .rejects.toThrow('simulated storage write failure');
    expect(await storage.getItem('query-cache')).toBe('previous complete snapshot');
  });

  it('removes the manifest and its referenced chunks', async () => {
    const backing = createMemoryStorage();
    const storage = createChunkedAsyncStorage(backing.storage, 8);

    await storage.setItem('query-cache', 'snapshot that is split into chunks');
    const manifest = JSON.parse(backing.values.get('query-cache') || '{}');
    await storage.removeItem('query-cache');

    expect(await backing.storage.getItem('query-cache')).toBeNull();
    expect(await backing.storage.getItem(`query-cache:chunk:${manifest.generation}:0`)).toBeNull();
  });
});
