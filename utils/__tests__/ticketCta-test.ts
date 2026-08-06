import { getBuyTicketsLabel, getDisplayableTicketPrice } from '../ticketCta';

describe('ticket CTA labels', () => {
  it.each([undefined, '', 'N/A', '0', 'Ticketed Event'])(
    'hides the non-price marker %p',
    (price) => {
      expect(getDisplayableTicketPrice(price)).toBe('');
      expect(getBuyTicketsLabel(price)).toBe('Buy Tickets');
    }
  );

  it('includes a reliable price in the CTA', () => {
    expect(getBuyTicketsLabel('  CA $20  ')).toBe('Buy Tickets · CA $20');
  });
});
