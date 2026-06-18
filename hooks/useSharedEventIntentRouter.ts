import { useEffect, useRef, useState } from 'react';
import { useLinkingURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import { ShareIntent, useShareIntentContext } from 'expo-share-intent';

const SHARE_ROUTE_HOLD_MS = 2000;
const SHARE_RESET_DELAY_MS = 500;
const MAX_SHARED_IMAGE_FILES = 6;

function extractUrl(value: string): string {
  const match = value.match(/https?:\/\/[^\s<>"')]+/i);
  return match?.[0]?.replace(/[.,;:!?]+$/, '') || '';
}

function buildSignature(shareIntent: ShareIntent, launchUrl: string | null): string {
  return [
    launchUrl || '',
    shareIntent.type || '',
    shareIntent.webUrl || '',
    shareIntent.text || '',
    shareIntent.meta?.title || '',
    shareIntent.files?.map((file) => file.path).join('|') || '',
  ].join('::');
}

function imageFiles(shareIntent: ShareIntent): { path: string; mimeType?: string; fileName?: string }[] {
  return (shareIntent.files || [])
    .filter((file) => file.path && file.mimeType?.startsWith('image/'))
    .slice(0, MAX_SHARED_IMAGE_FILES)
    .map((file) => ({
      path: file.path,
      mimeType: file.mimeType,
      fileName: file.fileName,
    }));
}

function isShareIntentLaunchUrl(value: string | null): boolean {
  return Boolean(value?.includes('://dataUrl='));
}

export function useSharedEventIntentRouter(): { isRoutingShareIntent: boolean } {
  const router = useRouter();
  const launchUrl = useLinkingURL();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [isRouteHandoffActive, setIsRouteHandoffActive] = useState(false);
  const lastSignatureRef = useRef('');
  const routedLaunchUrlRef = useRef('');
  const routeHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPendingShareLaunch = isShareIntentLaunchUrl(launchUrl) && routedLaunchUrlRef.current !== launchUrl;

  useEffect(() => {
    if (!hasShareIntent) return;

    const signature = buildSignature(shareIntent, launchUrl);
    if (!signature || signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;

    const sharedText = shareIntent.text || shareIntent.webUrl || '';
    const sourceUrl = shareIntent.webUrl || extractUrl(sharedText);
    const title = shareIntent.meta?.title || '';
    const images = imageFiles(shareIntent);

    routedLaunchUrlRef.current = launchUrl || signature;
    setIsRouteHandoffActive(true);

    if (routeHoldTimeoutRef.current) {
      clearTimeout(routeHoldTimeoutRef.current);
    }
    routeHoldTimeoutRef.current = setTimeout(() => {
      setIsRouteHandoffActive(false);
      routeHoldTimeoutRef.current = null;
    }, SHARE_ROUTE_HOLD_MS);

    router.replace({
      pathname: '/shared-event',
      params: {
        sourceUrl,
        sharedText,
        title,
        sourceApp: 'native_share_sheet',
        mediaUrl: images[0]?.path || '',
        mediaFiles: JSON.stringify(images),
      },
    });

    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = setTimeout(() => {
      resetShareIntent();
      resetTimeoutRef.current = null;
    }, SHARE_RESET_DELAY_MS);
  }, [hasShareIntent, launchUrl, resetShareIntent, router, shareIntent]);

  useEffect(() => () => {
    if (routeHoldTimeoutRef.current) {
      clearTimeout(routeHoldTimeoutRef.current);
    }
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
  }, []);

  return {
    isRoutingShareIntent: hasShareIntent || isPendingShareLaunch || isRouteHandoffActive,
  };
}
