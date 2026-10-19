# Native Ad Components

This directory contains the native ad display components for GathR.

## Components

- **FullSizeSdkAdCard.tsx** - Adaptive Events/Specials feed card: portrait B split layout, landscape H2 media-first layout, square/media-free fallbacks. Loaded rows size to their content.
- **NativeAdComponent.tsx** - Other native ad card surfaces (200px media height)
- **CompactNativeAdComponent.tsx** - Compact native ad card for callouts (200px media height)

## Architecture Overview

### Centralized Ad Pool (`store/adPoolStore.ts`)

All ad loading is managed through a centralized Zustand store that provides:

- **Separate surface pools** - Events and Specials use different ad unit IDs and pools
- **Small bounded pools** - Four ads are loaded by default; Android can match a larger focused surface request
- **Rate limiting** - 30-second cooldown between load attempts to avoid AdMob throttling
- **Instance ownership** - Every rendered placement owns a distinct `NativeAd` object, even when AdMob returns identical creative text
- **Focused loading** - Ads load only after a screen or callout actually requests them

### Hook: `useNativeAds(count, tabType, startIndex)`

The `useNativeAds` hook is a thin wrapper around the ad pool store:

```typescript
const nativeAds = useNativeAds(
  5,           // count - number of ads needed
  'events',    // tabType - 'events' or 'specials'
  venueIndex   // startIndex - offset into pool for ad variety
);
```

**Key features:**
- `startIndex` parameter allows different venue tabs in callouts to show different ads
- Returns `NativeAdData[]` with `{ ad: NativeAd | null, loading: boolean }`
- Automatically triggers pool refresh if stale (>5 minutes)

### Ad Insertion in Lists

Both `events.tsx` and `specials.tsx` insert ads every 4 items in their FlatLists:

```typescript
// Viewport section
sortedViewportEvents.forEach((event, index) => {
  result.push({ type: 'event', data: event });
  if ((index + 1) % adFrequency === 0 && nativeAds.length > 0) {
    // Insert ad
  }
});

// Outside-viewport section (IMPORTANT: must also insert ads)
outsideViewportToShow.forEach((event, index) => {
  result.push({ type: 'event', data: event });
  if ((index + 1) % adFrequency === 0 && nativeAds.length > 0) {
    // Insert the next distinct loaded NativeAd instance
  }
});
```

**Critical:** Ads must be inserted in BOTH viewport and outside-viewport sections, otherwise ads stop appearing when users scroll past the divider.

If fewer ad instances are loaded than placements, leave later placements empty. Never cycle the same `NativeAd` object into several `NativeAdView`s. AdMob can return visually identical creatives as separate objects; those objects are valid separate placements and must not be collapsed by headline/body text.

## Critical Implementation Details

### Video Ad Media Display Fix

The `NativeMediaView` from `react-native-google-mobile-ads` has a known issue with video ads that return `aspectRatio: 0` (common with VAST redirect video ads).

**The Problem:**
The library internally applies this style to `NativeMediaView`:
```typescript
style={[{ aspectRatio: mediaContent?.aspectRatio }, style]}
```

When `aspectRatio` is `0`, the view collapses to zero height and becomes invisible.

**The Solution:**
Always override the aspect ratio when rendering `NativeMediaView`:

```tsx
<NativeMediaView
  style={[styles.mediaView, { aspectRatio: undefined }]}
  resizeMode="cover"
/>
```

The `{ aspectRatio: undefined }` override removes the library's default aspect ratio, allowing our explicitly sized container to control the media dimensions instead. Preserve this override in adaptive layouts too.

### Adaptive feed layouts (October 18, 2026)

`FullSizeSdkAdCard` reads the loaded SDK `mediaContent.aspectRatio` before rendering media. `utils/nativeAdLayout.ts` selects portrait below 0.9, landscape above 1.1, and square between. Portrait normally uses a 43%-width media column beside the supplied icon, title, body and CTA (B); landscape uses full-width media followed by identity/CTA and body (H2). Square uses the same stacked structure. Missing/invalid ratios with video use a visible 16:9 fallback; missing media uses a compact text/icon card. No creative inference from the icon or playback resize is used.

Feed ad wrappers have no fixed row height. The media frame has explicit dimensions, capped at 420 points high and at least 120 points in each dimension on supported screens. Narrow screens and large font scales use stacked portrait content. Width changes are measured by the card without replacing its SDK ad instance. Ordinary known ratios retain their proportions; extreme ratios are bounded and contained. Padding baked into a creative or unknown video proportions can still leave space.

Keep one SDK ad view/media view and one registration of each supplied asset per placement. Keep Sponsored attribution and the SDK-owned AdChoices corner clear. Do not modify pool loading, ownership or list ranking to achieve presentation changes. `resizeMode="contain"` preserves image content; video fitting/controls remain SDK-owned. Other callout/compact ad components are unchanged.

Rendered layout fixtures and limitations: [QA record](../../docs/qa/ad-layout-20261018/README.md).

### Media Rendering Logic

Use this condition to determine when to show `NativeMediaView` vs fallback:

```tsx
{nativeAd.mediaContent && (nativeAd.mediaContent.aspectRatio > 0 || nativeAd.mediaContent.hasVideoContent) ? (
  <NativeMediaView
    style={[styles.mediaView, { aspectRatio: undefined }]}
    resizeMode="cover"
  />
) : (
  // Fallback content (icon or headline initial)
)}
```

**Why this works:**
- Image ads have `aspectRatio > 0` - renders normally
- Video ads may have `aspectRatio: 0` but `hasVideoContent: true` - still renders with our fix
- Ads with no media content fall back to icon or text

### Container Requirements

The media container MUST have explicit dimensions:

```typescript
mediaContainer: {
  width: '100%',
  height: 200, // or 200 for full-size
  // ... other styles
}

mediaView: {
  width: '100%',
  height: '100%',
}
```

Google's minimum size requirement for `NativeMediaView` is 120x120 points. Our containers exceed this.

## Theme Support

Both components use the `AdTheme` constants from `@/constants/AdTheme.ts` for:
- Light/dark mode color schemes
- Consistent spacing scale
- Border radius values
- Animation timing

## SKAdNetwork Configuration

The SKAdNetwork identifiers in `app.config.js` have been optimized to ~25 essential identifiers (Google's primary + DSP partners). This is sufficient for AdMob-only implementations without mediation.

## Configuration Constants (`store/adPoolStore.ts`)

| Constant | Value | Description |
|----------|-------|-------------|
| `MIN_LOAD_INTERVAL_MS` | 30000 | 30 seconds between load attempts |
| `DEFAULT_POOL_SIZE` | 4 | Maximum visible slots on the focused surface |
| `INITIAL_FAST_LOAD` | 2 | First batch when explicit preloading is requested |
| `MAX_ATTEMPTS` | 8 | Max API calls per load cycle |
| `STALE_AGE_MS` | 300000 | 5 minutes before refresh |

## Loading

`useNativeAds` requests a small pool only after its Events, Specials, or callout
surface is focused. The app does not mount hidden ad views or eagerly request
both content types during startup. Loaded instances are leased to one owner and
destroyed when no longer referenced.

## Troubleshooting

### Ads stop appearing when scrolling
Check that both viewport AND outside-viewport sections in `events.tsx`/`specials.tsx` have ad insertion logic.

### Same ad showing across venue tabs
Ensure `startIndex` (venueIndex) is passed to `useNativeAds` in `EventCallout.tsx`.

### Later feed ads show a static fallback of the first ad
Verify the pool kept separate `NativeAd` instances even if their creative fields match, and confirm the feed indexes instances without modulo cycling. Each placement should render media from its own SDK object.

### Ads take too long to appear
Confirm the focused surface requested its pool and that the SDK returned at
least one ad. Development builds use Google's sample native ad unit.

### iOS Fabric spacing follow-up (October 19)

Keep padding/border decoration on the ordinary outer card View, not NativeAdView. Fabric's SDK contentView inset can otherwise shift children twice and clip right/bottom edges. NativeAdView itself remains inset-free, full width, with all registered assets inside. The outer measurement still includes the card border/padding for getNativeAdMediaLayout. See [native spacing diagnosis and rendered comparison](../../docs/qa/ad-spacing-20261019/README.md). Video metadata is a load-time SDK snapshot; no inner-content-bound detection or orientation update event is exposed here. Preserve the reported ratio/unknown fallback rather than cropping or guessing by advertiser.

### Portrait disclosure relocation (October 19)

Split portrait cards now place Sponsored above the right-hand details, freeing the full-width top row for video. Media width is 47% (previously 43%), preserving the SDK ratio while adding about 25 points of height for a standard 374-point card / 9:16 creative. The details column reserves top clearance and AdChoices keeps its top-right corner. Stacked/landscape fallbacks retain their disclosure row. See [rendered comparison and scope](../../docs/qa/ad-disclosure-20261019/README.md). Callout components remain separate and await parity work.

### Callout formatting parity (October 19)

Normal callout SDK ads now use CompactSdkAdCard only for the iOS two-frame + 60ms mount safeguard, then render the exact FullSizeSdkAdCard shared with the lists. Readiness belongs to the current NativeAd object; replacements and unmount cancel pending attachment. The shared loading skeleton measures width before attachment without a hidden SDK view. Portrait B, landscape H2, corrected spacing and right-column Sponsored now stay in sync. EventCallout and its explicitly non-SDK emergency fallback remain unchanged. [Callout parity QA and limits](../../docs/qa/callout-ad-parity-20261019/README.md).
