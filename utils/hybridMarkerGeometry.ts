import type { HybridVenue } from './hybridClusterPresentation';
import { visibleHybridCategories } from './hybridClusterPresentation';
import { clusterSummaryGraphic, friendBadgeGraphic, venueSummarySize } from './hybridSummaryGraphic';

/** Reserve the complete rotation envelope; timing halos deliberately stay outside these bounds. */
export function hybridMarkerGeometry(venues: HybridVenue[], photoSize: number, events: number, specials: number, city: boolean) {
  const stroke = 3.15, ringSize = photoSize + stroke * 2, center = ringSize / 2, radius = center - .45;
  const angle = (at: number) => venues.length === 1 ? -Math.PI / 4 : -Math.PI / 2 + 2 * Math.PI * (at + .5) / Math.max(1, venues.length);
  const headers = venues.map(v => {
    const { visible, overflow } = visibleHybridCategories(v.categories);
    return visible.length ? venueSummarySize(visible, overflow) : null;
  });
  const headerHeight = Math.max(0, ...headers.map(header => header?.height ?? 0));
  const friends = venues.map((venue, index) => ({ ...venue, index })).filter(v => v.friendCount > 0);
  const topGap = Math.max(headerHeight ? 3.6 : 0, ...friends.map(v => 8.55 - center - (radius + 16.2) * Math.sin(angle(v.index))));
  const bottomGap = Math.max(3.6, ...friends.map(v => center + (radius + 16.2) * Math.sin(angle(v.index)) + 8.55 - ringSize));
  const friendsWidth = Math.max(0, ...friends.map(v => 2 * (Math.abs((radius + 16.2) * Math.cos(angle(v.index))) + friendBadgeGraphic(v.friendCount).width / 2)));
  const summary = clusterSummaryGraphic(venues.length, events, specials, city);
  const width = Math.max(ringSize, friendsWidth, summary.width, ...headers.map(header => header?.width ?? 0));
  const height = headerHeight + topGap + ringSize + bottomGap + summary.height;
  return { stroke, ringSize, center, radius, angle, headerHeight, topGap, bottomGap, width, height };
}
