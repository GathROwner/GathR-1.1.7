import type { Cluster, Venue } from '../types/events';

export type HybridCategory = { key: string; category: string; type: 'event' | 'special'; count: number; isNew: boolean };
export type HybridVenue = { key: string; venue: Venue; photo: string; categories: HybridCategory[]; friendCount: number };
export const HYBRID_ACCENTS = ['#3478F6', '#8B5BD6', '#C3477D', '#147CAA', '#B56A23', '#4769AF'];

/** Both Current and Hybrid use Streets; Standard and GathR use the imported basemap. */
export const usesCurrentBasemap = (style: string) => style === 'current' || style === 'hybrid';

export function buildHybridVenues(cluster: Cluster, isNew: (venueKey: string, ids: string[]) => boolean): HybridVenue[] {
  return [...cluster.venues].sort((a, b) => a.locationKey.localeCompare(b.locationKey)).map(venue => {
    const grouped = new Map<string, { category: string; type: 'event' | 'special'; ids: Set<string> }>();
    for (const event of venue.events) {
      const category = event.category?.trim() || 'Other';
      const key = `${event.type}:${category.toLowerCase()}`;
      const group = grouped.get(key) ?? { category, type: event.type, ids: new Set<string>() };
      group.ids.add(String(event.id));
      grouped.set(key, group);
    }
    const categories = [...grouped.entries()].map(([key, group]) => ({
      key, category: group.category, type: group.type, count: group.ids.size,
      isNew: isNew(venue.locationKey, [...group.ids]),
    })).sort((a, b) => a.type.localeCompare(b.type) || a.category.localeCompare(b.category));
    const photo = venue.events.map(event => event.profileUrl?.trim()).find(url => /^https?:\/\//i.test(url || '')) || '';
    return { key: venue.locationKey, venue, photo, categories, friendCount: cluster.friendPresence?.venues?.[venue.locationKey]?.friendCount ?? 0 };
  });
}

export function visibleHybridCategories(categories: HybridCategory[]) {
  const ranked = [...categories].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, 3);
  return { visible: categories.filter(item => ranked.includes(item)), hiddenNew: categories.some(item => !ranked.includes(item) && item.isNew), overflow: Math.max(0, categories.length - 3) };
}
