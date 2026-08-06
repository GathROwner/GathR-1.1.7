const HIDDEN_TICKET_PRICE_VALUES = new Set(['', 'n/a', '0', 'ticketed event']);

export const getDisplayableTicketPrice = (price?: string): string => {
  const trimmed = price?.trim() ?? '';
  return HIDDEN_TICKET_PRICE_VALUES.has(trimmed.toLowerCase()) ? '' : trimmed;
};

export const getBuyTicketsLabel = (price?: string): string => {
  const displayPrice = getDisplayableTicketPrice(price);
  return displayPrice ? `Buy Tickets · ${displayPrice}` : 'Buy Tickets';
};
