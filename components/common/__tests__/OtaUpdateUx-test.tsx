import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Alert, Animated } from 'react-native';
import OtaSettingsIcon from '../OtaSettingsIcon';
import OtaUpdateStatus from '../OtaUpdateStatus';

let mockStatus = { phase: 'idle', readyId: null as string | null, downloadSequence: 0 };
const mockApply = jest.fn(async () => false);
jest.mock('../../../hooks/useOtaStatus', () => ({ useOtaStatus: () => mockStatus }));
jest.mock('../../../lib/otaUpdates', () => ({ otaUpdates: { apply: () => mockApply() }, wasOtaAttempted: () => false }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');

describe('OTA settings and Profile affordance', () => {
  beforeEach(() => { jest.useFakeTimers(); mockStatus = { phase: 'idle', readyId: null, downloadSequence: 0 }; mockApply.mockClear(); });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });
  const mount = async (component: React.ReactElement) => { let tree!: renderer.ReactTestRenderer; await act(async () => { tree = renderer.create(component); }); return tree; };
  it('shows nothing in Profile when no update exists or while checking', async () => {
    const tree = await mount(<OtaUpdateStatus />); expect(tree.toJSON()).toBeNull();
    mockStatus.phase = 'checking'; await act(async () => tree.update(<OtaUpdateStatus />)); expect(tree.toJSON()).toBeNull();
  });
  it('shows passive downloading, then actionable ready status above unchanged footer', async () => {
    mockStatus.phase = 'downloading'; const tree = await mount(<OtaUpdateStatus />);
    expect(JSON.stringify(tree.toJSON())).toContain('Downloading update');
    const action = tree.root.findAllByProps({ accessibilityLabel: 'Downloading update…' })[0];
    expect(action.props.disabled).toBe(true);
    mockStatus = { phase: 'ready', readyId: 'new', downloadSequence: 1 };
    await act(async () => tree.update(<OtaUpdateStatus />));
    expect(JSON.stringify(tree.toJSON())).toContain('Update now');
    const alert = jest.spyOn(Alert, 'alert');
    await act(async () => { tree.root.findAllByProps({ accessibilityLabel: 'Update now' })[0].props.onPress(); });
    expect(mockApply).toHaveBeenCalledTimes(1); expect(alert).toHaveBeenCalledWith('Update is ready', expect.stringContaining('Finish or save'));
  });
  it('shows a finite paused message after failures', async () => {
    mockStatus.phase = 'error'; const tree = await mount(<OtaUpdateStatus />);
    expect(JSON.stringify(tree.toJSON())).toContain('You can keep using GathR');
  });
  it('retains a ready dot with the ordinary cog and respects Reduce Motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const timing = jest.spyOn(Animated, 'timing');
    mockStatus = { phase: 'downloading', readyId: null, downloadSequence: 1 };
    const tree = await mount(<OtaSettingsIcon size={18} color="#202124" />);
    expect(timing).not.toHaveBeenCalled();
    mockStatus = { phase: 'ready', readyId: 'new', downloadSequence: 1 };
    await act(async () => tree.update(<OtaSettingsIcon size={18} color="#202124" />));
    expect(tree.root.findAllByProps({ testID: 'ota-ready-dot' }).length).toBeGreaterThan(0);
    expect(JSON.stringify(tree.toJSON())).toContain('settings-outline');
  });
  it('runs exactly two short cog/download/cog cycles, then stops', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const timing = jest.spyOn(Animated, 'timing').mockImplementation((() => ({ start: (callback: any) => callback?.({ finished: true }), stop: jest.fn(), reset: jest.fn() })) as any);
    mockStatus = { phase: 'downloading', readyId: null, downloadSequence: 1 };
    const tree = await mount(<OtaSettingsIcon size={18} color="#202124" />);
    await act(async () => { jest.advanceTimersByTime(1800); });
    expect(timing).toHaveBeenCalledTimes(8);
    expect(JSON.stringify(tree.toJSON())).toContain('settings-outline');
    await act(async () => { jest.advanceTimersByTime(60_000); }); expect(timing).toHaveBeenCalledTimes(8);
    await act(async () => tree.unmount());
  });
});
