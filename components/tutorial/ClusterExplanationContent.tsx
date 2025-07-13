import React from 'react';
import { View, Text } from 'react-native';
import { IconLegendDemo } from './TutorialDemoComponents';

export const ClusterExplanationContent: React.FC = () => (
  <View>
    <Text style={{ marginBottom: 10 }}>
      These numbered circles contain information about Events and Specials.
    </Text>
    <IconLegendDemo />
  </View>
);