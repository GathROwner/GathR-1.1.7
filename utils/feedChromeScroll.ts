export type FeedChromeScrollState = {
  y: number;
  travel: number;
  hidden: boolean;
};

export const initialFeedChromeScrollState = (): FeedChromeScrollState => ({
  y: 0, travel: 0, hidden: false,
});

// Accumulate small movements so slow swipes work, while tiny reversals and
// overscroll bounce don't make the controls flicker.
export function advanceFeedChromeScroll(
  previous: FeedChromeScrollState,
  offset: number,
  maxOffset: number,
): FeedChromeScrollState {
  const y = Math.max(0, Math.min(offset, Math.max(0, maxOffset)));
  if (y <= 20) return { y, travel: 0, hidden: false };
  const delta = y - previous.y;
  const travel = Math.sign(delta) === Math.sign(previous.travel) || delta === 0
    ? previous.travel + delta : delta;
  const hidden = travel >= 12 && y > 50 ? true : travel <= -8 ? false : previous.hidden;
  return { y, travel, hidden };
}
