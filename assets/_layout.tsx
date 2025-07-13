import { Tabs } from 'expo-router';
// Optional: import an icon library if you want tab icons
import { MaterialIcons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
      }}
    >
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="event" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="map" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="specials"
        options={{
          title: 'Specials',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="local-offer" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}