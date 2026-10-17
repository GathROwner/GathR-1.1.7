import type { Event } from '../types/events';

export type CalloutLightboxSelection = {
  imageUrl: string;
  event: Event;
  events: Event[];
  currentIndex: number;
};

/** Snapshot the already-filtered, already-ordered list, without ads or another tab/venue. */
export function openCalloutLightbox(imageUrl: string, event: Event, list: readonly Event[]): CalloutLightboxSelection {
  const events = list.filter((candidate) => candidate.type === event.type);
  const currentIndex = events.findIndex((candidate) => String(candidate.id) === String(event.id));
  if (currentIndex < 0) {
    // A stale card can still be tapped while its list is being refreshed.
    return { imageUrl, event, events: [event], currentIndex: 0 };
  }
  events[currentIndex] = event;
  return { imageUrl, event, events, currentIndex };
}

export function navigateCalloutLightbox(selection: CalloutLightboxSelection, index: number): CalloutLightboxSelection {
  if (!Number.isInteger(index) || index < 0 || index >= selection.events.length) return selection;
  const event = selection.events[index];
  return { ...selection, event, imageUrl: event.imageUrl || event.profileUrl || '', currentIndex: index };
}

export function shouldDismissCalloutLightbox({ ended, allowFlick = true, x, y, velocityY }: {
  ended: boolean; allowFlick?: boolean; x: number; y: number; velocityY: number;
}): boolean {
  // Native translations are points, not screen pixels. A deliberate pull is
  // enough even if iOS ends it with CANCELLED or has no usable final velocity.
  return ended && [x, y].every(Number.isFinite) && y > Math.abs(x) * 1.35
    && (y >= 80 || (allowFlick && y >= 20 && Number.isFinite(velocityY) && velocityY >= 300));
}

/** Media paging is already axis-locked by native recognition; allow normal drift. */
export function getCalloutLightboxSwipeDirection({ x, y, width, velocityX, velocityY, allowFlick = true }: {
  x: number; y: number; width: number; velocityX: number; velocityY: number; allowFlick?: boolean;
}): -1 | 1 | null {
  if (![x, y, width].every(Number.isFinite) || width <= 0 || Math.abs(x) < Math.abs(y) * 1.1) return null;
  // Native activation has already consumed part of the finger's travel.
  const distance = Math.max(20, Math.min(32, width * 0.05));
  const drag = Math.abs(x) >= distance;
  const flick = allowFlick && Math.abs(x) >= 16 && Number.isFinite(velocityX)
    && Math.abs(velocityX) >= 300 && Math.sign(velocityX) === Math.sign(x)
    && (!Number.isFinite(velocityY) || Math.abs(velocityX) > Math.abs(velocityY));
  return drag || flick ? x < 0 ? 1 : -1 : null;
}
