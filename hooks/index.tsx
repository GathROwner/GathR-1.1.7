import React from 'react';
import { Redirect } from 'expo-router';
import { Stack } from 'expo-router';

export default function Index() {
  return (
    <React.Fragment>
      <Stack.Screen options={{ headerShown: false }} />
      <Redirect href="/(tabs)/map" />
    </React.Fragment>
  );
}