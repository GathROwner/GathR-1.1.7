const fs = require('fs/promises');
const path = require('path');

const { createTtlCache } = require('./cache');
const { escapeXml } = require('./htmlEscape');
const { buildPreviewModel, wrapTextLines, normalizeWhitespace } = require('./previewText');

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const renderCache = createTtlCache({
  name: 'og-render-cache',
  defaultTtlMs: Number(process.env.OG_IMAGE_CACHE_TTL_MS || 10 * 60 * 1000),
  maxEntries: Number(process.env.OG_IMAGE_CACHE_MAX_ENTRIES || 300),
});

const remoteImageCache = createTtlCache({
  name: 'remote-image-cache',
  defaultTtlMs: Number(process.env.OG_REMOTE_IMAGE_CACHE_TTL_MS || 10 * 60 * 1000),
  maxEntries: Number(process.env.OG_REMOTE_IMAGE_CACHE_MAX_ENTRIES || 300),
});

let brandAssetsPromise = null;
let ResvgCtor = null;
let resvgLoadError = null;
let sharpCtor = null;
let sharpLoadError = null;

function simpleHash(value) {
  let hash = 0;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getResvgCtor() {
  if (ResvgCtor) return ResvgCtor;
  if (resvgLoadError) return null;

  try {
    ResvgCtor = require('@resvg/resvg-js').Resvg;
    return ResvgCtor;
  } catch (error) {
    resvgLoadError = error;
    return null;
  }
}

function getSharpCtor() {
  if (sharpCtor) return sharpCtor;
  if (sharpLoadError) return null;

  try {
    sharpCtor = require('sharp');
    return sharpCtor;
  } catch (error) {
    sharpLoadError = error;
    return null;
  }
}

function sniffMimeType(buffer, headerMime) {
  const header = String(headerMime || '').split(';')[0].trim().toLowerCase();
  if (header) return header;
  if (!buffer || buffer.length < 12) return 'image/png';

  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return 'image/png';
}

async function transcodeForResvgIfNeeded(buffer, mime) {
  if (!buffer?.length) return { buffer, mime };
  const normalizedMime = String(mime || '').toLowerCase();

  // The resvg build in Cloud Run does not reliably accept WebP/AVIF image embeds.
  if (normalizedMime !== 'image/webp' && normalizedMime !== 'image/avif') {
    return { buffer, mime: normalizedMime || 'image/png' };
  }

  const sharp = getSharpCtor();
  if (!sharp) {
    console.warn('[og-image] sharp unavailable; cannot transcode source image', {
      mime: normalizedMime,
      error: String(sharpLoadError?.message || sharpLoadError || 'unknown error'),
    });
    return { buffer: null, mime: '' };
  }

  try {
    const maxDim = Number(process.env.OG_SOURCE_IMAGE_MAX_DIM || 1600);
    const quality = Number(process.env.OG_SOURCE_IMAGE_JPEG_QUALITY || 84);
    const converted = await sharp(buffer, { animated: false, failOnError: false })
      .rotate()
      .resize({
        width: maxDim,
        height: maxDim,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality,
        mozjpeg: true,
        progressive: true,
      })
      .toBuffer();

    return { buffer: converted, mime: 'image/jpeg' };
  } catch (error) {
    console.warn('[og-image] source image transcode failed', {
      mime: normalizedMime,
      error: String(error?.message || error || 'unknown error'),
    });
    return { buffer: null, mime: '' };
  }
}

async function fileToDataUri(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/png';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

async function loadBrandAssets() {
  if (brandAssetsPromise) return brandAssetsPromise;

  const assetsDir = path.join(__dirname, '..', 'assets');
  brandAssetsPromise = Promise.all([
    fileToDataUri(path.join(assetsDir, 'gathr-globe-logo.png')),
    fileToDataUri(path.join(assetsDir, 'gathr-text-logo.png')),
  ]).then(([globeLogoDataUri, textLogoDataUri]) => ({
    globeLogoDataUri,
    textLogoDataUri,
  }));

  return brandAssetsPromise;
}

async function fetchRemoteImageDataUri(imageUrl, retryCount = 0) {
  const url = normalizeWhitespace(imageUrl);
  if (!/^https?:\/\//i.test(url)) return '';

  const cached = remoteImageCache.get(url);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.OG_IMAGE_FETCH_TIMEOUT_MS || 10000)
  );

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'gathr-deeplink-service/1.0',
      },
    });

    if (!response.ok) return '';

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const maxBytes = Number(process.env.OG_IMAGE_MAX_BYTES || 8 * 1024 * 1024);
    if (buffer.length > maxBytes) return '';

    const mime = sniffMimeType(buffer, response.headers.get('content-type'));
    const transcoded = await transcodeForResvgIfNeeded(buffer, mime);
    if (!transcoded.buffer?.length) return '';

    const finalMime = transcoded.mime || mime;
    const finalBuffer = transcoded.buffer;
    const dataUri = `data:${finalMime};base64,${finalBuffer.toString('base64')}`;
    remoteImageCache.set(url, dataUri);
    return dataUri;
  } catch (error) {
    // Retry once on timeout
    if (retryCount === 0 && error.name === 'AbortError') {
      console.warn('[og-image] remote image fetch timeout, retrying', { url, retryCount });
      clearTimeout(timeout);
      return fetchRemoteImageDataUri(imageUrl, 1);
    }

    console.warn('[og-image] remote image fetch failed', {
      url,
      error: String(error?.message || error || 'unknown'),
      retryCount,
      timeout: process.env.OG_IMAGE_FETCH_TIMEOUT_MS || 10000,
    });
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

function makeLineText(lines, config) {
  const x = config.x;
  const startY = config.y;
  const lineHeight = config.lineHeight;
  const fontSize = config.fontSize;
  const fontWeight = config.fontWeight || 400;
  const fill = config.fill || '#ffffff';
  const opacity = config.opacity == null ? 1 : config.opacity;
  const letterSpacing = config.letterSpacing == null ? 0 : config.letterSpacing;

  return lines.map((line, idx) => (
    `<text x="${x}" y="${startY + (idx * lineHeight)}" fill="${fill}" fill-opacity="${opacity}" font-size="${fontSize}" font-weight="${fontWeight}" letter-spacing="${letterSpacing}" font-family="DejaVu Sans, Arial, sans-serif">${escapeXml(line)}</text>`
  )).join('\n');
}

function buildOgSvg(options) {
  const model = options.model;
  const requestedType = options.requestedType;
  const backgroundImageDataUri = options.backgroundImageDataUri;
  const globeLogoDataUri = options.globeLogoDataUri;
  const textLogoDataUri = options.textLogoDataUri;

  const kindLabel = requestedType === 'special' ? 'Special' : 'Event';
  const titleLines = wrapTextLines(model.title || `GathR ${kindLabel}`, {
    maxChars: model.unavailable ? 28 : 34,
    maxLines: model.unavailable ? 2 : 2,
  });
  const venueLines = wrapTextLines(model.venue, { maxChars: 42, maxLines: 1 });
  const dateLines = wrapTextLines(model.dateTimeLabel, { maxChars: 42, maxLines: 1 });
  const descLines = wrapTextLines(model.cardDescription || model.shortDescription, {
    maxChars: 64,
    maxLines: model.unavailable ? 2 : 2,
  });

  const cardTag = model.unavailable ? 'GathR' : `GathR ${kindLabel}`;
  const subtitleLine = model.unavailable
    ? 'Open GathR to discover current events and specials nearby.'
    : [model.venue, model.dateTimeLabel].filter(Boolean).join(' • ');

  const logoSvg = globeLogoDataUri
    ? `<image href="${globeLogoDataUri}" x="74" y="72" width="52" height="52" preserveAspectRatio="xMidYMid meet" />`
    : `<circle cx="100" cy="98" r="26" fill="#7fc4ff" />`;

  const textLogoSvg = textLogoDataUri
    ? `<image href="${textLogoDataUri}" x="138" y="79" width="170" height="38" preserveAspectRatio="xMinYMid meet" opacity="0.95" />`
    : `<text x="140" y="106" fill="#ffffff" font-size="30" font-weight="700" font-family="DejaVu Sans, Arial, sans-serif">GathR</text>`;

  const backgroundLayer = backgroundImageDataUri
    ? `
      <image href="${backgroundImageDataUri}" x="0" y="0" width="${OG_WIDTH}" height="${OG_HEIGHT}" preserveAspectRatio="xMidYMid slice" />
      <rect x="0" y="0" width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bgTint)" />
    `
    : `
      <rect x="0" y="0" width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#fallbackBg)" />
      <circle cx="1010" cy="-40" r="260" fill="rgba(127,196,255,0.22)" />
      <circle cx="140" cy="680" r="240" fill="rgba(74,144,226,0.18)" />
    `;

  const statusRibbon = model.unavailable
    ? `<rect x="72" y="140" rx="16" ry="16" width="256" height="38" fill="rgba(255,255,255,0.14)" />
       <text x="92" y="166" fill="#d8ecff" font-size="18" font-weight="600" font-family="DejaVu Sans, Arial, sans-serif">Shared link may no longer be active</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fallbackBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d2b4f" />
      <stop offset="45%" stop-color="#235f99" />
      <stop offset="100%" stop-color="#4A90E2" />
    </linearGradient>
    <linearGradient id="bgTint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(5,18,35,0.32)" />
      <stop offset="55%" stop-color="rgba(5,18,35,0.48)" />
      <stop offset="100%" stop-color="rgba(5,18,35,0.72)" />
    </linearGradient>
  </defs>

  ${backgroundLayer}

  <rect x="40" y="40" width="1120" height="550" rx="30" ry="30" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" />

  <text x="986" y="106" text-anchor="end" fill="#d8ecff" fill-opacity="0.95" font-size="18" font-weight="600" font-family="DejaVu Sans, Arial, sans-serif">${escapeXml(cardTag)}</text>

  ${statusRibbon}

  ${makeLineText(titleLines, {
    x: 76,
    y: model.unavailable ? 248 : 220,
    lineHeight: model.unavailable ? 56 : 58,
    fontSize: model.unavailable ? 46 : 48,
    fontWeight: 800,
    fill: '#ffffff',
  })}

  ${!model.unavailable && venueLines.length ? makeLineText(venueLines, {
    x: 78,
    y: 326,
    lineHeight: 30,
    fontSize: 24,
    fontWeight: 600,
    fill: '#d7ebff',
  }) : ''}

  ${!model.unavailable && dateLines.length ? makeLineText(dateLines, {
    x: 78,
    y: 362,
    lineHeight: 28,
    fontSize: 22,
    fontWeight: 500,
    fill: '#b8dfff',
  }) : ''}

  ${descLines.length ? makeLineText(descLines, {
    x: 78,
    y: model.unavailable ? 380 : 440,
    lineHeight: 28,
    fontSize: 21,
    fontWeight: 400,
    fill: '#eaf5ff',
    opacity: 0.92,
  }) : ''}

  <line x1="78" y1="502" x2="1120" y2="502" stroke="rgba(255,255,255,0.08)" />
  <text x="78" y="544" fill="#d0e8ff" font-size="19" font-weight="500" font-family="DejaVu Sans, Arial, sans-serif">${escapeXml(subtitleLine || 'Open in GathR')}</text>
  <text x="1120" y="544" text-anchor="end" fill="#ffffff" font-size="20" font-weight="700" font-family="DejaVu Sans, Arial, sans-serif">link.gathrapp.ca</text>
</svg>`;
}

function renderSvgToPng(svg) {
  const Resvg = getResvgCtor();
  if (!Resvg) {
    const err = new Error(`resvg renderer unavailable: ${String(resvgLoadError?.message || 'unknown error')}`);
    err.cause = resvgLoadError;
    throw err;
  }

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: OG_WIDTH,
    },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'DejaVu Sans',
    },
  });

  return resvg.render().asPng();
}

async function buildOgImageSvg(options) {
  const requestedType = options.requestedType === 'special' ? 'special' : 'event';
  const item = options.item || null;
  const model = buildPreviewModel(item, requestedType);
  const cacheKey = [
    requestedType,
    String(options.id || item?.id || ''),
    simpleHash(model.title),
    simpleHash(model.subtitleLine),
    simpleHash(model.shortDescription),
    simpleHash(model.imageUrl),
    model.unavailable ? 'u1' : 'u0',
  ].join(':');

  // Don't check cache here - SVG generation is fast, caching happens at PNG level
  const [brandAssets, backgroundImageDataUri] = await Promise.all([
    loadBrandAssets(),
    model.unavailable ? Promise.resolve('') : fetchRemoteImageDataUri(model.imageUrl),
  ]);

  const svg = buildOgSvg({
    model,
    requestedType,
    backgroundImageDataUri,
    globeLogoDataUri: brandAssets.globeLogoDataUri,
    textLogoDataUri: brandAssets.textLogoDataUri,
  });

  return {
    cacheKey,
    svg,
  };
}

async function generateOgImageBuffer(options) {
  const cacheKey = [
    options.requestedType === 'special' ? 'special' : 'event',
    String(options.id || options.item?.id || ''),
  ].join(':');

  // Check cache first (PNG buffers are expensive to generate)
  const cached = renderCache.get(cacheKey);
  if (cached) return cached;

  const { svg } = await buildOgImageSvg(options);

  if (!svg || typeof svg !== 'string') {
    throw new Error(`Invalid SVG: expected string, got ${typeof svg}`);
  }

  const pngBuffer = renderSvgToPng(svg);
  renderCache.set(cacheKey, pngBuffer);
  return pngBuffer;
}

module.exports = {
  OG_WIDTH,
  OG_HEIGHT,
  buildOgImageSvg,
  generateOgImageBuffer,
  getResvgCtor,
  renderCache,
  remoteImageCache,
};
