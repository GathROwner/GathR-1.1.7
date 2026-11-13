import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Animated, View } from 'react-native';
import fs from 'node:fs';
import path from 'node:path';

// Mock only the unavailable native bridge, not the installed legacy handler.
jest.mock('react-native-gesture-handler/lib/commonjs/RNGestureHandlerModule', () => ({
  __esModule: true,
  default: require('react-native-gesture-handler/lib/commonjs/mocks/mocks').default,
}));
const { PanGestureHandler } = jest.requireActual(
  'react-native-gesture-handler/lib/commonjs/handlers/PanGestureHandler',
);
const { parse } = require('@babel/parser');
const { transformFromAstSync } = require('@babel/core');
const t = require('@babel/types');

const nativeEvent = (axis: 'translationX' | 'translationY') => Animated.event(
  [{ nativeEvent: { [axis]: new Animated.Value(0) } }], { useNativeDriver: true },
);

/** Render the actual production JSX wiring, replacing only list contents. */
function productionGestureTree(calloutState: string) {
  const source = fs.readFileSync(path.resolve(__dirname, '../EventCallout.tsx'), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  let outer: any;
  function walk(node: any) {
    if (!node || typeof node !== 'object' || outer) return;
    if (node.type === 'JSXElement' && node.openingElement.name.name === 'PanGestureHandler' &&
      node.openingElement.attributes.some((a: any) => a.name?.name === 'ref' && a.value?.expression?.name === 'browsePanRef')) {
      outer = t.cloneNode(node, true); return;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk); else walk(value);
    }
  }
  walk(ast);
  if (!outer) throw new Error('Callout browse handler not found');
  function trimList(node: any) {
    if (node.type === 'JSXElement' && node.openingElement.name.name === 'ScrollView') {
      return t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('View'), [], true), null, [], true);
    }
    if (node.children) node.children = node.children.map(trimList);
    return node;
  }
  trimList(outer);
  const program = t.file(t.program([t.expressionStatement(outer)]));
  const code = transformFromAstSync(program, undefined, {
    babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
  const noop = () => {};
  const context = {
    React, PanGestureHandler, Animated, View,
    browsePanRef: React.createRef(), dismissPanRef: React.createRef(), scrollViewRef: React.createRef(),
    canSwipeBrowse: true, calloutState, isLightboxOpen: false,
    browseSwipe: { onGestureEvent: nativeEvent('translationX'), onStateChange: noop, translateX: new Animated.Value(0) },
    pullDismiss: { onGestureEvent: nativeEvent('translationY'), onStateChange: noop, isClosing: false },
  };
  return new Function(...Object.keys(context), 'return ' + code)(...Object.values(context));
}

describe('real legacy native-driver callout handler mount', () => {
  let errors: jest.SpyInstance;
  beforeEach(() => { errors = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { errors.mockRestore(); });

  it('reproduces the released direct-nesting error in the installed handler', () => {
    expect(() => act(() => { renderer.create(
      <PanGestureHandler onGestureEvent={nativeEvent('translationX')}>
        <PanGestureHandler onGestureEvent={nativeEvent('translationY')}>
          <Animated.View />
        </PanGestureHandler>
      </PanGestureHandler>,
    ); })).toThrow('Nesting touch handlers with native animated driver is not supported yet');
  });

  it.each(['expanded', 'minimized'])('mounts and unmounts the production %s wiring repeatedly', state => {
    for (let i = 0; i < 5; i += 1) {
      let tree: renderer.ReactTestRenderer;
      expect(() => act(() => { tree = renderer.create(productionGestureTree(state)); })).not.toThrow();
      act(() => tree!.unmount());
    }
  });
});