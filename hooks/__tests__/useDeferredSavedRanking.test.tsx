import React from 'react';
import renderer, { act } from 'react-test-renderer';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { useDeferredSavedRanking } from '../useDeferredSavedRanking';
import { groupVenueFeedEvents } from '../../utils/venueFeedGroups';
import type { Event } from '../../types/events';

let mockFocused = true;
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused }));

function screenExpression(tab: string, name: string) {
  const file = path.join(__dirname, '../../app/(tabs)', `${tab}.tsx`);
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) {
      expression = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!expression) throw Error(`Missing screen expression ${tab}/${name}`);
  return expression;
}

function execute(expression: string, environment: Record<string, unknown>, argument?: unknown) {
  const js = ts.transpileModule(`const callback = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return Function(...Object.keys(environment), 'argument', `${js}; return callback(argument);`)(...Object.values(environment), argument);
}

type Props = { savedIds: string[]; context?: string; ready?: boolean; page?: number };
let tree: renderer.ReactTestRenderer | undefined;
beforeEach(() => { mockFocused = true; jest.useFakeTimers(); });
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
  jest.useRealTimers();
});

describe.each(['events', 'specials'])('%s deferred saved-first browse session', tab => {
  const type = tab === 'events' ? 'event' : 'special';
  const records = Array.from({ length: 120 }, (_, i) => ({
    id: `item-${i}`, type, title: `Item ${i}`, venue: `Venue ${Math.floor(i / 2)}`,
    address: `${Math.floor(i / 2)} Main St, Charlottetown`, latitude: 46.2, longitude: -63.1,
    startDate: '2026-11-01', endDate: '2026-11-01', startTime: '12:00', endTime: '14:00',
    rankScore: 120 - i,
  } as Event & { rankScore: number }));
  const rankingExpression = screenExpression(tab, tab === 'events' ? 'sortAndPrioritizeEvents' : 'sortAndPrioritizeSpecials');
  const filterExpression = screenExpression(tab, tab === 'events' ? 'filteredViewportEvents' : 'filteredViewportSpecials');

  function Feed({ savedIds, context = 'user-a/upcoming', ready = true, page = 10 }: Props) {
    const ranking = useDeferredSavedRanking(savedIds, context, ready);
    // Execute the actual screen priority function; stub unrelated score sources
    // deterministically so this test isolates saving and navigation boundaries.
    const sorted = execute(rankingExpression, {
      rankingSavedIds: ranking.rankingSavedIds, getEventTimeStatusFast: () => 'future', eventTimeContext: {},
      matchesUserInterests: () => false, isProvinceScopeEvent: () => false,
      createLocationKeyFromEvent: () => '', favoriteVenueSet: new Set(), userLocation: null,
      BASE_SCORES: { NON_INTEREST: { future: 1 } }, calculateEngagementTier: (e: typeof records[number]) => e.rankScore,
      FAVORITE_VENUE_BONUS: 0, ENABLE_SORT_PERFORMANCE_ANALYTICS: false,
    }, records);
    const groups = groupVenueFeedEvents(sorted, records);
    return React.createElement('feed', {
      ...ranking, page, liveSavedIds: savedIds, venueOrder: groups.map(group => group.events[0].venue),
    });
  }
  const props = () => tree!.root.findByType('feed' as any).props;
  const mount = (value: Props) => act(() => { tree = renderer.create(<Feed {...value} />); });
  const update = (value: Props) => act(() => tree!.update(<Feed {...value} />));

  it('keeps a deeply scrolled saved venue in place through save acknowledgements and more pagination', () => {
    mount({ savedIds: [] });
    const before = props().venueOrder;
    const snapshot = props().rankingSavedIds;
    update({ savedIds: ['item-82'], page: 30 });
    expect(props().liveSavedIds).toEqual(['item-82']);
    expect(props().venueOrder).toEqual(before);
    expect(props().rankingSavedIds).toBe(snapshot);
    expect(props().rankingRevision).toBe(0);
    update({ savedIds: ['item-82'], page: 70 });
    expect(props().venueOrder).toEqual(before);
    expect(props().rankingRevision).toBe(0);
    act(() => props().refreshSavedRanking());
    expect(props().venueOrder[0]).toBe('Venue 41');
    expect(props().rankingRevision).toBe(1);
    expect(props().refreshing).toBe(true);
    act(() => jest.runOnlyPendingTimers());
    expect(props().refreshing).toBe(false);
  });

  it('captures the latest saves on returning, without resetting layout on unchanged focus or refresh', () => {
    mount({ savedIds: [] });
    update({ savedIds: ['item-82'] });
    mockFocused = false;
    update({ savedIds: ['item-82', 'item-100'] });
    expect(props().rankingSavedIds.size).toBe(0);
    mockFocused = true;
    update({ savedIds: ['item-82', 'item-100'] });
    expect([...props().rankingSavedIds]).toEqual(['item-82', 'item-100']);
    expect(props().venueOrder.slice(0, 2)).toEqual(['Venue 41', 'Venue 50']);
    expect(props().rankingRevision).toBe(1);
    mockFocused = false;
    update({ savedIds: ['item-82', 'item-100'] });
    mockFocused = true;
    update({ savedIds: ['item-100', 'item-82'] });
    expect(props().rankingRevision).toBe(1);
    act(() => props().refreshSavedRanking());
    expect(props().rankingRevision).toBe(1);
  });

  it('keeps unsaving and failed-save rollback live without reordering during browsing', () => {
    mount({ savedIds: ['item-82'] });
    expect(props().venueOrder[0]).toBe('Venue 41');
    update({ savedIds: [] });
    expect(props().liveSavedIds).toEqual([]);
    expect(props().venueOrder[0]).toBe('Venue 41');
    update({ savedIds: ['item-100'] });
    update({ savedIds: [] });
    expect(props().rankingRevision).toBe(0);
    act(() => props().refreshSavedRanking());
    expect(props().venueOrder[0]).toBe('Venue 0');
  });

  it('handles initial preference hydration, new filters and an account reset', () => {
    mount({ savedIds: [], ready: false });
    update({ savedIds: ['item-82'], ready: true });
    expect(props().venueOrder[0]).toBe('Venue 41');
    update({ savedIds: ['item-100'] });
    expect(props().venueOrder[0]).toBe('Venue 41');
    update({ savedIds: ['item-100'], context: 'user-a/today' });
    expect(props().venueOrder[0]).toBe('Venue 50');
    update({ savedIds: [], context: 'guest/today', ready: false });
    expect(props().rankingSavedIds.size).toBe(0);
    expect(props().venueOrder[0]).toBe('Venue 0');
  });

  it('preserves live Saved-only membership in the actual screen filter', () => {
    // Get the first useMemo callback from the AST instead of importing the screen's native integrations.
    const initializer = ts.createSourceFile('filter.tsx', `const result = ${filterExpression};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const statement = initializer.statements[0] as ts.VariableStatement;
    const call = statement.declarationList.declarations[0].initializer as ts.CallExpression;
    const callback = call.arguments[0].getText(initializer);
    const run = (saved: Set<string>) => execute(callback, {
      measureListTabStage: (_tab: unknown, _stage: unknown, _meta: unknown, fn: () => unknown) => fn(),
      isFocusedContentReady: true, viewportEvents: records,
      filterCriteria: { [type === 'event' ? 'eventFilters' : 'specialFilters']: { savedOnly: true } },
      isEventSaved: (e: Event) => saved.has(String(e.id)), doesEventMatchTypeFilters: () => true, eventTimeContext: {},
    });
    expect(run(new Set(['item-82'])).map((e: Event) => e.id)).toEqual(['item-82']);
    expect(run(new Set())).toEqual([]);
  });

  it('cancels the local refresh indicator callback when the feed unmounts', () => {
    mount({ savedIds: [] });
    act(() => props().refreshSavedRanking());
    act(() => tree!.unmount());
    tree = undefined;
    expect(jest.getTimerCount()).toBe(0);
  });
});
