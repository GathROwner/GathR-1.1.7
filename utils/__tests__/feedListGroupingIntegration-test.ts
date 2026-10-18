import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import type { Event } from '../../types/events';
import { createVenueFeedGrouping, groupVenueFeedEvents } from '../venueFeedGroups';

const frozen = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/feedListBuilders-baseline.json.txt'), 'utf8'));
function currentBuilder(tab: string) {
  const text = fs.readFileSync(path.join(__dirname, '../../app/(tabs)', `${tab}.tsx`), 'utf8');
  const ast = ts.createSourceFile(`${tab}.tsx`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === `${tab}WithAds`) {
      callback = (node.initializer as ts.CallExpression).arguments[0].getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!callback) throw new Error(`Missing actual ${tab} builder`);
  return callback;
}
function compile(callback: string) {
  const code = ts.transpileModule(`const build = ${callback};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return (environment: Record<string, unknown>) => new Function(...Object.keys(environment), `${code};return build();`)(...Object.values(environment));
}
const record = (i: number, type: Event['type']): Event => ({
  id: `id-${i}`, venue: `Venue ${Math.floor(i / 3)}`, address: `${Math.floor(i / 3)} Main St, Charlottetown`,
  latitude: 46.2, longitude: -63.1, title: `Title ${i}`, type,
  startDate: '2026-10-18', endDate: '2026-10-18', startTime: `${8 + i % 3}:00`, endTime: '23:00',
} as Event);

describe.each(['events', 'specials'])('%s actual list/ad integration', tab => {
  const oldBuilder = compile(frozen[tab]);
  const newBuilder = compile(currentBuilder(tab));
  it('preserves every row, ad object/placement/key, divider count and low-count fallback across pagination', () => {
    const type = tab === 'events' ? 'event' : 'special';
    const plural = tab === 'events' ? 'Events' : 'Specials';
    for (const viewportCount of [0, 1, 3, 12]) for (const outsideCount of [0, 3, 90]) {
      const all = Array.from({ length: viewportCount + outsideCount }, (_, i) => record(i, type));
      const viewport = all.slice(0, viewportCount), outside = all.slice(viewportCount);
      const rankedViewport = viewport.slice().reverse();
      const legacyViewport = groupVenueFeedEvents(rankedViewport, all);
      const visible = new Set(legacyViewport.map(group => group.key));
      const index = createVenueFeedGrouping(viewport, outside);
      const newViewport = index.groupViewport(rankedViewport);
      for (const limit of [10, 30, 50]) {
        const prefix = outside.slice(0, limit + 20).reverse();
        const legacyOutside = groupVenueFeedEvents([...prefix, ...outside]).filter(group => !visible.has(group.key));
        const next = index.groupOutside(prefix, newViewport, limit);
        for (const adCount of [0, 1, 20]) {
          const nativeAds = Array.from({ length: adCount }, (_, i) => ({
            ad: i % 7 === 6 ? null : { headline: `Ad ${i}`, advertiser: 'Test', body: 'Body' }, loading: i % 11 === 10,
          }));
          const environment = {
            measureListTabStage: (_tab: string, _stage: string, _details: unknown, work: () => unknown) => work(),
            markTabListDataReady: () => undefined,
            isFocusedContentReady: true, nativeAds, outsideViewportLoadCount: limit,
            [`filteredOutsideViewport${plural}`]: outside,
            getAdListKey: (ad: typeof nativeAds[number], i: number) => `ad-${i}-${ad.ad?.headline}`,
          };
          const previous = oldBuilder({ ...environment, viewportVenueGroups: legacyViewport, outsideVenueGroups: legacyOutside });
          const current = newBuilder({ ...environment, viewportVenueGroups: newViewport, outsideVenueGroups: next.groups, outsideVenueCount: next.totalCount });
          expect(current).toEqual(previous);
          current.filter((item: any) => item.type === 'ad').forEach((item: any) => {
            expect(nativeAds.some(ad => ad.ad === item.data.ad)).toBe(true);
          });
          // Native ad demand still uses total venue count plus the requested page limit.
          expect(Math.min(next.totalCount, limit)).toBe(Math.min(legacyOutside.length, limit));
        }
      }
    }
  });
});
