import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import RouteFeatureCallout from '../RouteFeatureCallout';

describe('RouteFeatureCallout', () => {
  it('shows route evidence and closes from the accessible button', () => {
    const onClose = jest.fn();
    let component: renderer.ReactTestRenderer;

    act(() => {
      component = renderer.create(
        <RouteFeatureCallout
          data={{
            featureType: 'stop',
            id: 'cornwall-civic-centre',
            title: 'Start and finish — Cornwall Civic Centre',
            statusLabel: 'Confirmed start and finish',
            coordinate: { longitude: -63.216882, latitude: 46.23067 },
            locationText: '29 Cornwall Road, Cornwall, PE',
            description: 'Shared start and finish for the 5K route.',
            sourceLabel: 'Official organizer course map',
          }}
          placement="above"
          onClose={onClose}
        />
      );
    });

    const text = component!.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .flat(Infinity)
      .join(' ');
    expect(text).toContain('Confirmed start and finish');
    expect(text).toContain('29 Cornwall Road, Cornwall, PE');
    expect(text).toContain('Official organizer course map');

    act(() => {
      component!.root
        .findByProps({ accessibilityLabel: 'Close route detail' })
        .props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => component!.unmount());
  });
});
