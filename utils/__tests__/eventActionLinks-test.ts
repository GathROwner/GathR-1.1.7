import { getPrimaryNonTicketAction } from '../eventActionLinks';

describe('getPrimaryNonTicketAction', () => {
  it('returns a schedule action with an honest neutral label', () => {
    expect(
      getPrimaryNonTicketAction({
        actionLinks: [
          {
            url: ' https://hpibet.com/Racing/Schedule ',
            role: 'schedule',
            label: 'View Schedule',
          },
        ],
      })
    ).toMatchObject({
      url: 'https://hpibet.com/Racing/Schedule',
      role: 'schedule',
      label: 'View Schedule',
    });
  });

  it('does not turn structured purchase links into neutral information actions', () => {
    expect(
      getPrimaryNonTicketAction({
        actionLinks: [
          { url: 'https://tickets.example.com/buy', role: 'ticket_purchase', label: 'Buy Tickets' },
        ],
      })
    ).toBeNull();
  });
});

