# Deep Linking Implementation Guide

**Last Updated:** 2026-02-22
**Status:** ✅ App-side implementation complete | 🔄 Web server configuration pending

---

## Overview

GathR implements deep linking to allow shared event links to open directly in the app. When users share an event, recipients can click the link and:
- **If app installed:** Opens directly to the event lightbox in GathR
- **If app NOT installed:** Redirects to App Store/Play Store (requires web server config)

---

## How It Works

### URL Structure

Events are shared using clean, path-based URLs:

```
https://link.gathrapp.ca/event/12345      (for events)
https://link.gathrapp.ca/special/67890    (for specials)
```

**Legacy format (also supported):**
```
https://link.gathrapp.ca?eventId=12345&type=event
```

### Custom Scheme

The app also responds to custom scheme URLs:
```
gathr://event/12345
gathr://special/67890
```

---

## Implementation Details

### 1. App Configuration (`app.config.js`)

**iOS - Universal Links:**
```javascript
ios: {
  associatedDomains: [
    "applinks:link.gathrapp.ca"
  ]
}
```

**Android - App Links:**
```javascript
android: {
  intentFilters: [
    {
      action: "VIEW",
      autoVerify: true,
      data: [
        { scheme: "https", host: "link.gathrapp.ca", pathPrefix: "/event" },
        { scheme: "https", host: "link.gathrapp.ca", pathPrefix: "/special" }
      ],
      category: ["BROWSABLE", "DEFAULT"]
    }
  ]
}
```

**Custom Scheme:**
```javascript
scheme: "gathr"
```

### 2. Deep Link Handler (`hooks/useDeepLinking.ts`)

**Purpose:** Central hook that handles all incoming deep links

**Key Functions:**
- `parseDeepLink(url)` - Parses URL to extract event ID and type
- `handleDeepLink(url)` - Main handler that:
  1. Parses the URL
  2. Navigates to map tab if needed
  3. Fetches event data (from cache or API)
  4. Opens lightbox via `setSelectedImageData()`
  5. Shows alert if event not found

**URL Parsing Logic:**
```typescript
// Handles path-based: /event/12345
// Handles query params: ?eventId=12345&type=event
// Handles custom scheme: gathr://event/12345
```

**Event ID Equivalence:**
The handler uses `areEventIdsEquivalent()` and `toAppEventId()` from the Firestore events API to handle different ID formats (Firestore IDs vs legacy numeric IDs).

**Integration Point:**
- Called in `app/_layout.tsx` inside `MainNavigator` component
- Listens for both cold start (app opened via link) and warm start (app already running)

### 3. Share URL Builder (`utils/shareUtils.ts`)

**Main Function:**
```typescript
export function buildGathrShareUrl(event: Event): string {
  const type = event.type === 'special' ? 'special' : 'event';
  const eventId = String(event.id ?? '');
  return `${GATHR_WEB_BASE_URL}/${type}/${eventId}`;
}
```

**Constants:**
```typescript
export const GATHR_WEB_BASE_URL = 'https://link.gathrapp.ca';
```

### 4. Share Integration Points

All share locations include the deep link URL:

| File | Share Location | Status |
|------|---------------|--------|
| `app/(tabs)/events.tsx` | Events list | ✅ Implemented |
| `app/(tabs)/specials.tsx` | Specials list | ✅ Implemented |
| `components/map/EventCallout.tsx` | Map callout | ✅ Implemented |
| `components/map/EventImageLightbox.tsx` | Lightbox | ✅ Implemented |

**Example Share Message:**
```
Check out Blues & Brews Festival at Harbor Park on Feb 25, 2026 at 7:00 PM.

Join us for live music, craft beer, and local food trucks!

See it on GathR: https://link.gathrapp.ca/event/12345
```

---

## Flow Diagrams

### User Shares Event
```
User taps Share → buildGathrShareUrl() creates URL →
Share dialog opens with message + URL →
Recipient receives link
```

### Recipient Opens Link (App Installed)
```
User taps link → iOS/Android recognizes Universal/App Link →
Opens GathR app → useDeepLinking hook intercepts →
parseDeepLink() extracts event ID →
Navigate to map tab → Fetch event data →
Open lightbox with event details
```

### Recipient Opens Link (App NOT Installed)
```
User taps link → Browser opens link.gathrapp.ca/event/123 →
Web page detects app not installed →
Shows App Store/Play Store buttons →
User downloads app →
Can open link again to view event
```

---

## Web Server Configuration

**Status:** 🔄 Pending implementation on link.gathrapp.ca

### Required Files

**1. Apple App Site Association**
**Location:** `/.well-known/apple-app-site-association` (no file extension)

```json
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "G2W34P3KQ7.com.craigb.gathr",
      "paths": ["/event/*", "/special/*"]
    }]
  }
}
```

**Requirements:**
- Must be served over HTTPS
- Content-Type: `application/json`
- No redirects
- Accessible at both `link.gathrapp.ca` and `www.link.gathrapp.ca`

**2. Android Asset Links**
**Location:** `/.well-known/assetlinks.json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.craigb.gathr",
    "sha256_cert_fingerprints": [
      "50:5D:7E:97:4C:FB:AF:4F:02:9C:91:53:65:AF:49:DA:43:49:C8:94:83:74:4D:F5:15:1D:57:EB:30:13:43:E7"
    ]
  }
}]
```

**3. Landing Page / Redirect Logic**

**Location:** `/event/:id` and `/special/:id`

The landing page should:
1. Detect user's platform (iOS/Android/Desktop)
2. Attempt to open the app using custom scheme: `gathr://event/123`
3. If app doesn't respond within 2-3 seconds, show download buttons
4. Track analytics for link clicks

**Sample HTML Structure:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>GathR Event</title>
  <meta name="apple-itunes-app" content="app-id=YOUR_APP_ID">
</head>
<body>
  <h1>Opening in GathR...</h1>
  <div id="app-store-buttons">
    <!-- Show after timeout if app doesn't open -->
  </div>
  <script>
    // Try to open app
    const eventId = window.location.pathname.split('/').pop();
    const deepLink = `gathr://event/${eventId}`;
    window.location.href = deepLink;

    // Fallback to store after 2.5s
    setTimeout(() => {
      // Show app store buttons
    }, 2500);
  </script>
</body>
</html>
```

---

## Credentials & Configuration

### Apple Team ID
**Value:** `G2W34P3KQ7`
**Source:** Apple Developer Portal → Membership

### Android SHA-256 Fingerprint
**Value:** `50:5D:7E:97:4C:FB:AF:4F:02:9C:91:53:65:AF:49:DA:43:49:C8:94:83:74:4D:F5:15:1D:57:EB:30:13:43:E7`
**Source:** Google Play Console → App Integrity → App signing key certificate

### Package Identifiers
- **iOS Bundle ID:** `com.craigb.gathr`
- **Android Package:** `com.craigb.gathr`

---

## Testing Deep Links

### Test Custom Scheme (Works Now)

**iOS Simulator:**
```bash
xcrun simctl openurl booted "gathr://event/12345"
```

**Android Emulator:**
```bash
adb shell am start -a android.intent.action.VIEW -d "gathr://event/12345"
```

### Test Universal/App Links (Requires Web Config)

**iOS Simulator:**
```bash
xcrun simctl openurl booted "https://link.gathrapp.ca/event/12345"
```

**Android Device:**
```bash
adb shell am start -a android.intent.action.VIEW -d "https://link.gathrapp.ca/event/12345"
```

**Verify Apple App Site Association:**
```bash
curl https://link.gathrapp.ca/.well-known/apple-app-site-association
```

**Verify Android Asset Links:**
```bash
curl https://link.gathrapp.ca/.well-known/assetlinks.json
```

---

## Updating the Deep Link Server (Operational Runbook)

Use this section when changing the deep link landing pages, preview metadata, or OG image generation.

### Live Production Target (Important)

- **Custom domain:** `link.gathrapp.ca`
- **Hosting type:** Cloud Run domain mapping (not Wix app code, not this app repo directly)
- **GCP project (live):** `gathr-backend`
- **Cloud Run service:** `gathr-deeplink`
- **Region:** `us-central1`

**Why this matters:** A previous update was deployed to the wrong project (`gathr-migrated`), which made the direct Cloud Run URL look correct while `link.gathrapp.ca` still served old code.

### Use the Correct Source Folder

Deploy from:

```powershell
C:\Windows\System32\GathR-Project\GathR\gathr-deeplink-service
```

Do **not** deploy from the older sibling copy unless you intentionally want the old server behavior:

```powershell
C:\Windows\System32\GathR-Project\gathr-deeplink-service
```

The older copy historically served generic OG tags (`View on GathR`) and did not include the `/og/...png` route.

### Pre-Deploy Checks

Run these first to confirm you are targeting the correct project and service:

```powershell
gcloud config set account craig@gathrapp.ca
gcloud config set project gathr-backend

gcloud run services list --region us-central1
gcloud beta run domain-mappings describe --domain=link.gathrapp.ca --region us-central1
```

You should see:
- service `gathr-deeplink`
- domain mapping `link.gathrapp.ca -> gathr-deeplink (us-central1)`

### Build, Push, and Deploy (Production)

From `C:\Windows\System32\GathR-Project\GathR\gathr-deeplink-service`:

```powershell
docker build -t gcr.io/gathr-backend/gathr-deeplink .
docker push gcr.io/gathr-backend/gathr-deeplink
gcloud run deploy gathr-deeplink --image gcr.io/gathr-backend/gathr-deeplink --platform managed --region us-central1 --allow-unauthenticated --project gathr-backend
```

**Recommended:** Always include `--project gathr-backend` explicitly (even if your active project is already set) to avoid deploying to the wrong project.

### Post-Deploy Verification (Required)

In PowerShell, use `curl.exe` (not `curl`) so PowerShell does not alias to `Invoke-WebRequest`.

```powershell
curl.exe -s https://link.gathrapp.ca/health
curl.exe -i https://link.gathrapp.ca/event/fb_1560964642333741_20260228
curl.exe -i "https://link.gathrapp.ca/og/event/fb_1560964642333741_20260228.png?v=1"
```

Expected results:
- `/health` includes enhanced JSON (`backendBaseUrl`, `cacheStats`)
- `/event/...` HTML contains event-specific OG tags (not generic `View on GathR`)
- `/og/...png` returns `200 OK` with `content-type: image/png`

### Preview Gotchas (Important)

1. **`fb_`-prefixed IDs vs backend detail endpoint**
   - App share URLs often use IDs like `fb_<firestoreId>`
   - The backend detail endpoint may only resolve the raw Firestore ID (without `fb_`)
   - The deep-link service now retries both formats when building previews
   - If a preview incorrectly shows `This event may have ended`, test the backend manually with both ID formats

2. **WebP source images (supported)**
   - Many GathR event images are `.webp`
   - The OG image renderer can fail if it tries to embed WebP directly
   - The deep-link service now transcodes unsupported source formats (e.g. WebP/AVIF) before rendering the final OG PNG
   - Keep `sharp` installed in `gathr-deeplink-service` (required for this conversion)

3. **Cached broken OG image URLs**
   - If an OG image URL (for example `...png?v=1`) was previously cached as a `500`, platforms/CDNs may keep serving the broken result
   - Bump the Cloud Run env var `OG_IMAGE_VERSION` to change the image URL query string and force a fresh fetch

   Example:
   ```powershell
   gcloud run services update gathr-deeplink --region us-central1 --project gathr-backend --update-env-vars OG_IMAGE_VERSION=3
   ```

4. **Do not parallelize `docker push` and deploy**
   - `gcloud run deploy --image ...` may pull the previous `latest` image if the push is still in progress
   - Always run `docker push` first, then run `gcloud run deploy`

### If the Custom Domain Still Shows Old Behavior

Check these in order:

1. **Wrong project deployed**
   - Re-run `gcloud config list`
   - Re-run deploy with explicit `--project gathr-backend`

2. **Wrong folder deployed**
   - Confirm you deployed from `GathR\gathr-deeplink-service` (the enhanced version)

3. **Compare direct service URL vs custom domain**
   - `gcloud run services list --region us-central1 --project gathr-backend`
   - Test both the direct Cloud Run URL and `link.gathrapp.ca`
   - If direct URL is new but custom domain is old, re-check domain mapping in `gathr-backend`

4. **Preview caching (apps/platforms)**
   - iMessage, Facebook, and Messenger cache previews aggressively
   - Use Facebook Sharing Debugger to force re-scrape
   - Test with a different event URL if needed

### Notes for Future AI / Developers

- `Google Frontend` response headers do **not** prove which GCP product is serving the request.
- `ghs.googlehosted.com` DNS target does **not** by itself prove Firebase Hosting.
- The source of truth for the live deep-link custom domain is the Cloud Run **Domain mappings** screen in the `gathr-backend` project.

---

## Troubleshooting

### Link Opens in Browser Instead of App

**iOS:**
1. Check that `.well-known/apple-app-site-association` is accessible
2. Verify `associatedDomains` in app.config.js matches domain
3. Ensure app is installed from TestFlight or App Store (not Expo Go)
4. Try long-pressing link and selecting "Open in GathR"

**Android:**
1. Check that `.well-known/assetlinks.json` is accessible
2. Verify SHA-256 fingerprint matches your signing key
3. Ensure `autoVerify: true` in intentFilters
4. Check Android App Links settings: Settings → Apps → GathR → Open by default

### Event Not Found

**Possible Causes:**
1. Event ID format mismatch (Firestore ID vs legacy numeric ID)
2. Event not in cache and fetch failed
3. Event has been deleted or expired

**Solution:**
- The handler uses `areEventIdsEquivalent()` to match different ID formats
- Fetches from API if not in cache using `toAppEventId()` normalization
- Shows user-friendly alert if event not found

### Duplicate URL Processing

**Prevention:**
- Hook tracks processed URLs in a `useRef<Set<string>>`
- Uses `isProcessing` flag to prevent concurrent handling
- Each URL is only processed once per app session

---

## Analytics

Deep link events are tracked via Amplitude:

```typescript
// When link is opened
amplitudeTrack('deep_link_opened', {
  event_id: eventId,
  type: type || 'event',
  source: 'universal_link',
  current_screen: pathname
});

// When event successfully opens
amplitudeTrack('deep_link_event_opened', {
  event_id: eventId,
  event_title: event.title,
  event_venue: event.venue,
  event_type: event.type
});

// When event not found
amplitudeTrack('deep_link_event_not_found', {
  event_id: eventId
});
```

---

## Future Enhancements

### Potential Improvements

1. **Dynamic Links / Branch.io:**
   - Better fallback handling
   - More detailed attribution
   - Deferred deep linking (opens after install)

2. **Link Previews:**
   - Add Open Graph meta tags to web landing page
   - Show event image, title, and description in link previews

3. **Deep Link Types:**
   - Venue deep links: `link.gathrapp.ca/venue/harbor-park`
   - Category deep links: `link.gathrapp.ca/category/live-music`
   - User profiles: `link.gathrapp.ca/user/123`

4. **Smart Redirect Logic:**
   - Geo-detection for App Store region
   - Remember user preference (always open in app/browser)
   - QR code generation for events

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `hooks/useDeepLinking.ts` | Main deep link handler hook |
| `utils/shareUtils.ts` | URL builder for sharing |
| `app.config.js` | Universal Links & App Links config |
| `app/_layout.tsx` | Hook integration point |
| `app/(tabs)/events.tsx` | Events list share |
| `app/(tabs)/specials.tsx` | Specials list share |
| `components/map/EventCallout.tsx` | Map callout share |
| `components/map/EventImageLightbox.tsx` | Lightbox share |

---

## Related Documentation

- [Expo Linking Documentation](https://docs.expo.dev/guides/linking/)
- [iOS Universal Links](https://developer.apple.com/ios/universal-links/)
- [Android App Links](https://developer.android.com/training/app-links)
- [Firestore Events Mode](./FIRESTORE_MODE.md)

---

## Questions or Issues?

If modifying deep linking behavior:
1. Review `parseDeepLink()` logic for URL parsing
2. Check `handleDeepLink()` for event fetching and navigation
3. Verify share message format in all 4 share locations
4. Test with both Firestore IDs and legacy numeric IDs
5. Ensure analytics events are tracking correctly

For web server configuration:
1. Confirm `.well-known` files are accessible over HTTPS
2. Verify no redirects are happening
3. Test on real devices (simulators/emulators may behave differently)
4. Use Apple's App Site Association validator
5. Check Android's Digital Asset Links validator
