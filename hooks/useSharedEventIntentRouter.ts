import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { ShareIntent, useShareIntentContext } from 'expo-share-intent';

function extractUrl(value: string): string {
  const match = value.match(/https?:\/\/[^\s<>"')]+/i);
  return match?.[0]?.replace(/[.,;:!?]+$/, '') || '';
}

function buildSignature(shareIntent: ShareIntent): string {
  return [
    shareIntent.type || '',
    shareIntent.webUrl || '',
    shareIntent.text || '',
    shareIntent.meta?.title || '',
    shareIntent.files?.map((file) => file.path).join('|') || '',
  ].join('::');
}

function firstImagePath(shareIntent: ShareIntent): string | undefined {
  return shareIntent.files?.find((file) => file.mimeType?.startsWith('image/'))?.path || undefined;
}

export function useSharedEventIntentRouter() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const lastSignatureRef = useRef('');

  useEffect(() => {
    if (!hasShareIntent) return;

    const signature = buildSignature(shareIntent);
    if (!signature || signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;

    const sharedText = shareIntent.text || shareIntent.webUrl || '';
    const sourceUrl = shareIntent.webUrl || extractUrl(sharedText);
    const title = shareIntent.meta?.title || '';
    const imagePath = firstImagePath(shareIntent);

    router.replace({
      pathname: '/shared-event',
      params: {
        sourceUrl,
        sharedText,
        title,
        sourceApp: 'native_share_sheet',
        mediaUrl: imagePath || '',
      },
    });

    resetShareIntent();
  }, [hasShareIntent, resetShareIntent, router, shareIntent]);
}
