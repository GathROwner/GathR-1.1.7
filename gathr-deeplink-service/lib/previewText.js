const DEFAULT_META_DESCRIPTION_MAX_CHARS = 140;
const DEFAULT_CARD_DESCRIPTION_MAX_CHARS = 120;

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxChars = DEFAULT_META_DESCRIPTION_MAX_CHARS) {
  const text = normalizeWhitespace(value);
  if (!text) return '';
  if (text.length <= maxChars) return text;

  const slice = text.slice(0, Math.max(0, maxChars - 1));
  const safeSlice = slice.replace(/\s+\S*$/, '').trim() || slice.trim();
  return `${safeSlice}\u2026`;
}

function parseDateParts(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseTimeParts(timeStr) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || '').trim());
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function formatEventDateTimeLabel(item) {
  const dateParts = parseDateParts(item?.startDate);
  if (!dateParts) return '';

  const timeParts = parseTimeParts(item?.startTime);
  const dateObj = new Date(Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts?.hour ?? 0,
    timeParts?.minute ?? 0,
    0
  ));

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dateObj);

  if (!timeParts) return dateLabel;

  const timeLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  }).format(dateObj);

  return `${dateLabel} at ${timeLabel}`;
}

function pickBestImageUrl(item) {
  const candidates = [
    item?.imageUrl,
    item?.relevantImageUrl,
    item?.SharedPostThumbnail,
  ];

  for (const candidate of candidates) {
    const value = normalizeWhitespace(candidate);
    if (/^https?:\/\//i.test(value)) return value;
  }

  // Prefer category/type fallback art for share previews instead of tiny venue/profile icons.
  const categoryFallbackUrl = getFallbackImageUrl(item?.category, item?.type);
  if (categoryFallbackUrl) {
    return categoryFallbackUrl;
  }

  // Last resort: use profile/venue image if available.
  const profileUrl = normalizeWhitespace(item?.profileUrl);
  if (/^https?:\/\//i.test(profileUrl)) return profileUrl;

  return '';
}

function getFallbackImageUrl(category, type) {
  const domain = process.env.LINK_DOMAIN || 'link.gathrapp.ca';
  const normalizedCategory = normalizeWhitespace(category).toLowerCase();

  // Category-specific fallbacks (normalized + aliases)
  const categoryMap = {
    'live music': 'live-music.webp',
    'trivia night': 'trivia-night.webp',
    'comedy': 'comedy.webp',
    'cinema': 'Cinema.webp',
    'workshops & classes': 'workshops.webp',
    'workshops and classes': 'workshops.webp',
    'workshops': 'workshops.webp',
    'religious': 'religious.webp',
    'sports': 'sports.webp',
    'family friendly': 'family-friendly.webp',
    'family-friendly': 'family-friendly.webp',
    'social gatherings & parties': 'social-gatherings.webp',
    'gatherings & parties': 'social-gatherings.webp',
    'social gatherings': 'social-gatherings.webp',
    'happy hour': 'happy-hour.webp',
    'wing night': 'wing-night.webp',
    'food special': 'food-special.webp',
    'food_special': 'food-special.webp',
    'drink special': 'drink-special.webp',
    'drink_special': 'drink-special.webp',
  };

  if (normalizedCategory && categoryMap[normalizedCategory]) {
    return `https://${domain}/fallbacks/${categoryMap[normalizedCategory]}`;
  }

  // Type defaults
  const fallbackFile = type === 'special' ? 'special-default.webp' : 'event-default.webp';
  return `https://${domain}/fallbacks/${fallbackFile}`;
}

function wrapTextLines(value, options = {}) {
  const maxChars = Number(options.maxChars || 32);
  const maxLines = Number(options.maxLines || 2);
  const text = normalizeWhitespace(value);
  if (!text) return [];

  const words = text.split(' ');
  const lines = [];
  let current = '';
  let truncated = false;

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word.slice(0, maxChars));
      current = word.slice(maxChars);
    }

    if (lines.length >= maxLines) {
      truncated = true;
      current = '';
      break;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  } else if (current) {
    truncated = true;
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
    truncated = true;
  }

  if (truncated && lines.length > 0) {
    const last = lines[lines.length - 1];
    const clipped = last.length >= maxChars ? last.slice(0, Math.max(0, maxChars - 1)) : last;
    lines[lines.length - 1] = `${clipped.replace(/\s+\S*$/, '').trim() || clipped.trim()}\u2026`;
  }

  return lines;
}

function buildUnavailableDescription(kindLabel) {
  const lower = kindLabel.toLowerCase();
  return `The shared ${lower} may have ended or is no longer available. Open GathR to explore current events and specials near you.`;
}

function buildPreviewModel(item, requestedType) {
  const kindLabel = requestedType === 'special' ? 'Special' : 'Event';
  const itemTitle = normalizeWhitespace(item?.title);
  const venue = normalizeWhitespace(item?.venue);
  const dateTimeLabel = formatEventDateTimeLabel(item);
  const description = normalizeWhitespace(item?.description);
  const unavailable = !item;

  if (unavailable) {
    const unavailableTitle = `This ${kindLabel.toLowerCase()} may have ended`;
    return {
      unavailable: true,
      kindLabel,
      title: unavailableTitle,
      venue: '',
      dateTimeLabel: '',
      subtitleLine: '',
      description: '',
      shortDescription: buildUnavailableDescription(kindLabel),
      metaTitle: unavailableTitle,
      metaDescription: buildUnavailableDescription(kindLabel),
      pageTitle: `GathR - ${unavailableTitle}`,
      pageHeading: unavailableTitle,
      pageSubheading: 'Open GathR to explore what is happening nearby.',
      imageUrl: '',
    };
  }

  const shortDescription = truncateText(description, DEFAULT_META_DESCRIPTION_MAX_CHARS);
  const cardDescription = truncateText(description, DEFAULT_CARD_DESCRIPTION_MAX_CHARS);
  const subtitleLine = [venue, dateTimeLabel].filter(Boolean).join(' \u2022 ');
  const fallbackDescription = truncateText(subtitleLine, DEFAULT_META_DESCRIPTION_MAX_CHARS)
    || 'Discover local events and specials near you';

  return {
    unavailable: false,
    kindLabel,
    title: itemTitle || `GathR ${kindLabel}`,
    venue,
    dateTimeLabel,
    subtitleLine,
    description,
    shortDescription: shortDescription || fallbackDescription,
    cardDescription: cardDescription || fallbackDescription,
    metaTitle: itemTitle || `View ${kindLabel} on GathR`,
    metaDescription: shortDescription || fallbackDescription,
    pageTitle: `GathR - ${itemTitle || `View ${kindLabel}`}`,
    pageHeading: itemTitle || `View ${kindLabel} on GathR`,
    pageSubheading: subtitleLine || 'Open this link in GathR',
    imageUrl: pickBestImageUrl(item),
  };
}

module.exports = {
  DEFAULT_META_DESCRIPTION_MAX_CHARS,
  normalizeWhitespace,
  truncateText,
  formatEventDateTimeLabel,
  pickBestImageUrl,
  wrapTextLines,
  buildPreviewModel,
};
