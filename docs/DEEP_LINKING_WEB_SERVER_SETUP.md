# Web Server Setup for GathR Deep Linking

**Domain:** `link.gathrapp.ca`
**Status:** 🔄 Pending Implementation

---

## Quick Reference

### Your Credentials
- **Apple Team ID:** `G2W34P3KQ7`
- **Android SHA-256:** `50:5D:7E:97:4C:FB:AF:4F:02:9C:91:53:65:AF:49:DA:43:49:C8:94:83:74:4D:F5:15:1D:57:EB:30:13:43:E7`
- **iOS Bundle ID:** `com.craigb.gathr`
- **Android Package:** `com.craigb.gathr`

---

## Files Needed on link.gathrapp.ca

### File 1: Apple App Site Association
**Path:** `/.well-known/apple-app-site-association`
**Note:** NO file extension

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

**Server Requirements:**
- Served over HTTPS
- Content-Type: `application/json`
- No redirects
- Must be accessible at BOTH:
  - `https://link.gathrapp.ca/.well-known/apple-app-site-association`
  - `https://www.link.gathrapp.ca/.well-known/apple-app-site-association` (if www subdomain exists)

---

### File 2: Android Asset Links
**Path:** `/.well-known/assetlinks.json`

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

**Server Requirements:**
- Served over HTTPS
- Content-Type: `application/json`
- No redirects
- Must be accessible at:
  - `https://link.gathrapp.ca/.well-known/assetlinks.json`

---

### File 3: Event Landing Page
**Path:** `/event/:id` (e.g., `/event/12345`)

This page should:
1. Try to open the GathR app
2. Fall back to app store if app not installed

**Simple HTML Template:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GathR Event</title>

  <!-- iOS Smart App Banner -->
  <meta name="apple-itunes-app" content="app-id=YOUR_IOS_APP_ID">

  <!-- Open Graph for rich link previews -->
  <meta property="og:title" content="Check out this event on GathR">
  <meta property="og:description" content="Discover local events with GathR">
  <meta property="og:image" content="https://link.gathrapp.ca/og-image.png">
  <meta property="og:url" content="https://link.gathrapp.ca/event/{{EVENT_ID}}">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #4A90E2, #1E90FF);
      color: white;
      text-align: center;
      padding: 20px;
    }
    .logo {
      width: 120px;
      height: 120px;
      margin-bottom: 30px;
      border-radius: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    p {
      font-size: 16px;
      opacity: 0.9;
      margin-bottom: 40px;
      max-width: 400px;
    }
    .buttons {
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
      justify-content: center;
      margin-top: 20px;
    }
    .btn {
      padding: 16px 32px;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0,0,0,0.3);
    }
    .btn-primary {
      background: white;
      color: #1E90FF;
    }
    .btn-secondary {
      background: rgba(255,255,255,0.2);
      color: white;
      border: 2px solid white;
    }
    .loading {
      margin-top: 20px;
      font-size: 14px;
      opacity: 0.7;
    }
    #store-buttons {
      display: none;
    }
  </style>
</head>
<body>
  <img src="https://link.gathrapp.ca/logo.png" alt="GathR" class="logo">
  <h1>Opening in GathR...</h1>
  <p id="status-message">Taking you to the event details</p>

  <div class="loading" id="loading-indicator">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" stroke-width="3" stroke-dasharray="31.4 31.4" opacity="0.25"/>
      <circle cx="12" cy="12" r="10" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-dashoffset="23.55" opacity="0.75">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
      </circle>
    </svg>
  </div>

  <div class="buttons" id="store-buttons">
    <a href="https://apps.apple.com/app/gathr/idYOUR_APP_ID" class="btn btn-primary" id="ios-btn">
      📱 Download on App Store
    </a>
    <a href="https://play.google.com/store/apps/details?id=com.craigb.gathr" class="btn btn-primary" id="android-btn">
      🤖 Get it on Google Play
    </a>
    <a href="https://www.gathrapp.ca" class="btn btn-secondary">
      🌐 Continue to Website
    </a>
  </div>

  <script>
    (function() {
      // Parse event info from URL path
      const path = window.location.pathname;
      const pathMatch = path.match(/^\/(event|special)\/(.+)/);

      let type = 'event';
      let eventId = null;

      if (pathMatch) {
        type = pathMatch[1];
        eventId = pathMatch[2];
      } else {
        // Fallback to query params
        const params = new URLSearchParams(window.location.search);
        eventId = params.get('eventId');
        type = params.get('type') || 'event';
      }

      // Detect platform
      const userAgent = navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(userAgent);
      const isAndroid = /android/.test(userAgent);
      const isMobile = isIOS || isAndroid;

      // Build deep link URL
      const deepLink = eventId
        ? `gathr://${type}/${eventId}`
        : 'gathr://';

      console.log('[GathR] Deep link:', deepLink);
      console.log('[GathR] Platform:', { isIOS, isAndroid, isMobile });

      // Show appropriate store buttons
      const iosBtn = document.getElementById('ios-btn');
      const androidBtn = document.getElementById('android-btn');

      if (isIOS) {
        iosBtn.style.display = 'inline-flex';
        androidBtn.style.display = 'none';
      } else if (isAndroid) {
        iosBtn.style.display = 'none';
        androidBtn.style.display = 'inline-flex';
      } else {
        // Desktop - show both
        iosBtn.style.display = 'inline-flex';
        androidBtn.style.display = 'inline-flex';
      }

      // Only attempt app redirect on mobile
      if (isMobile) {
        const startTime = Date.now();
        let appOpened = false;

        // Method 1: Try iframe approach
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = deepLink;
        document.body.appendChild(iframe);

        // Method 2: Direct location change
        setTimeout(() => {
          if (!appOpened) {
            window.location.href = deepLink;
          }
        }, 25);

        // Detect if app opened (page visibility change)
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            appOpened = true;
            console.log('[GathR] App opened successfully');
          }
        });

        // Fallback to store after 2.5 seconds if app didn't open
        setTimeout(() => {
          const elapsed = Date.now() - startTime;

          // If still on page after 2.5s, likely app isn't installed
          if (!appOpened && !document.hidden && elapsed >= 2400) {
            console.log('[GathR] App not detected, showing store buttons');

            document.getElementById('loading-indicator').style.display = 'none';
            document.getElementById('status-message').textContent =
              "App not installed? Download GathR to see this event:";
            document.getElementById('store-buttons').style.display = 'flex';
          }
        }, 2500);
      } else {
        // Desktop - just show download buttons immediately
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('status-message').textContent =
          "Download GathR to see this event on your mobile device:";
        document.getElementById('store-buttons').style.display = 'flex';
      }
    })();
  </script>
</body>
</html>
```

---

### File 4: Special Landing Page
**Path:** `/special/:id`

Same as event landing page, just replace "event" references with "special" where appropriate.

---

## Testing After Setup

### Test HTTPS Access
```bash
# Test Apple file
curl -I https://link.gathrapp.ca/.well-known/apple-app-site-association

# Test Android file
curl -I https://link.gathrapp.ca/.well-known/assetlinks.json

# Should return:
# HTTP/2 200
# Content-Type: application/json
```

### Verify Content
```bash
# View Apple file
curl https://link.gathrapp.ca/.well-known/apple-app-site-association

# View Android file
curl https://link.gathrapp.ca/.well-known/assetlinks.json
```

### Online Validators

**Apple Universal Links:**
- Use Apple's [App Site Association CDN Validation](https://search.developer.apple.com/appsearch-validation-tool/)
- Enter: `link.gathrapp.ca`

**Android App Links:**
- Use Google's [Digital Asset Links Tester](https://developers.google.com/digital-asset-links/tools/generator)
- Test domain: `link.gathrapp.ca`
- Package name: `com.craigb.gathr`

---

## Troubleshooting

### Issue: "Failed to verify domain association"

**iOS:**
1. Verify file has no `.json` extension
2. Check Content-Type is `application/json`
3. Ensure no redirects (301/302)
4. Verify Apple Team ID matches: `G2W34P3KQ7`
5. Try accessing from both `link.gathrapp.ca` and `www.link.gathrapp.ca`

**Android:**
1. Verify SHA-256 fingerprint is correct
2. Check file is named `assetlinks.json` (with extension)
3. Ensure `autoVerify: true` in app.config.js
4. Wait 20 minutes after app install for verification

### Issue: "Link opens in browser instead of app"

**Common Causes:**
1. Files not accessible over HTTPS
2. Domain mismatch between app config and actual domain
3. App not installed from official store (TestFlight/Play Store)
4. Need to clear cache or reinstall app

**iOS Specific:**
- Long-press the link → Select "Open in GathR"
- Check Settings → GathR → Associated Domains

**Android Specific:**
- Settings → Apps → GathR → Open by default → Should show verified links

---

## What AI Helper Needs to Know

When you get help setting up the web server, tell the AI:

1. **Domain:** `link.gathrapp.ca`
2. **Current hosting:** Wix (has limitations with `.well-known` directory)
3. **Required files:** Show them this document
4. **Potential solution:** May need Cloudflare or Netlify in front of Wix for `.well-known` files

**Alternative approach if Wix doesn't support `.well-known`:**
- Use Cloudflare Workers to intercept requests to `/.well-known/*`
- Use Netlify/Vercel for a subdomain (`link.gathrapp.ca`) while keeping main site on Wix
- Use Firebase Hosting for just the deep link domain

---

## Once Setup is Complete

After the web server is configured:

1. **Build and release new app version** (already done or in progress)
2. **Test on real devices:**
   ```bash
   # iOS
   xcrun simctl openurl booted "https://link.gathrapp.ca/event/12345"

   # Android
   adb shell am start -a android.intent.action.VIEW -d "https://link.gathrapp.ca/event/12345"
   ```
3. **Share a real event** and test clicking the link
4. **Monitor analytics** for `deep_link_opened` events
5. **Update docs** with any findings or issues

---

## Questions to Ask AI Helper

1. "Can Wix host files in `/.well-known/` directory?"
2. "If not, what's the easiest way to add these two JSON files for link.gathrapp.ca?"
3. "How do I set up the landing page for `/event/:id` paths on Wix?"
4. "Do I need to configure DNS differently for `link.gathrapp.ca`?"
5. "How can I ensure the files are served with Content-Type: application/json?"
