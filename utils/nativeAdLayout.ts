export type NativeAdMediaLayout = {
  kind: 'portrait' | 'landscape' | 'square' | 'unknown' | 'compact';
  split: boolean;
  mediaWidth: number;
  mediaHeight: number;
};

/** Size a loaded creative before display; never infer video orientation from its icon. */
export function getNativeAdMediaLayout({ cardWidth, aspectRatio, hasMediaContent, hasVideoContent,
  allowMedia = true, fontScale = 1 }: {
  cardWidth: number; aspectRatio?: number; hasMediaContent: boolean; hasVideoContent: boolean;
  allowMedia?: boolean; fontScale?: number;
}): NativeAdMediaLayout {
  const width = Number.isFinite(cardWidth) && cardWidth > 0 ? cardWidth : 374;
  const innerWidth = Math.max(1, width - 18); // Padding and border on both sides.
  const knownRatio = typeof aspectRatio === 'number' && Number.isFinite(aspectRatio) && aspectRatio > 0;
  if (!allowMedia || !hasMediaContent || (!knownRatio && !hasVideoContent)) {
    return { kind: 'compact', split: false, mediaWidth: 0, mediaHeight: 0 };
  }
  const kind = !knownRatio ? 'unknown' : aspectRatio < 0.9 ? 'portrait' : aspectRatio > 1.1 ? 'landscape' : 'square';
  const split = kind === 'portrait' && innerWidth >= 288 && fontScale <= 1.35;
  const ratio = knownRatio ? aspectRatio : 16 / 9;
  const minimum = Math.min(120, innerWidth);
  const mediaWidth = kind === 'portrait'
    // Reclaim the former full-width disclosure row without stretching the video.
    ? Math.min(innerWidth, Math.max(minimum, split ? Math.min(innerWidth * 0.47, 220) : Math.min(innerWidth, 420 * ratio)))
    : innerWidth;
  // Contain extreme creatives inside a bounded frame rather than stretching.
  // Ordinary 9:16/16:9 creatives fit exactly; unknown video ratios stay visible.
  const mediaHeight = Math.max(minimum, Math.min(420, mediaWidth / ratio));
  return { kind, split, mediaWidth, mediaHeight };
}
