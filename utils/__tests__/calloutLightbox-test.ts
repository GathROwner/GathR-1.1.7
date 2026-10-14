import type { Event } from '../../types/events';
import { openCalloutLightbox, navigateCalloutLightbox, shouldDismissCalloutLightbox } from '../calloutLightbox';

const event = (id: string | number, type = 'event') => ({ id, type, imageUrl: `image-${id}`, title: String(id) } as Event);

it('opens at the tapped item in displayed order and keeps its refreshed fields', () => {
  const list = [event('later'), event(2), event('earlier')];
  const refreshed = { ...list[1], title: 'Fresh title' };
  const selected = openCalloutLightbox('tapped-photo', refreshed, list);
  expect(selected).toMatchObject({ imageUrl: 'tapped-photo', currentIndex: 1, event: refreshed });
  expect(selected.events.map((item) => item.id)).toEqual(['later', 2, 'earlier']);
  expect(selected.events[1]).toBe(refreshed);
  expect(list[1].title).toBe('2');
});

it('keeps events and specials separate and supports string/numeric IDs', () => {
  const list = [event(1), event('s1', 'special'), event('2'), event('s2', 'special')];
  expect(openCalloutLightbox('image', event('1'), list).events.map((item) => item.id)).toEqual(['1', '2']);
  const specials = openCalloutLightbox('image', list[3], list);
  expect(specials.currentIndex).toBe(1);
  expect(specials.events.map((item) => item.id)).toEqual(['s1', 's2']);
});

it('retains only the clicked item if a refreshing list no longer contains it', () => {
  const tapped = event('gone');
  expect(openCalloutLightbox('photo', tapped, [event('other')])).toEqual({
    imageUrl: 'photo', event: tapped, events: [tapped], currentIndex: 0,
  });
});

it('navigates event and image together and never wraps or exits the provided list', () => {
  const list = [event('a'), { ...event('b'), imageUrl: '', profileUrl: 'profile-b' }];
  const first = openCalloutLightbox('photo-a', list[0], list);
  const second = navigateCalloutLightbox(first, 1);
  expect(second).toMatchObject({ currentIndex: 1, event: list[1], imageUrl: 'profile-b' });
  expect(second.events).toBe(first.events);
  for (const invalid of [-1, 2, 0.5, NaN]) expect(navigateCalloutLightbox(first, invalid)).toBe(first);
  expect(navigateCalloutLightbox(second, 0).event).toBe(list[0]);
});

it('dismisses deliberate downward pulls without depending on a valid release velocity', () => {
  const input = { ended: true, x: 4, y: 80, velocityY: 0 };
  expect(shouldDismissCalloutLightbox(input)).toBe(true);
  expect(shouldDismissCalloutLightbox({ ...input, velocityY: NaN })).toBe(true);
  expect(shouldDismissCalloutLightbox({ ...input, y: 24, velocityY: 350 })).toBe(true);
  expect(shouldDismissCalloutLightbox({ ...input, y: 24, velocityY: 350, allowFlick: false })).toBe(false);
  for (const change of [{ ended: false }, { y: -180 }, { y: 24 },
    { y: 4, velocityY: 900 }, { x: 180 }, { y: NaN }]) {
    expect(shouldDismissCalloutLightbox({ ...input, ...change })).toBe(false);
  }
});
