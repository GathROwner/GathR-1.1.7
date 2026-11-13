import { useUserPrefsStore } from '../store/userPrefsStore';

/** A choice on another card must not redraw this card. Read full arrays at action time. */
export function useEventPreferenceFlags(eventId: string) {
  const isHeroLiked = useUserPrefsStore(state => state.likedEvents.includes(eventId));
  const isInterested = useUserPrefsStore(state => state.interestedEvents.includes(eventId));
  return { isHeroLiked, isInterested };
}
