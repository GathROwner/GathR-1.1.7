jest.mock('firebase/firestore', () => ({}));
jest.mock('../../../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  firestore: {},
}));

import { Event } from '../../../types/events';
import { mergePrivateSharedEvents } from '../events';

const baseEvent = (overrides: Partial<Event>): Event => ({
  id: 'fb_public-event',
  type: 'event',
  source: 'firestore',
  category: 'Live Music',
  title: 'Mike and Karen Penton',
  description: 'Old public description',
  venueId: 'slug_peakesquaycharlottetown',
  venue: "Peake's Quay",
  address: '11 Great George St, Charlottetown, PE',
  startDate: '2026-08-22',
  endDate: '2026-08-22',
  startTime: '9:00:00 PM',
  endTime: '11:00:00 PM',
  ticketPrice: '',
  profileUrl: 'https://example.com/venue.jpg',
  imageUrl: 'https://example.com/old-public.jpg',
  SharedPostThumbnail: '',
  latitude: 46.2321161,
  longitude: -63.1228403,
  ticketLinkPosts: '',
  ticketLinkEvents: '',
  mediaUrls: ['https://example.com/old-public.jpg'],
  likes: 4,
  ...overrides,
});

describe('private shared event reconciliation', () => {
  it('shows the contributor one corrected occurrence when public time and media are stale', () => {
    const privateEvent = baseEvent({
      id: 'shared_private-event',
      source: 'private_shared',
      title: 'Mike & Karen Penton',
      description: 'Confirmed from the user photo',
      venue: 'Peakes Quay Restaurant & Bar',
      startTime: '7:00:00 PM',
      endTime: '10:00:00 PM',
      imageUrl: 'https://example.com/user-poster.jpg',
      mediaUrls: ['https://example.com/user-poster.jpg'],
      likes: undefined,
      sharedEventProvenance: {
        sharedByCurrentUser: true,
        privateEventId: 'private-event',
        label: 'Shared by you',
      },
    });

    const result = mergePrivateSharedEvents([baseEvent({})], [privateEvent]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'fb_public-event',
      source: 'firestore',
      title: 'Mike & Karen Penton',
      startTime: '7:00:00 PM',
      endTime: '10:00:00 PM',
      imageUrl: 'https://example.com/user-poster.jpg',
      mediaUrls: ['https://example.com/user-poster.jpg'],
      likes: 4,
      sharedEventProvenance: {
        sharedByCurrentUser: true,
        privateEventId: 'private-event',
      },
    });
  });

  it('does not merge distinct same-day acts at the same venue', () => {
    const result = mergePrivateSharedEvents(
      [baseEvent({ title: 'MacPhee Brothers', startTime: '7:00:00 PM' })],
      [baseEvent({
        id: 'shared_private-event',
        source: 'private_shared',
        title: 'Mike & Karen Penton',
        startTime: '7:00:00 PM',
      })]
    );

    expect(result).toHaveLength(2);
  });
});
