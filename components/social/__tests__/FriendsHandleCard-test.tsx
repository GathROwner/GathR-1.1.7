import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { FriendsHandleCard } from '../FriendsHandleCard';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../ProfileAvatar', () => ({
  ProfileAvatar: () => null,
}));

describe('FriendsHandleCard', () => {
  it('keeps the complete maximum-length handle above two equal action controls', () => {
    const onEdit = jest.fn();
    const onShare = jest.fn();
    const claimedHandle = 'mmmmmmmmmmmmmmmmmmmmmmmm';
    let component: renderer.ReactTestRenderer;

    act(() => {
      component = renderer.create(
        <FriendsHandleCard
          claimedHandle={claimedHandle}
          onEdit={onEdit}
          onShare={onShare}
          profile={{
            uid: 'friends-handle-card-test',
            displayName: 'Craig Burgoyne',
            photoURL: '',
            socialHandle: claimedHandle,
          }}
        />
      );
    });

    const card = component!.root.findByProps({ testID: 'friends-handle-card' });
    const identity = component!.root.findByProps({ testID: 'friends-handle-identity' });
    const actions = component!.root.findByProps({ testID: 'friends-handle-actions' });
    const handle = component!.root.findByProps({ children: `@${claimedHandle}` });
    const share = component!.root.findByProps({ accessibilityLabel: 'Show friend QR code' });
    const edit = component!.root.findByProps({ accessibilityLabel: 'Edit GathR handle' });

    expect(card).toBeTruthy();
    expect(identity.props.style).toEqual(
      expect.objectContaining({ alignItems: 'center', flexDirection: 'row' })
    );
    expect(actions.props.style).toEqual(expect.objectContaining({ flexDirection: 'row' }));
    expect(handle.props.numberOfLines).toBeUndefined();
    expect(share.props.style).toEqual(expect.objectContaining({ flex: 1, minHeight: 40 }));
    expect(edit.props.style).toEqual(expect.objectContaining({ flex: 1, minHeight: 40 }));
    expect(share.props.style).toEqual(edit.props.style);

    act(() => share.props.onPress());
    act(() => edit.props.onPress());
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
