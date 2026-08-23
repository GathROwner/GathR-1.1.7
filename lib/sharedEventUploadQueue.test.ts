const mockStorage = new Map<string, string>();
const mockUploadAsync = jest.fn();
const mockPrepareSharedEventUpload = jest.fn();
const mockGetSharedEventIngestResult = jest.fn();
const mockTrackPendingSharedEventIngest = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStorage.set(key, value);
  }),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  FileSystemSessionType: { BACKGROUND: 0 },
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  getInfoAsync: jest.fn(async () => ({ exists: true, isDirectory: false, size: 1024 })),
  deleteAsync: jest.fn(async () => undefined),
  createUploadTask: jest.fn(() => ({ uploadAsync: mockUploadAsync })),
}));

jest.mock('../config/firebaseConfig', () => ({
  auth: {
    currentUser: {
      uid: 'user-1',
      getIdToken: jest.fn(async () => 'token-1'),
    },
  },
}));

jest.mock('./sharedEventApi', () => ({
  FUNCTIONS_BASE_URL: 'https://example.test',
  prepareSharedEventUpload: (...args: unknown[]) => mockPrepareSharedEventUpload(...args),
  getSharedEventIngestResult: (...args: unknown[]) => mockGetSharedEventIngestResult(...args),
}));

jest.mock('./sharedEventProcessingTracker', () => ({
  trackPendingSharedEventIngest: (...args: unknown[]) => mockTrackPendingSharedEventIngest(...args),
}));

import * as FileSystem from 'expo-file-system/legacy';
import {
  enqueueSharedEventUpload,
  listSharedEventUploadJobs,
  processSharedEventUploadQueue,
  reconcileSharedEventUploadQueueFromServer,
} from './sharedEventUploadQueue';

describe('durable shared event upload queue', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
    mockUploadAsync.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ mediaUrl: 'https://storage.test/poster.jpg' }),
      headers: {},
      mimeType: 'application/json',
    });
    mockPrepareSharedEventUpload.mockResolvedValue({
      success: true,
      ingestId: 'ingest-1',
      processingStatus: 'awaiting_upload',
    });
    mockGetSharedEventIngestResult.mockResolvedValue({
      success: true,
      ingestId: 'ingest-1',
      processingStatus: 'queued',
    });
  });

  test('copies the image into durable app storage before queueing it', async () => {
    const job = await enqueueSharedEventUpload({
      ownerUid: 'user-1',
      payload: { title: 'Background upload test' },
      files: [{ path: 'content://media/poster', mimeType: 'image/jpeg', fileName: 'poster.jpg' }],
      sourceLabel: 'Event Photo',
    });

    expect(FileSystem.copyAsync).toHaveBeenCalledWith(expect.objectContaining({
      from: 'content://media/poster',
      to: expect.stringContaining('/shared-event-uploads/'),
    }));
    expect(job.status).toBe('queued');
    expect(job.payload.clientSubmissionId).toBe(job.id);
    await processSharedEventUploadQueue();
  });

  test('prepares the server handoff before starting a background binary upload', async () => {
    const job = await enqueueSharedEventUpload({
      ownerUid: 'user-1',
      payload: { title: 'Background upload test' },
      files: [{ path: 'content://media/poster', mimeType: 'image/jpeg', fileName: 'poster.jpg' }],
    });
    await processSharedEventUploadQueue();

    expect(FileSystem.createUploadTask).toHaveBeenCalledWith(
      'https://example.test/uploadSharedEventImage',
      expect.stringContaining('poster.jpg'),
      expect.objectContaining({
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
        headers: expect.objectContaining({
          'x-gathr-ingest-id': 'ingest-1',
          'x-gathr-upload-id': expect.stringContaining(job.id),
        }),
      })
    );
    expect(mockPrepareSharedEventUpload).toHaveBeenCalledTimes(1);
    expect(mockPrepareSharedEventUpload).toHaveBeenCalledWith({
      payload: expect.objectContaining({ clientSubmissionId: job.id }),
      expectedUploadIds: [expect.stringContaining(job.id)],
    });
    expect(mockTrackPendingSharedEventIngest).toHaveBeenCalledWith({
      ingestId: 'ingest-1',
      sourceLabel: undefined,
    });
    expect((await listSharedEventUploadJobs())[0]).toEqual(expect.objectContaining({
      status: 'accepted',
      ingestId: 'ingest-1',
    }));
  });

  test('reconciles a server-owned upload without waiting for the native upload promise', async () => {
    mockUploadAsync.mockImplementation(() => new Promise(() => undefined));
    const job = await enqueueSharedEventUpload({
      ownerUid: 'user-1',
      payload: { title: 'Stalled callback recovery' },
      files: [{ path: 'content://media/poster', mimeType: 'image/jpeg', fileName: 'poster.jpg' }],
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = (await listSharedEventUploadJobs())[0];
      if (current?.ingestId) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect((await listSharedEventUploadJobs())[0]).toEqual(expect.objectContaining({
      ingestId: 'ingest-1',
      status: 'uploading',
    }));

    await reconcileSharedEventUploadQueueFromServer();
    expect((await listSharedEventUploadJobs())[0]).toEqual(expect.objectContaining({
      id: job.id,
      ingestId: 'ingest-1',
      status: 'accepted',
    }));
  });
});
