import fs from 'node:fs';
import path from 'node:path';

describe('EventCallout interaction safety invariants', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../EventCallout.tsx'), 'utf8');

  it('does not strand list scrolling behind transient shell responder state', () => {
    expect(source).not.toContain('setScrollEnabled(');
    expect(source).toContain("scrollEnabled={calloutState !== 'minimized'}");
  });

  it('settles an interrupted shell drag instead of leaving its responder state active', () => {
    expect(source).toContain('onPanResponderTerminate');
    expect(source).toContain('event_callout_shell_pan_terminated');
  });
});
