import {
  getTicketUrl,
  isClearlyNonTicketUrl,
  normalizeTicketPurchaseUrl,
  normalizeTicketUrl,
} from '../ticketUrls';

describe('ticket URL resolution', () => {
  it('uses the documented field precedence', () => {
    const source = {
      ticketLinkEvents: 'https://example.com/1',
      ticketLinkPosts: 'https://example.com/2',
      ticketsBuyUrl: 'https://example.com/3',
      ticketLink: 'https://example.com/4',
      metadata: {
        ticketLinkEvents: 'https://example.com/5',
        ticketLinkPosts: 'https://example.com/6',
        ticketsBuyUrl: 'https://example.com/7',
        ticketLink: 'https://example.com/8',
      },
    };

    const orderedKeys = [
      'ticketLinkEvents',
      'ticketLinkPosts',
      'ticketsBuyUrl',
      'ticketLink',
      'metadata.ticketLinkEvents',
      'metadata.ticketLinkPosts',
      'metadata.ticketsBuyUrl',
      'metadata.ticketLink',
    ];

    orderedKeys.forEach((expectedKey, index) => {
      const candidate = structuredClone(source);
      orderedKeys.slice(0, index).forEach((key) => {
        if (key.startsWith('metadata.')) {
          candidate.metadata[key.replace('metadata.', '') as keyof typeof candidate.metadata] = '';
        } else {
          candidate[key as keyof Omit<typeof candidate, 'metadata'>] = '';
        }
      });

      expect(getTicketUrl(candidate)).toBe(`https://example.com/${index + 1}`);
      expect(expectedKey).toBe(orderedKeys[index]);
    });
  });

  it('normalizes the Come From Away backend URL and removes a hash-only fragment', () => {
    const comeFromAway = {
      ticketsBuyUrl: '  https://confederationcentre.com/event/come-from-away/#  ',
      ticketLink: 'https://confederationcentre.com/event/come-from-away/#',
    };

    expect(getTicketUrl(comeFromAway)).toBe(
      'https://confederationcentre.com/event/come-from-away/'
    );
  });

  it('keeps meaningful fragments and legacy labeled or bare-domain URLs', () => {
    expect(normalizeTicketUrl('https://example.com/event#tickets')).toBe(
      'https://example.com/event#tickets'
    );
    expect(normalizeTicketUrl('Tickets | example.com/event')).toBe(
      'https://example.com/event'
    );
  });

  it('does not treat ticketPrice as a URL fallback', () => {
    expect(
      getTicketUrl({ ticketPrice: 'https://example.com/legacy-price-url' } as never)
    ).toBe('');
  });

  it('does not treat the Confederation Court mall-hours page as ticket sales', () => {
    const mallHoursUrl = 'https://confedcourtmall.com/visit/mall-hours/';

    expect(isClearlyNonTicketUrl(mallHoursUrl)).toBe(true);
    expect(normalizeTicketPurchaseUrl(mallHoursUrl)).toBe('');
    expect(
      getTicketUrl({
        ticketLinkEvents: mallHoursUrl,
        ticketsBuyUrl: mallHoursUrl,
        ticketLink: mallHoursUrl,
      })
    ).toBe('');
  });
});
