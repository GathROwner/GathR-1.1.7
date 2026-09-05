export interface TicketUrlSource {
  ticketLinkEvents?: unknown;
  ticketLinkPosts?: unknown;
  ticketsBuyUrl?: unknown;
  ticketLink?: unknown;
  metadata?: {
    ticketLinkEvents?: unknown;
    ticketLinkPosts?: unknown;
    ticketsBuyUrl?: unknown;
    ticketLink?: unknown;
  } | null;
}

// Some parser sources send a bare domain or a labeled value such as
// "Tickets | example.com/event". Preserve that legacy support while returning
// one clean URL for every ticket CTA.
export const normalizeTicketUrl = (value?: unknown): string => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue || rawValue.toUpperCase() === 'N/A') return '';

  const match = rawValue.match(
    /https?:\/\/[^\s<>"']+|(?:www\.)?(?=[a-z0-9.-]*[a-z])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s<>"']*)?/i
  );
  let candidate = match?.[0]?.replace(/[)\].,;:!?]+$/, '') || '';
  if (!candidate) return '';

  // A trailing hash with no fragment target is not useful and can interfere
  // with external browser routing. Keep meaningful fragments such as #tickets.
  candidate = candidate.replace(/#$/, '');

  return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
};

const NON_TICKET_OPERATIONAL_PATH_PATTERN =
  /\/(?:mall-|store-|business-|holiday-|opening-)?hours(?:\/|$)|\/(?:visit\/)?mall-hours(?:\/|$)/i;

export const isClearlyNonTicketUrl = (value?: unknown): boolean => {
  const normalized = normalizeTicketUrl(value);
  if (!normalized) return false;

  try {
    return NON_TICKET_OPERATIONAL_PATH_PATTERN.test(new URL(normalized).pathname);
  } catch {
    return false;
  }
};

export const normalizeTicketPurchaseUrl = (value?: unknown): string => {
  const normalized = normalizeTicketUrl(value);
  return normalized && !isClearlyNonTicketUrl(normalized) ? normalized : '';
};

export const isValidTicketUrl = (value?: unknown): boolean =>
  Boolean(normalizeTicketPurchaseUrl(value));

export const getTicketUrl = (source: TicketUrlSource): string => {
  const metadata = source.metadata;

  return (
    normalizeTicketPurchaseUrl(source.ticketLinkEvents) ||
    normalizeTicketPurchaseUrl(source.ticketLinkPosts) ||
    normalizeTicketPurchaseUrl(source.ticketsBuyUrl) ||
    normalizeTicketPurchaseUrl(source.ticketLink) ||
    normalizeTicketPurchaseUrl(metadata?.ticketLinkEvents) ||
    normalizeTicketPurchaseUrl(metadata?.ticketLinkPosts) ||
    normalizeTicketPurchaseUrl(metadata?.ticketsBuyUrl) ||
    normalizeTicketPurchaseUrl(metadata?.ticketLink)
  );
};
