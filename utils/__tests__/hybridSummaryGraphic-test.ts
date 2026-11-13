import { clusterSummaryGraphic, friendBadgeGraphic, venueSummaryGraphic } from '../hybridSummaryGraphic';

it('draws all category counts, glyph outlines, separators and category-specific new dots in the export', () => {
  const result = venueSummaryGraphic([
    { key: 'music', category: 'Music', type: 'event', count: 2, isNew: true },
    { key: 'food', category: 'Food', type: 'special', count: 15, isNew: false },
  ], 1, false, '#3478F6', name => name === 'Music' ? 'audiotrack' : 'restaurant');
  expect(result.xml).toContain('>2</text>'); expect(result.xml).toContain('>15</text>');
  expect(result.xml.match(/<path fill=/g)).toHaveLength(3);
  expect(result.xml.match(/stroke="#CBD8DD"/g)).toHaveLength(2);
  expect(result.xml.match(/fill="#EF5A59"/g)).toHaveLength(1);
  expect(result.label).toContain('Music: 2, new content; Food: 15; 1 more categories');
});

it('keeps the static venue ring, house and every cluster total together for single and large clusters', () => {
  for (const venues of [1, 4, 126]) {
    const result = clusterSummaryGraphic(venues, 241, 61, false);
    for (const value of [venues, 241, 61]) expect(result.xml).toContain(`>${value}</text>`);
    expect(result.xml.match(/<path fill=/g)).toHaveLength(3);
    expect(result.xml.match(/stroke="#8DA8B8"/g)).toHaveLength(venues > 12 ? 1 : venues);
    expect(result.xml).not.toContain('#3478F6');
    expect(result.width).toBeGreaterThan(100);
  }
});

it('allows room for two-character friend counts and keeps zero totals visible', () => {
  const badge = friendBadgeGraphic(12);
  expect(badge.xml).toContain('>9+</text>');
  expect(badge.width).toBeGreaterThan(friendBadgeGraphic(1).width);
  expect(clusterSummaryGraphic(2, 0, 0, true).xml.match(/>0<\/text>/g)).toHaveLength(2);
  expect(clusterSummaryGraphic(2, 0, 0, true).label).toContain('city-wide');
});
