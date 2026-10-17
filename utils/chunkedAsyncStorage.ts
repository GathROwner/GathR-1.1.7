import AsyncStorage from '@react-native-async-storage/async-storage';

export type AsyncStringStorage = Pick<
  typeof AsyncStorage,
  'getItem' | 'setItem' | 'removeItem' | 'multiGet' | 'multiSet' | 'multiRemove'
>;

type ChunkManifest = {
  version: 1;
  generation: string;
  chunkCount: number;
  serializedLength: number;
};

const DEFAULT_CHUNK_SIZE = 128 * 1024;
const CHUNKS_PER_WRITE_BATCH = 8;

function parseManifest(value: string | null): ChunkManifest | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<ChunkManifest>;
    if (
      parsed.version !== 1
      || typeof parsed.generation !== 'string'
      || !parsed.generation
      || !Number.isSafeInteger(parsed.chunkCount)
      || (parsed.chunkCount ?? 0) < 1
      || !Number.isSafeInteger(parsed.serializedLength)
      || (parsed.serializedLength ?? -1) < 0
    ) return null;

    return parsed as ChunkManifest;
  } catch {
    return null;
  }
}

function chunkKey(key: string, generation: string, index: number) {
  return `${key}:chunk:${generation}:${index}`;
}

function batches<T>(values: T[], batchSize: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += batchSize) {
    result.push(values.slice(index, index + batchSize));
  }
  return result;
}

/**
 * Split large persisted query snapshots across small AsyncStorage rows.
 * Android's SQLite-backed AsyncStorage can fail to read one oversized row
 * with `Row too big to fit into CursorWindow`, which discards the whole cache.
 */
export function createChunkedAsyncStorage(
  storage: AsyncStringStorage,
  chunkSize = DEFAULT_CHUNK_SIZE
) {
  const writeQueues = new Map<string, Promise<void>>();

  const serializeByKey = async (key: string, operation: () => Promise<void>) => {
    const previous = writeQueues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    writeQueues.set(key, current);
    try {
      await current;
    } finally {
      if (writeQueues.get(key) === current) writeQueues.delete(key);
    }
  };

  const removeChunks = async (key: string, manifest: ChunkManifest) => {
    const keys = Array.from({ length: manifest.chunkCount }, (_, index) =>
      chunkKey(key, manifest.generation, index)
    );
    for (const keyBatch of batches(keys, CHUNKS_PER_WRITE_BATCH)) {
      await storage.multiRemove(keyBatch);
    }
  };

  return {
    async getItem(key: string): Promise<string | null> {
      const manifest = parseManifest(await storage.getItem(key));
      if (!manifest) return null;

      const keys = Array.from({ length: manifest.chunkCount }, (_, index) =>
        chunkKey(key, manifest.generation, index)
      );
      const values = new Map(await storage.multiGet(keys));
      const chunks: string[] = [];
      for (const chunkName of keys) {
        const value = values.get(chunkName);
        if (typeof value !== 'string') return null;
        chunks.push(value);
      }

      const serialized = chunks.join('');
      return serialized.length === manifest.serializedLength ? serialized : null;
    },

    async setItem(key: string, value: string): Promise<void> {
      await serializeByKey(key, async () => {
        const previousManifest = parseManifest(await storage.getItem(key));
        const generation = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const chunkCount = Math.max(1, Math.ceil(value.length / chunkSize));
        const entries: [string, string][] = Array.from({ length: chunkCount }, (_, index) => [
          chunkKey(key, generation, index),
          value.slice(index * chunkSize, (index + 1) * chunkSize),
        ] as [string, string]);

        for (const entryBatch of batches(entries, CHUNKS_PER_WRITE_BATCH)) {
          await storage.multiSet(entryBatch);
        }

        const nextManifest: ChunkManifest = {
          version: 1,
          generation,
          chunkCount,
          serializedLength: value.length,
        };
        // Switch readers only after every chunk is safely written.
        await storage.setItem(key, JSON.stringify(nextManifest));

        if (previousManifest && previousManifest.generation !== generation) {
          // The new snapshot is already committed; stale chunk cleanup is best effort.
          try {
            await removeChunks(key, previousManifest);
          } catch {
            // Orphaned old chunks are harmless and are not read by the manifest.
          }
        }
      });
    },

    async removeItem(key: string): Promise<void> {
      await serializeByKey(key, async () => {
        const manifest = parseManifest(await storage.getItem(key));
        // Remove the pointer first so a crash cannot leave readers on partial data.
        await storage.removeItem(key);
        if (manifest) await removeChunks(key, manifest);
      });
    },
  };
}

export const chunkedQueryStorage = createChunkedAsyncStorage(AsyncStorage);
