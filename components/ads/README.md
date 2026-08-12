# Native Ad Components

This directory contains the native ad display components for GathR.

## Components

- **NativeAdComponent.tsx** - Full-size native ad card (200px media height)
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

The `{ aspectRatio: undefined }` override removes the library's default aspect ratio, allowing our fixed-height container to control the media dimensions instead.

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
| `DEFAULT_POOL_SIZE` | 8 | Four list placements plus four callout placements |
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
