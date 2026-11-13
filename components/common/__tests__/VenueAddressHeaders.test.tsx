import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

// Exercise the actual single-card JSX and handler without booting each screen's
// map, ads, authentication and data subscriptions (same source harness as feed integration).
function loadHeader(tab: string) {
  const source = fs.readFileSync(path.join(__dirname, '../../../app/(tabs)', `${tab}.tsx`), 'utf8');
  const ast = ts.createSourceFile(`${tab}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let jsx = '', handler = '';
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.getText(ast).includes('style={styles.venueIdentityOverlay}')) jsx = node.getText(ast);
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleVenuePress') handler = node.initializer!.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!jsx || !handler) throw new Error(`Missing actual ${tab} venue disclosure`);
  const code = ts.transpileModule(`const Header = ({ event }) => {
    const [addressExpanded, setAddressExpanded] = React.useState(false);
    const hasVenueAddress = Boolean(event.address?.trim());
    const handleVenuePress = ${handler};
    return ${jsx};
  };`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function('React', 'View', 'TouchableOpacity', 'Text', 'GestureScrollView', 'FallbackImage',
    'VenueFavoriteButton', 'MaterialIcons', 'styles', 'createLocationKeyFromEvent', `${code}; return Header;`)(
    React, View, TouchableOpacity, Text, View, View, () => null, View, {}, () => 'venue');
}

describe.each(['events', 'specials'])('%s actual single-card address header', tab => {
  let tree: renderer.ReactTestRenderer;
  const Header = loadHeader(tab);
  const detail = jest.fn();
  const record = { id: 'one', venue: 'Test Venue', address: '10 Main Street', profileUrl: 'avatar.jpg' };
  const header = () => tree.root.findAllByType(TouchableOpacity).find(node => node.props.accessibilityRole === 'button')!;
  beforeEach(() => {
    detail.mockClear();
    act(() => { tree = renderer.create(<TouchableOpacity onPress={detail}><Header event={record} /></TouchableOpacity>); });
  });
  afterEach(() => act(() => tree.unmount()));

  it('routes avatar, name, blank row area and chevron to one toggle, including repeated taps', () => {
    const targets = [
      () => header().findAllByProps({ fallbackType: 'profile' })[0],
      () => header().findAllByType(Text).find(node => node.props.children === record.venue)!,
      header,
      () => header().findAll(node => node.props.name === 'expand-more' || node.props.name === 'expand-less')[0],
    ];
    for (let tap = 0; tap < 12; tap++) {
      let target = targets[tap % targets.length]();
      while (!target.props.onPress) target = target.parent!;
      const stopPropagation = jest.fn();
      act(() => target.props.onPress({ stopPropagation }));
      expect(stopPropagation).toHaveBeenCalledTimes(1);
      expect(header().props.accessibilityState.expanded).toBe(tap % 2 === 0);
      expect(header().props.accessibilityLabel).toBe(`${tap % 2 ? 'Show' : 'Hide'} venue address for Test Venue`);
      expect(tree.root.findAllByType(Text).some(node => node.props.children === record.address)).toBe(tap % 2 === 0);
      expect(detail).not.toHaveBeenCalled();
    }
    act(() => tree.root.findAllByType(TouchableOpacity)[0].props.onPress());
    expect(detail).toHaveBeenCalledTimes(1);
  });

  it('does not disclose a blank address', () => {
    act(() => tree.update(<Header event={{ ...record, address: ' ' }} />));
    expect(header().props.disabled).toBe(true);
    act(() => header().props.onPress({ stopPropagation: jest.fn() }));
    expect(header().props.accessibilityState.expanded).toBe(false);
  });
});
