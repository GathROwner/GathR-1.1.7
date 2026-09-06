jest.mock('../../../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  firestore: {},
}));

import type { FirestoreEvent } from '../../../types/firestore';
import { normalizeFirestoreEvent, normalizeFirestoreTiming } from '../firestoreEvents';

const event = (overrides: Partial<FirestoreEvent> = {}): FirestoreEvent => ({
  id: 'timing-test',
  title: 'Timing test',
  description: 'Test',
  startDate: '2026-09-05',
  startTime: '19:00',
  endDate: '2026-09-05',
  endTime: '23:00',
  venueId: 'venue',
  venue: 'Venue',
  address: '1 Test Street',
  latitude: 46.2,
  longitude: -63.1,
  category: 'Other',
  isEvent: true,
  metadata: {},
  ...overrides,
});

describe('Firestore timing normalization', () => {
  it('turns a legacy category clock into a policy cutoff, not a displayed end', () => {
    const timing = normalizeFirestoreTiming(event({
      timeFlags: { start: { source: 'explicit' }, end: { source: 'none', toClose: false } },
      timeResolution: { endFromHours: 'category_default' },
    }));
    expect(timing.schedule.end.status).toBe('unknown');
    expect(timing.schedule.end.localTime).toBeNull();
    expect(timing.estimate).toMatchObject({
      confidence: 'low',
      discoveryCutoffTime: '11:00:00 PM',
      method: 'category_default',
    });
  });

  it('keeps an explicit organizer end as observed', () => {
    const normalized = normalizeFirestoreEvent(event({
      timeFlags: { start: { source: 'explicit' }, end: { source: 'explicit', toClose: false } },
    }));
    expect(normalized.timing?.schedule.end).toMatchObject({
      status: 'observed',
      localTime: '11:00:00 PM',
    });
  });

  it('keeps verified until-close semantics separate from an estimate', () => {
    const timing = normalizeFirestoreTiming(event({
      timeFlags: { start: { source: 'explicit' }, end: { source: 'semantic', toClose: true } },
      timeResolution: { endFromHours: 'to_close' },
    }));
    expect(timing.scheduleKind).toBe('until_close');
    expect(timing.schedule.end.status).toBe('until_close');
  });

  it('does not promote a legacy clock without provenance to an observed ending', () => {
    const timing = normalizeFirestoreTiming(event({ metadata: {} }));
    expect(timing.schedule.end.status).toBe('unknown');
    expect(timing.schedule.end.localTime).toBeNull();
    expect(timing.estimate).toMatchObject({
      confidence: 'low',
      discoveryCutoffTime: '11:00:00 PM',
    });
  });
});
