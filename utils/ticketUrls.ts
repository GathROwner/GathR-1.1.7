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

export const isValidTicketUrl = (value?: unknown): boolean =>
  Boolean(normalizeTicketUrl(value));

export const getTicketUrl = (source: TicketUrlSource): string => {
  const metadata = source.metadata;

  return (
    normalizeTicketUrl(source.ticketLinkEvents) ||
    normalizeTicketUrl(source.ticketLinkPosts) ||
    normalizeTicketUrl(source.ticketsBuyUrl) ||
    normalizeTicketUrl(source.ticketLink) ||
    normalizeTicketUrl(metadata?.ticketLinkEvents) ||
    normalizeTicketUrl(metadata?.ticketLinkPosts) ||
    normalizeTicketUrl(metadata?.ticketsBuyUrl) ||
    normalizeTicketUrl(metadata?.ticketLink)
  );
};
