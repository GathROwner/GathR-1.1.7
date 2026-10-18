import React from 'react';
import renderer, { act } from 'react-test-renderer';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { useEventPreferenceFlags } from '../useEventPreferenceFlags';
import { useUserPrefsStore } from '../../store/userPrefsStore';

jest.mock('../../store/userPrefsStore', () => {
  const { create } = jest.requireActual('zustand');
  return { useUserPrefsStore: create((set: any) => ({ likedEvents: [], interestedEvents: [], setAll: set })) };
});

let tree: renderer.ReactTestRenderer;
const renders = new Map<string, number>();
function Card({ id }: { id: string }) {
  const flags = useEventPreferenceFlags(id);
  renders.set(id, (renders.get(id) || 0) + 1);
  return React.createElement('card', { id, ...flags });
}
function Cards({ selected = 'event-3' }: { selected?: string }) {
  return <>{Array.from({ length: 12 }, (_, i) => <Card key={i} id={i === 3 ? selected : `event-${i}`} />)}</>;
}
beforeEach(() => {
  useUserPrefsStore.setState({ likedEvents: [], interestedEvents: [] });
  renders.clear();
});
afterEach(() => { if (tree) act(() => tree.unmount()); });

it.each(['likedEvents', 'interestedEvents'] as const)('updates only the affected card for %s and handles rollback', field => {
  act(() => { tree = renderer.create(<Cards />); });
  renders.clear();
  act(() => { useUserPrefsStore.setState({ [field]: ['event-3'] }); });
  expect([...renders.keys()]).toEqual(['event-3']);
  expect(tree.root.findAllByType('card' as any).find(card => card.props.id === 'event-3')!.props[
    field === 'likedEvents' ? 'isHeroLiked' : 'isInterested'
  ]).toBe(true);
  renders.clear();
  act(() => { useUserPrefsStore.setState({ [field]: [] }); });
  expect([...renders.keys()]).toEqual(['event-3']);
});

it('tracks a recycled card ID and sign-out reset without reacting to unrelated choices', () => {
  act(() => { tree = renderer.create(<Cards />); });
  renders.clear();
  act(() => { useUserPrefsStore.setState({ likedEvents: ['not-mounted'] }); });
  expect(renders.size).toBe(0);
  act(() => tree.update(<Cards selected="not-mounted" />));
  expect(tree.root.findAllByType('card' as any).find(card => card.props.id === 'not-mounted')!.props.isHeroLiked).toBe(true);
  renders.clear();
  act(() => { useUserPrefsStore.setState({ likedEvents: [], interestedEvents: [] }); });
  expect([...renders.keys()]).toEqual(['not-mounted']);
});

describe.each(['events', 'specials'])('%s action-time preference snapshot', tab => {
  const source = fs.readFileSync(path.join(__dirname, '../../app/(tabs)', `${tab}.tsx`), 'utf8');
  it.each(['likedEvents', 'interestedEvents'] as const)('preserves another card choice when toggling %s without an intervening render', field => {
    const noun = field === 'likedEvents' ? 'Liked' : 'Interested';
    const begin = source.indexOf(`const previous${noun}Events =`);
    const endMarker = `setUserPrefs({ ${field}: next${noun}Events });`;
    const end = source.indexOf(endMarker, begin);
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    const code = ts.transpileModule(source.slice(begin, end + endMarker.length), {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    // Execute the actual screen's optimistic-update statements, not a mirrored handler.
    const action = new Function('useUserPrefsStore', 'setUserPrefs', 'eventIdString', 'isHeroLiked', 'isInterested', code);
    useUserPrefsStore.setState({ [field]: ['another-card'] });
    action(useUserPrefsStore, useUserPrefsStore.getState().setAll, 'this-card', false, false);
    expect(useUserPrefsStore.getState()[field]).toEqual(['another-card', 'this-card']);
    action(useUserPrefsStore, useUserPrefsStore.getState().setAll, 'this-card', true, true);
    expect(useUserPrefsStore.getState()[field]).toEqual(['another-card']);
  });
});
