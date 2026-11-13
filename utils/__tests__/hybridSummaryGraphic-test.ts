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

it('allows room for two-character friend counts and omits zero sections while retaining accessible totals', () => {
  const badge = friendBadgeGraphic(12);
  expect(badge.xml).toContain('>9+</text>');
  expect(badge.width).toBeGreaterThan(friendBadgeGraphic(1).width);
  const empty = clusterSummaryGraphic(2, 0, 0, true);
  expect(empty.xml).not.toContain('>0</text>');
  expect(empty.label).toContain('0 events; 0 specials; city-wide');
  const positive = clusterSummaryGraphic(2, 9, 0, false);
  expect(positive.xml).toContain('>9</text>'); expect(positive.xml).not.toContain('>0</text>');
  expect(positive.width).toBeLessThan(clusterSummaryGraphic(2, 9, 1, false).width);
});
