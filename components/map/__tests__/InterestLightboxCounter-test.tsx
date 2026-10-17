import React from 'react';
import renderer, { act } from 'react-test-renderer';
import InterestLightboxCounter from '../InterestLightboxCounter';

it('renders the persistent exact event position independently of gallery media, and updates on navigation', () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<InterestLightboxCounter index={4} count={5} />); });
  expect(tree.root.findByProps({ accessibilityLabel: 'Event 5 of 5' })).toBeTruthy();
  expect(tree.root.findByProps({ testID: 'interest-lightbox-event-position' }).props.pointerEvents).toBe('none');
  act(() => tree.update(<InterestLightboxCounter index={0} count={2} />));
  expect(tree.root.findByProps({ accessibilityLabel: 'Event 1 of 2' })).toBeTruthy();
  act(() => tree.update(<InterestLightboxCounter index={2} count={2} />)); expect(tree.toJSON()).toBeNull();
  act(() => tree.unmount());
});
