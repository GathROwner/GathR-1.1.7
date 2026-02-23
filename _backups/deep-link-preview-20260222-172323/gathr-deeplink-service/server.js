/**
 * GathR Deep Link Service
 * Serves .well-known files for iOS Universal Links and Android App Links
 * Also serves landing pages for /event/{id} and /special/{id}
 */

const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

// ============================================
// CONFIGURATION - Your app details
// ============================================
const CONFIG = {
  // Apple
  appleTeamId: 'G2W34P3KQ7',
  bundleId: 'com.craigb.gathr',

  // Android
  packageName: 'com.craigb.gathr',
  sha256Fingerprint: '50:5D:7E:97:4C:FB:AF:4F:02:9C:91:53:65:AF:49:DA:43:49:C8:94:83:74:4D:F5:15:1D:57:EB:30:13:43:E7',

  // App Store links
  appStoreUrl: 'https://apps.apple.com/app/id6743016252',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.craigb.gathr',

  // Domain
  domain: 'link.gathrapp.ca'
};

// ============================================
// Apple App Site Association (iOS Universal Links)
// ============================================
app.get('/.well-known/apple-app-site-association', (req, res) => {
  const aasa = {
    applinks: {
      apps: [],
      details: [{
        appID: `${CONFIG.appleTeamId}.${CONFIG.bundleId}`,
        paths: ['/event/*', '/special/*']
      }]
    }
  };

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(aasa, null, 2));
});

// Also serve at root path (some older iOS versions check here)
app.get('/apple-app-site-association', (req, res) => {
  const aasa = {
    applinks: {
      apps: [],
      details: [{
        appID: `${CONFIG.appleTeamId}.${CONFIG.bundleId}`,
        paths: ['/event/*', '/special/*']
      }]
    }
  };

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(aasa, null, 2));
});

// ============================================
// Android Asset Links (Android App Links)
// ============================================
app.get('/.well-known/assetlinks.json', (req, res) => {
  const assetLinks = [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: CONFIG.packageName,
      sha256_cert_fingerprints: [CONFIG.sha256Fingerprint]
    }
  }];

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(assetLinks, null, 2));
});

// ============================================
// Landing Pages for Deep Links
// ============================================
function generateLandingPage(type, id) {
  const universalLink = `https://${CONFIG.domain}/${type}/${id}`;
  const displayType = type === 'special' ? 'Special' : 'Event';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>GathR - View ${displayType}</title>
  <meta property="og:title" content="View on GathR">
  <meta property="og:description" content="Discover local events and specials near you">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${universalLink}">
  <meta name="apple-itunes-app" content="app-id=6743016252, app-argument=${universalLink}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: linear-gradient(135deg, #80c3f7 0%, #4A90E2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 24px;
      padding: 48px 32px;
      text-align: center;
      max-width: 380px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    }
    .logo {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #4A90E2, #80c3f7);
      border-radius: 20px;
      margin: 0 auto 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
    }
    h1 { color: #1a1a1a; margin-bottom: 8px; font-size: 24px; font-weight: 700; }
    .subtitle { color: #666; margin-bottom: 32px; font-size: 16px; line-height: 1.5; }
    .btn {
      display: block;
      padding: 16px 24px;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      margin: 12px 0;
    }
    .btn-primary {
      background: linear-gradient(135deg, #4A90E2, #357ABD);
      color: white;
      box-shadow: 0 4px 15px rgba(74, 144, 226, 0.4);
    }
    .divider { margin: 28px 0 20px; color: #999; font-size: 14px; }
    .store-buttons { display: flex; gap: 12px; justify-content: center; }
    .btn-store {
      flex: 1;
      padding: 14px 16px;
      background: #f5f5f5;
      color: #333;
      font-size: 14px;
      border-radius: 10px;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">📍</div>
    <h1>View on GathR</h1>
    <p class="subtitle">Tap below to open this ${displayType.toLowerCase()} in the GathR app</p>
    <a href="${universalLink}" class="btn btn-primary">Open in GathR</a>
    <div class="divider">Don't have the app?</div>
    <div class="store-buttons">
      <a href="${CONFIG.appStoreUrl}" class="btn btn-store">App Store</a>
      <a href="${CONFIG.playStoreUrl}" class="btn btn-store">Google Play</a>
    </div>
  </div>
  <script>
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    var isAndroid = /Android/.test(navigator.userAgent);
    var appStoreUrl = '${CONFIG.appStoreUrl}';
    var playStoreUrl = '${CONFIG.playStoreUrl}';

    // Only try auto-open ONCE using sessionStorage to prevent refresh loop
    var hasTriedOpen = sessionStorage.getItem('gathr_tried_' + '${id}');

    if ((isIOS || isAndroid) && !hasTriedOpen) {
      sessionStorage.setItem('gathr_tried_' + '${id}', 'true');

      // Try to open the app using custom scheme
      window.location.href = 'gathr://${type}/${id}';

      // If we're still here after 1.5 seconds, app isn't installed - redirect to store
      setTimeout(function() {
        if (isIOS) {
          window.location.href = appStoreUrl;
        } else if (isAndroid) {
          window.location.href = playStoreUrl;
        }
      }, 1500);
    }
  </script>
</body>
</html>`;
}

app.get('/event/:id', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(generateLandingPage('event', req.params.id));
});

app.get('/special/:id', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(generateLandingPage('special', req.params.id));
});

app.get('/', (req, res) => {
  res.send('GathR Deep Link Service is running');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'gathr-deeplink' });
});

app.listen(port, () => {
  console.log(`GathR Deep Link Service running on port ${port}`);
});
