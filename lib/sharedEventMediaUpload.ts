import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from '../config/firebaseConfig';

export type SharedIntentMediaFile = {
  path: string;
  mimeType?: string;
  fileName?: string;
};

const MAX_SHARED_EVENT_UPLOADS = 6;

function sanitizeFileName(value: string | undefined, fallback: string): string {
  const normalized = String(value || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

function extensionForMimeType(value: string | undefined): string {
  const mime = String(value || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic')) return 'heic';
  return 'jpg';
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function uploadSharedEventImage(file: SharedIntentMediaFile, index: number): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Log in to upload shared event images.');
  }

  const response = await fetch(file.path);
  const blob = await response.blob();
  const extension = extensionForMimeType(file.mimeType || blob.type);
  const fallbackName = `image-${index + 1}.${extension}`;
  const fileName = sanitizeFileName(file.fileName, fallbackName);
  const uploadPath = `sharedEventUploads/${user.uid}/${Date.now()}-${index + 1}-${fileName}`;
  const uploadRef = ref(storage, uploadPath);
  const uploadTask = uploadBytesResumable(uploadRef, blob, {
    contentType: file.mimeType || blob.type || `image/${extension}`,
    customMetadata: {
      source: 'ios_share_extension',
    },
  });

  return new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      undefined,
      reject,
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(downloadUrl);
      }
    );
  });
}

export async function resolveSharedEventMediaUrls(files: SharedIntentMediaFile[]): Promise<string[]> {
  const normalized = files
    .map((file) => ({
      ...file,
      path: String(file.path || '').trim(),
    }))
    .filter((file) => file.path.length > 0)
    .slice(0, MAX_SHARED_EVENT_UPLOADS);

  const remoteUrls = normalized
    .filter((file) => isRemoteUrl(file.path))
    .map((file) => file.path);

  const localFiles = normalized.filter((file) => !isRemoteUrl(file.path));
  const uploadedUrls = await Promise.all(localFiles.map(uploadSharedEventImage));

  return [...remoteUrls, ...uploadedUrls].filter(Boolean);
}
