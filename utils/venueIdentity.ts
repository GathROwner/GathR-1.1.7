const SOCIAL_ACTION_TAIL =
  /\b(added|shared|posted)\s+(a\s+)?(new\s+)?(photo|photos|post|event|reel|video)\b.*$/;

const BUSINESS_SUFFIX_TAIL =
  /\b(restaurant\s+and\s+bar|restaurant\s+bar|bar\s+and\s+restaurant|restaurant)\b$/;

const normalizeBasicVenueText = (value: unknown): string =>
  String(value ?? '')
    .split('|')[0]
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b([a-z0-9]+)\s+s\b/g, '$1s')
    .trim()
    .replace(/\s+/g, ' ');

const collapseRepeatedPhrase = (value: string): string => {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length % 2 !== 0) return value;

  const midpoint = tokens.length / 2;
  const firstHalf = tokens.slice(0, midpoint);
  const secondHalf = tokens.slice(midpoint);
  const repeated = firstHalf.every((token, index) => token === secondHalf[index]);
  return repeated ? firstHalf.join(' ') : value;
};

export const normalizeVenueIdentityText = (value: unknown): string => {
  let normalized = normalizeBasicVenueText(value);
  if (!normalized) return '';

  normalized = normalized.replace(SOCIAL_ACTION_TAIL, '').trim();
  normalized = collapseRepeatedPhrase(normalized);
  normalized = normalized.replace(BUSINESS_SUFFIX_TAIL, '').trim();
  normalized = collapseRepeatedPhrase(normalized);

  return normalized.replace(/\s+/g, ' ');
};
