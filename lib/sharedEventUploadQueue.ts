import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { auth } from '../config/firebaseConfig';
import {
  FUNCTIONS_BASE_URL,
  SharedEventPayload,
  SharedEventSubmitResult,
  submitSharedEvent,
} from './sharedEventApi';
import { SharedIntentMediaFile } from './sharedEventMediaUpload';
import { trackPendingSharedEventIngest } from './sharedEventProcessingTracker';

const STORAGE_KEY = '@gathr/shared-event-upload-queue/v1';
const QUEUE_DIRECTORY = 'shared-event-uploads';
const MAX_SHARED_EVENT_UPLOADS = 6;
const MAX_SHARED_EVENT_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type SharedEventUploadJobStatus =
  | 'queued'
  | 'uploading'
  | 'submitting'
  | 'accepted'
  | 'retry_waiting';

export type SharedEventUploadFile = {
  localUri: string;
  fileName: string;
  mimeType: string;
  uploadId: string;
  mediaUrl?: string;
};

export type SharedEventUploadJob = {
  id: string;
  ownerUid: string;
  sourceLabel?: string;
  createdAt: number;
  updatedAt: number;
  status: SharedEventUploadJobStatus;
  payload: SharedEventPayload;
  files: SharedEventUploadFile[];
  attemptCount: number;
  nextAttemptAt?: number;
  error?: string;
  ingestId?: string;
  submitResult?: SharedEventSubmitResult;
};

type QueueSubscriber = (jobs: SharedEventUploadJob[]) => void;

const subscribers = new Set<QueueSubscriber>();
let mutationChain: Promise<void> = Promise.resolve();
let processingPromise: Promise<void> | null = null;

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function extensionForMimeType(value: string | undefined): string {
  const mime = String(value || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('heif')) return 'heif';
  return 'jpg';
}

function normalizedMimeType(value: string | undefined): string {
  const mime = String(value || '').trim().toLowerCase();
  if (mime === 'image/jpg') return 'image/jpeg';
  return mime.startsWith('image/') ? mime : 'image/jpeg';
}

function sanitizeFileName(value: string | undefined, fallback: string): string {
  const normalized = String(value || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeJobs(value: unknown): SharedEventUploadJob[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is SharedEventUploadJob => Boolean(
    entry &&
    typeof entry === 'object' &&
    typeof (entry as SharedEventUploadJob).id === 'string' &&
    typeof (entry as SharedEventUploadJob).ownerUid === 'string' &&
    Array.isArray((entry as SharedEventUploadJob).files)
  ));
}

async function readJobs(): Promise<SharedEventUploadJob[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return normalizeJobs(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

async function writeJobs(jobs: SharedEventUploadJob[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  subscribers.forEach((subscriber) => subscriber(jobs));
}

async function mutateJobs(
  update: (jobs: SharedEventUploadJob[]) => SharedEventUploadJob[] | Promise<SharedEventUploadJob[]>
): Promise<void> {
  const operation = mutationChain.then(async () => {
    const jobs = await readJobs();
    await writeJobs(await update(jobs));
  });
  mutationChain = operation.catch(() => undefined);
  await operation;
}

async function replaceJob(nextJob: SharedEventUploadJob): Promise<void> {
  await mutateJobs((jobs) => jobs.map((job) => job.id === nextJob.id ? nextJob : job));
}

async function currentJob(jobId: string): Promise<SharedEventUploadJob | undefined> {
  return (await readJobs()).find((job) => job.id === jobId);
}

async function copySharedFile(params: {
  file: SharedIntentMediaFile;
  index: number;
  jobDirectory: string;
  jobId: string;
}): Promise<SharedEventUploadFile> {
  const mimeType = normalizedMimeType(params.file.mimeType);
  const extension = extensionForMimeType(mimeType);
  const fileName = sanitizeFileName(params.file.fileName, `image-${params.index + 1}.${extension}`);
  const localUri = `${params.jobDirectory}${params.index}-${fileName}`;

  await FileSystem.copyAsync({ from: params.file.path, to: localUri });
  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) throw new Error('GathR could not secure the shared photo on this device.');
  if (typeof info.size === 'number' && info.size > MAX_SHARED_EVENT_UPLOAD_BYTES) {
    throw new Error('Shared photos must be smaller than 8 MB.');
  }

  return {
    localUri,
    fileName,
    mimeType,
    uploadId: `${params.jobId}_${params.index}`,
  };
}

export async function enqueueSharedEventUpload(params: {
  ownerUid: string;
  payload: SharedEventPayload;
  files: SharedIntentMediaFile[];
  sourceLabel?: string;
}): Promise<SharedEventUploadJob> {
  if (!FileSystem.documentDirectory) {
    throw new Error('GathR could not access durable device storage.');
  }

  const normalizedFiles = params.files
    .map((file) => ({ ...file, path: String(file.path || '').trim() }))
    .filter((file) => file.path)
    .slice(0, MAX_SHARED_EVENT_UPLOADS);
  const remoteUrls = normalizedFiles.filter((file) => isRemoteUrl(file.path)).map((file) => file.path);
  const localFiles = normalizedFiles.filter((file) => !isRemoteUrl(file.path));
  if (localFiles.length === 0) throw new Error('No local shared photos were available to upload.');

  const jobId = makeId('share');
  const jobDirectory = `${FileSystem.documentDirectory}${QUEUE_DIRECTORY}/${jobId}/`;
  await FileSystem.makeDirectoryAsync(jobDirectory, { intermediates: true });

  try {
    const files: SharedEventUploadFile[] = [];
    for (let index = 0; index < localFiles.length; index += 1) {
      files.push(await copySharedFile({
        file: localFiles[index],
        index,
        jobDirectory,
        jobId,
      }));
    }

    const now = Date.now();
    const job: SharedEventUploadJob = {
      id: jobId,
      ownerUid: params.ownerUid,
      sourceLabel: params.sourceLabel,
      createdAt: now,
      updatedAt: now,
      status: 'queued',
      payload: {
        ...params.payload,
        clientSubmissionId: jobId,
        mediaUrls: Array.from(new Set([
          ...(params.payload.mediaUrls || []),
          ...remoteUrls,
        ])).filter(Boolean),
      },
      files,
      attemptCount: 0,
    };
    await mutateJobs((jobs) => [
      ...jobs.filter((entry) => (
        entry.status !== 'accepted' || now - entry.updatedAt < ACCEPTED_RETENTION_MS
      )),
      job,
    ]);
    void processSharedEventUploadQueue();
    return job;
  } catch (error) {
    await FileSystem.deleteAsync(jobDirectory, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

async function uploadFile(job: SharedEventUploadJob, file: SharedEventUploadFile) {
  const user = auth.currentUser;
  if (!user || user.uid !== job.ownerUid) {
    throw new Error('Log in with the account that started this upload.');
  }
  const token = await user.getIdToken();
  const task = FileSystem.createUploadTask(
    `${FUNCTIONS_BASE_URL}/uploadSharedEventImage`,
    file.localUri,
    {
      httpMethod: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': file.mimeType,
        'x-gathr-upload-id': file.uploadId,
        'x-gathr-file-name': file.fileName,
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
    }
  );
  const response = await task.uploadAsync();
  if (!response) throw new Error('The background upload was cancelled.');
  const result = (() => {
    try {
      return JSON.parse(response.body || '{}') as { mediaUrl?: string; error?: string };
    } catch {
      return {} as { mediaUrl?: string; error?: string };
    }
  })();
  if (response.status < 200 || response.status >= 300 || !result.mediaUrl) {
    throw new Error(result.error || `Shared image upload failed (${response.status}).`);
  }
  return result.mediaUrl;
}

async function processJob(initialJob: SharedEventUploadJob): Promise<void> {
  let job = await currentJob(initialJob.id) || initialJob;
  try {
    job = {
      ...job,
      status: 'uploading',
      attemptCount: job.attemptCount + 1,
      updatedAt: Date.now(),
      error: undefined,
      nextAttemptAt: undefined,
    };
    await replaceJob(job);

    for (let index = 0; index < job.files.length; index += 1) {
      if (job.files[index].mediaUrl) continue;
      const mediaUrl = await uploadFile(job, job.files[index]);
      job = {
        ...job,
        files: job.files.map((file, fileIndex) => fileIndex === index ? { ...file, mediaUrl } : file),
        updatedAt: Date.now(),
      };
      await replaceJob(job);
    }

    job = { ...job, status: 'submitting', updatedAt: Date.now() };
    await replaceJob(job);
    const submitResult = await submitSharedEvent({
      ...job.payload,
      clientSubmissionId: job.id,
      mediaUrls: Array.from(new Set([
        ...(job.payload.mediaUrls || []),
        ...job.files.map((file) => file.mediaUrl).filter((url): url is string => Boolean(url)),
      ])),
    });
    if (submitResult.ingestId) {
      await trackPendingSharedEventIngest({
        ingestId: submitResult.ingestId,
        sourceLabel: job.sourceLabel,
      });
    }
    job = {
      ...job,
      status: 'accepted',
      ingestId: submitResult.ingestId,
      submitResult,
      updatedAt: Date.now(),
      error: undefined,
      nextAttemptAt: undefined,
    };
    await replaceJob(job);

    const directory = job.files[0]?.localUri.replace(/[^/]+$/, '');
    if (directory) {
      await FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => undefined);
    }
  } catch (error) {
    const latest = await currentJob(job.id) || job;
    const retryDelay = Math.min(5 * 60 * 1000, 15000 * Math.max(1, latest.attemptCount));
    await replaceJob({
      ...latest,
      status: 'retry_waiting',
      updatedAt: Date.now(),
      nextAttemptAt: Date.now() + retryDelay,
      error: error instanceof Error ? error.message : 'The upload was interrupted.',
    });
  }
}

export async function processSharedEventUploadQueue(): Promise<void> {
  if (processingPromise) return processingPromise;
  processingPromise = (async () => {
    const user = auth.currentUser;
    if (!user) return;
    const now = Date.now();
    const jobs = await readJobs();
    for (const job of jobs) {
      if (job.ownerUid !== user.uid || job.status === 'accepted') continue;
      if (job.status === 'retry_waiting' && (job.nextAttemptAt || 0) > now) continue;
      await processJob(job);
    }
  })().finally(() => {
    processingPromise = null;
  });
  return processingPromise;
}

export async function retrySharedEventUpload(jobId: string): Promise<void> {
  const job = await currentJob(jobId);
  if (!job || job.status === 'accepted') return;
  await replaceJob({
    ...job,
    status: 'queued',
    updatedAt: Date.now(),
    nextAttemptAt: undefined,
    error: undefined,
  });
  await processSharedEventUploadQueue();
}

export async function listSharedEventUploadJobs(): Promise<SharedEventUploadJob[]> {
  return readJobs();
}

export function subscribeSharedEventUploadJobs(subscriber: QueueSubscriber): () => void {
  subscribers.add(subscriber);
  void readJobs().then(subscriber);
  return () => subscribers.delete(subscriber);
}
