import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { PuckDiagnostics } from '../PuckDiagnostics';
import { observePuck, puckDiagnosticSnapshot, stopPuckDiagnostics } from '../../utils/puckDiagnostics';

describe('deliberate local diagnostic controls', () => {
  let tree: renderer.ReactTestRenderer;
  let appState: (value: AppStateStatus) => void;
  const props = { bottom: 40, focused: true, permission: true, zoom: 8, blocked: false, width: 390, height: 844 };
  beforeEach(() => {
    jest.useFakeTimers(); stopPuckDiagnostics();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { appState = listener; return { remove: jest.fn() }; });
    act(() => { tree = renderer.create(<PuckDiagnostics {...props} />); });
  });
  afterEach(() => { act(() => tree.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
  const entry = () => tree.root.findByProps({ testID: 'puck-diagnostics-entry' });
  it('has no ordinary tap action, and opening does not trigger a placement attempt', () => {
    expect(entry().props.onPress).toBeUndefined(); expect(puckDiagnosticSnapshot().active).toBe(false);
    act(() => entry().props.onLongPress()); expect(puckDiagnosticSnapshot()).toMatchObject({ active: true, attempts: 0 });
    act(() => tree.root.findByProps({ testID: 'puck-diagnostics-toggle' }).props.onPress());
    expect(tree.toJSON()).toBeTruthy();
    act(() => { observePuck('attempt'); jest.advanceTimersByTime(250); });
    expect(puckDiagnosticSnapshot().attempts).toBe(1);
    act(() => tree.root.findByProps({ testID: 'puck-diagnostics-stop' }).props.onPress()); expect(puckDiagnosticSnapshot().rows).toEqual([]);
  });
  it('supports accessibility activation/escape and clears on background, blur and unmount', () => {
    act(() => entry().props.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } }));
    expect(puckDiagnosticSnapshot().active).toBe(true);
    act(() => tree.root.findByProps({ testID: 'puck-diagnostics-panel' }).props.onAccessibilityEscape()); expect(puckDiagnosticSnapshot().active).toBe(false);
    act(() => entry().props.onLongPress()); act(() => appState('background')); expect(puckDiagnosticSnapshot().active).toBe(false);
    act(() => entry().props.onLongPress()); act(() => tree.update(<PuckDiagnostics {...props} focused={false} />)); expect(puckDiagnosticSnapshot().active).toBe(false);
    act(() => tree.update(<PuckDiagnostics {...props} />)); act(() => entry().props.onLongPress()); act(() => tree.unmount()); expect(puckDiagnosticSnapshot().active).toBe(false);
  });
});
