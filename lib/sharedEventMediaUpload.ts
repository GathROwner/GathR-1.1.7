import { auth } from '../config/firebaseConfig';
import { FUNCTIONS_BASE_URL } from './sharedEventApi';

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
  const base64Data = await blobToBase64(blob);
  const token = await user.getIdToken();
  const uploadResponse = await fetch(`${FUNCTIONS_BASE_URL}/uploadSharedEventImage`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      fileName,
      contentType: file.mimeType || blob.type || `image/${extension}`,
      base64Data,
    }),
  });

  const result = await uploadResponse.json().catch(() => ({})) as { mediaUrl?: string; error?: string };
  if (!uploadResponse.ok || !result.mediaUrl) {
    throw new Error(result.error || `Shared image upload failed (${uploadResponse.status})`);
  }

  return result.mediaUrl;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read shared image.'));
    reader.onloadend = () => {
      const result = String(reader.result || '');
      resolve(result.replace(/^data:[^;]+;base64,/i, ''));
    };
    reader.readAsDataURL(blob);
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
