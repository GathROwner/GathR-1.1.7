/**
 * GathR Deep Link Service
 * Serves:
 * - Apple App Site Association / Android Asset Links
 * - Dynamic landing pages for /event/{id} and /special/{id}
 * - Branded OG preview images for social link unfurls
 */

const express = require('express');

const { escapeHtml } = require('./lib/htmlEscape');
const { buildPreviewModel } = require('./lib/previewText');
const {
  DEFAULT_BACKEND_BASE_URL,
  fetchEventPreviewById,
  previewCache,
} = require('./lib/fetchEventPreview');
const {
  OG_WIDTH,
  OG_HEIGHT,
  buildOgImageSvg,
  generateOgImageBuffer,
  renderCache,
  remoteImageCache,
} = require('./lib/ogImage');

const app = express();
const port = Number(process.env.PORT || 8080);

app.disable('x-powered-by');

// Serve static fallback images
app.use('/fallbacks', express.static('public/fallbacks'));

// ============================================
// CONFIGURATION - App details
// ============================================
const CONFIG = {
  // Apple
  appleTeamId: process.env.APPLE_TEAM_ID || 'G2W34P3KQ7',
  bundleId: process.env.IOS_BUNDLE_ID || 'com.craigb.gathr',

  // Android
  packageName: process.env.ANDROID_PACKAGE_NAME || 'com.craigb.gathr',
  sha256Fingerprint: process.env.ANDROID_SHA256_FINGERPRINT
    || '50:5D:7E:97:4C:FB:AF:4F:02:9C:91:53:65:AF:49:DA:43:49:C8:94:83:74:4D:F5:15:1D:57:EB:30:13:43:E7',

  // App Store links
  appStoreUrl: process.env.APP_STORE_URL || 'https://apps.apple.com/app/id6743016252',
  playStoreUrl: process.env.PLAY_STORE_URL || 'https://play.google.com/store/apps/details?id=com.craigb.gathr',

  // Domain
  domain: process.env.LINK_DOMAIN || 'link.gathrapp.ca',

  // Backend API
  backendBaseUrl: DEFAULT_BACKEND_BASE_URL,

  // Preview version (bump to force image cache refresh across platforms)
  ogImageVersion: process.env.OG_IMAGE_VERSION || '1',
};

function normalizeType(value) {
  return value === 'special' ? 'special' : 'event';
}

function simpleHash(value) {
  let hash = 0;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function buildUniversalLink(type, id) {
  return `https://${CONFIG.domain}/${type}/${encodeURIComponent(String(id || ''))}`;
}

function buildOgImageUrl(type, id, imageUrl) {
  const imageHash = imageUrl ? simpleHash(imageUrl).slice(0, 8) : 'default';
  return `https://${CONFIG.domain}/og/${type}/${encodeURIComponent(String(id || ''))}.png?v=${encodeURIComponent(CONFIG.ogImageVersion)}_${imageHash}`;
}

function buildAasaPayload() {
  return {
    applinks: {
      apps: [],
      details: [{
        appID: `${CONFIG.appleTeamId}.${CONFIG.bundleId}`,
        paths: ['/event/*', '/special/*'],
      }],
    },
  };
}

function buildAssetLinksPayload() {
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: CONFIG.packageName,
      sha256_cert_fingerprints: [CONFIG.sha256Fingerprint],
    },
  }];
}

function generateLandingPage(params) {
  const {
    type,
    id,
    universalLink,
    ogImageUrl,
    model,
  } = params;

  const displayType = type === 'special' ? 'Special' : 'Event';
  const pageTitle = model.pageTitle || `GathR - View ${displayType}`;
  const metaTitle = model.metaTitle || `View on GathR`;
  const metaDescription = model.metaDescription || 'Discover local events and specials near you';
  const pageHeading = model.pageHeading || `View on GathR`;
  const pageSubheading = model.pageSubheading || `Tap below to open this ${displayType.toLowerCase()} in the GathR app`;
  const titleLine = model.title || '';
  const subtitleLine = model.subtitleLine || '';
  const descriptionLine = model.shortDescription || '';
  const pageHeroImageUrl = model.imageUrl || ogImageUrl;
  const unavailableClass = model.unavailable ? ' unavailable' : '';
  const unavailableBadge = model.unavailable
    ? '<div class="status-badge">This link may no longer be active</div>'
    : '';
  const previewMetaLine = [model.venue, model.dateTimeLabel].filter(Boolean).join(' • ');
  const showPreviewMetaLine = Boolean(previewMetaLine) && previewMetaLine !== pageSubheading;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDescription)}">
  <meta property="og:title" content="${escapeHtml(metaTitle)}">
  <meta property="og:description" content="${escapeHtml(metaDescription)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(universalLink)}">
  <meta property="og:site_name" content="GathR">
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="${OG_WIDTH}">
  <meta property="og:image:height" content="${OG_HEIGHT}">
  <meta property="og:image:alt" content="${escapeHtml(titleLine || pageHeading)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(metaTitle)}">
  <meta name="twitter:description" content="${escapeHtml(metaDescription)}">
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
  <meta name="apple-itunes-app" content="app-id=6743016252, app-argument=${escapeHtml(universalLink)}">
  <link rel="canonical" href="${escapeHtml(universalLink)}">
  <meta name="robots" content="noindex,nofollow">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #f3f8ff;
      background:
        radial-gradient(1200px 500px at 10% -10%, rgba(128,195,247,0.26), transparent 60%),
        radial-gradient(900px 500px at 100% 10%, rgba(74,144,226,0.22), transparent 58%),
        linear-gradient(160deg, #0d294b 0%, #153f70 52%, #2c6cae 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .frame {
      width: min(520px, 100%);
      border-radius: 28px;
      background: rgba(8, 20, 38, 0.70);
      border: 1px solid rgba(255,255,255,0.10);
      box-shadow: 0 24px 80px rgba(0,0,0,0.28);
      backdrop-filter: blur(10px);
      overflow: hidden;
    }
    .preview-image-wrap {
      padding: 14px 14px 0 14px;
    }
    .preview-image {
      display: block;
      width: 100%;
      aspect-ratio: 1200 / 630;
      border-radius: 18px;
      object-fit: cover;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.06);
    }
    .content {
      padding: 18px 18px 20px 18px;
    }
    .brand-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }
    .brand-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 8px 12px;
      background: rgba(127,196,255,0.12);
      border: 1px solid rgba(127,196,255,0.20);
      color: #dff0ff;
      font-weight: 600;
      font-size: 13px;
    }
    .brand-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #7fc4ff;
      box-shadow: 0 0 0 4px rgba(127,196,255,0.16);
    }
    .host {
      color: rgba(235,245,255,0.75);
      font-size: 12px;
      letter-spacing: 0.02em;
    }
    .status-badge {
      margin-bottom: 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.10);
      color: #d4e9ff;
      font-size: 13px;
      font-weight: 600;
    }
    h1 {
      color: #ffffff;
      font-size: 24px;
      line-height: 1.2;
      font-weight: 800;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    .subheading {
      color: #d7eafc;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 8px;
    }
    .meta {
      color: #b8d9f7;
      font-size: 13px;
      line-height: 1.45;
      margin-bottom: 12px;
    }
    .desc {
      color: #e9f5ff;
      font-size: 14px;
      line-height: 1.45;
      margin-bottom: 16px;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .btn {
      display: block;
      width: 100%;
      text-align: center;
      padding: 14px 16px;
      border-radius: 14px;
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      transition: opacity 120ms ease;
    }
    .btn:hover { opacity: 0.95; }
    .btn-primary {
      color: #ffffff;
      background: linear-gradient(135deg, #4A90E2, #2b6db1);
      border: 1px solid rgba(255,255,255,0.16);
      box-shadow: 0 10px 24px rgba(74, 144, 226, 0.28);
    }
    .btn-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .btn-secondary {
      color: #e8f4ff;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.10);
    }
    .hint {
      margin-top: 12px;
      color: rgba(233, 245, 255, 0.78);
      font-size: 12px;
      line-height: 1.4;
    }
    .unavailable .btn-primary {
      background: linear-gradient(135deg, #3f79bb, #265d99);
    }
    @media (max-width: 480px) {
      body { padding: 14px; }
      .frame { border-radius: 22px; }
      h1 { font-size: 21px; }
      .btn-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="frame${unavailableClass}">
    <div class="preview-image-wrap">
      <img class="preview-image" src="${escapeHtml(pageHeroImageUrl)}" alt="${escapeHtml(titleLine || pageHeading)}" />
    </div>
    <section class="content">
      <div class="brand-row">
        <div class="brand-chip"><span class="brand-dot"></span><span>GathR ${escapeHtml(displayType)}</span></div>
        <div class="host">${escapeHtml(CONFIG.domain)}</div>
      </div>
      ${unavailableBadge}
      <h1>${escapeHtml(pageHeading)}</h1>
      <p class="subheading">${escapeHtml(pageSubheading)}</p>
      ${showPreviewMetaLine ? `<p class="meta">${escapeHtml(previewMetaLine)}</p>` : ''}
      ${descriptionLine ? `<p class="desc">${escapeHtml(descriptionLine)}</p>` : ''}

      <div class="actions">
        <a href="${escapeHtml(universalLink)}" class="btn btn-primary">Open in GathR</a>
        <div class="btn-row">
          <a href="${escapeHtml(CONFIG.appStoreUrl)}" class="btn btn-secondary">App Store</a>
          <a href="${escapeHtml(CONFIG.playStoreUrl)}" class="btn btn-secondary">Google Play</a>
        </div>
      </div>
      <p class="hint">
        If the app is installed, your phone may open GathR automatically. If this ${escapeHtml(displayType.toLowerCase())} is no longer available, you can browse current content in the app.
      </p>
    </section>
  </main>

  <script>
    (function() {
      var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      var isAndroid = /Android/.test(navigator.userAgent);
      var appStoreUrl = ${JSON.stringify(CONFIG.appStoreUrl)};
      var playStoreUrl = ${JSON.stringify(CONFIG.playStoreUrl)};
      var type = ${JSON.stringify(type)};
      var id = ${JSON.stringify(String(id || ''))};

      // Only try auto-open once per link id in the current tab/session to avoid loops.
      var key = 'gathr_tried_' + type + '_' + id;
      var hasTriedOpen = sessionStorage.getItem(key);

      if ((isIOS || isAndroid) && !hasTriedOpen) {
        sessionStorage.setItem(key, 'true');
        window.location.href = 'gathr://' + type + '/' + encodeURIComponent(id);

        setTimeout(function() {
          if (document.hidden) return;
          if (isIOS) {
            window.location.href = appStoreUrl;
          } else if (isAndroid) {
            window.location.href = playStoreUrl;
          }
        }, 1500);
      }
    })();
  </script>
</body>
</html>`;
}

async function loadPreviewForRequest(type, id) {
  const result = await fetchEventPreviewById(id, { requestedType: type });
  const item = result.ok ? result.item : null;
  const model = buildPreviewModel(item, type);
  return {
    result,
    item,
    model,
  };
}

async function handleLandingPage(req, res, type) {
  const id = String(req.params.id || '').trim();
  const normalizedType = normalizeType(type);
  const universalLink = buildUniversalLink(normalizedType, id);

  const { result, model } = await loadPreviewForRequest(normalizedType, id);
  const ogImageUrl = buildOgImageUrl(normalizedType, id, model.imageUrl);

  if (!result.ok) {
    console.warn('[preview] fetch failed', {
      type: normalizedType,
      id,
      status: result.status,
      error: result.error,
      source: result.source,
    });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.send(generateLandingPage({
    type: normalizedType,
    id,
    universalLink,
    ogImageUrl,
    model,
  }));
}

async function handleOgImage(req, res) {
  const type = normalizeType(req.params.type);
  const id = String(req.params.id || '').trim();

  const { item, result } = await loadPreviewForRequest(type, id);
  if (!result.ok && result.status && result.status !== 404) {
    console.warn('[og-image] preview fetch degraded', {
      type,
      id,
      status: result.status,
      error: result.error,
    });
  }

  try {
    const buffer = await generateOgImageBuffer({
      requestedType: type,
      id,
      item,
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.send(buffer);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (message.includes('resvg renderer unavailable')) {
      console.warn('[og-image] PNG renderer unavailable; serving SVG fallback', { type, id, message });
      const { svg } = await buildOgImageSvg({
        requestedType: type,
        id,
        item,
      });
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      res.send(svg);
      return;
    }

    console.error('[og-image] render failed', {
      type,
      id,
      error: message,
      hasItem: !!item,
      itemImageUrl: item?.imageUrl,
      stack: error?.stack,
    });
    res.status(500).json({ error: 'Failed to generate preview image' });
  }
}

// ============================================
// Apple App Site Association (iOS Universal Links)
// ============================================
app.get('/.well-known/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(buildAasaPayload(), null, 2));
});

// Also serve at root path (some older iOS versions check here)
app.get('/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(buildAasaPayload(), null, 2));
});

// ============================================
// Android Asset Links (Android App Links)
// ============================================
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(buildAssetLinksPayload(), null, 2));
});

// ============================================
// OG image routes
// ============================================
app.get('/og/:type(event|special)/:id.png', async (req, res) => {
  await handleOgImage(req, res);
});

// ============================================
// Landing pages for deep links
// ============================================
app.get('/event/:id', async (req, res) => {
  await handleLandingPage(req, res, 'event');
});

app.get('/special/:id', async (req, res) => {
  await handleLandingPage(req, res, 'special');
});

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send('GathR Deep Link Service is running');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'gathr-deeplink',
    backendBaseUrl: CONFIG.backendBaseUrl,
    cacheStats: {
      preview: previewCache.stats(),
      ogRender: renderCache.stats(),
      remoteImage: remoteImageCache.stats(),
    },
  });
});

// Debug endpoint to check if public files are present
app.get('/debug/files', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  try {
    const publicPath = path.join(__dirname, 'public');
    const fallbacksPath = path.join(publicPath, 'fallbacks');

    const result = {
      publicExists: fs.existsSync(publicPath),
      fallbacksExists: fs.existsSync(fallbacksPath),
      publicContents: [],
      fallbacksContents: []
    };

    if (result.publicExists) {
      result.publicContents = fs.readdirSync(publicPath);
    }

    if (result.fallbacksExists) {
      result.fallbacksContents = fs.readdirSync(fallbacksPath);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.listen(port, () => {
  console.log(`GathR Deep Link Service running on port ${port}`);
  console.log(`Backend preview source: ${CONFIG.backendBaseUrl}`);
});
