jest.mock('../../../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  firestore: {},
}));

import { normalizeFirestoreEvent } from '../firestoreEvents';
import type { FirestoreEvent } from '../../../types/firestore';
import { getPrimaryNonTicketAction } from '../../../utils/eventActionLinks';

describe('Firestore ticket URL mapping', () => {
  it('maps the Come From Away ticketsBuyUrl into the app ticket CTA field', () => {
    const event = {
      id: 'i5rV9dIg2n9KwUD7R5gq',
      title: 'Come From Away (Charlottetown Festival)',
      description: '',
      startDate: '2026-08-06',
      startTime: '19:30',
      venueId: 'slug_confedcentre',
      venue: 'Confederation Centre',
      category: 'Live Theatre',
      isEvent: true,
      price: null,
      metadata: {
        ticketsBuyUrl: 'https://confederationcentre.com/event/come-from-away/#',
        ticketLink: 'https://confederationcentre.com/event/come-from-away/#',
      },
    } as FirestoreEvent;

    const normalized = normalizeFirestoreEvent(event);

    expect(normalized.ticketLinkEvents).toBe(
      'https://confederationcentre.com/event/come-from-away/'
    );
    expect(normalized.ticketPrice).toBe('Ticketed Event');
  });

  it('maps a classified HPI schedule without creating a ticket CTA', () => {
    const event = {
      id: 'L3NgkSMZqgvxRPryIJp0',
      title: 'Live Race Nights (Thursdays at Top of the Park)',
      description: '',
      startDate: '2026-08-06',
      startTime: '18:00',
      venueId: 'fb_100052606604879',
      venue: 'redshoresPEI',
      category: 'Live Music',
      isEvent: true,
      price: null,
      actionLinks: [
        {
          url: 'https://hpibet.com/Racing/Schedule',
          role: 'schedule',
          label: 'View Schedule',
        },
      ],
      metadata: {},
    } as FirestoreEvent;

    const normalized = normalizeFirestoreEvent(event);

    expect(normalized.ticketLinkEvents).toBe('');
    expect(normalized.ticketPrice).toBe('');
    expect(normalized.actionLinks).toEqual(event.actionLinks);
  });

  it('does not synthesize a ticket CTA from a mall-hours URL', () => {
    const mallHoursUrl = 'https://confedcourtmall.com/visit/mall-hours/';
    const event = {
      id: 'n1i4FeSuJmsDwsXPKupo',
      title: 'Confederation Court Mall Saturday Hours',
      description:
        'Mall open hours stated as part of a weekend reminder about free downtown parking on weekends.',
      startDate: '2026-08-29',
      startTime: '09:00',
      venueId: 'name_2lgcnn',
      venue: 'The Confederation Court Mall',
      category: 'Gatherings & Parties',
      isEvent: true,
      price: null,
      ticketsBuyUrl: mallHoursUrl,
      ticketLink: mallHoursUrl,
      actionLinks: [
        {
          url: mallHoursUrl,
          role: 'event_info',
          label: 'Event Info',
        },
      ],
      metadata: {},
    } as FirestoreEvent;

    const normalized = normalizeFirestoreEvent(event);

    expect(normalized.ticketLinkEvents).toBe('');
    expect(normalized.ticketsBuyUrl).toBe('');
    expect(normalized.ticketPrice).toBe('');
    expect(getPrimaryNonTicketAction(normalized)).toMatchObject({
      url: mallHoursUrl,
      role: 'event_info',
      label: 'Event Info',
    });
  });
});
